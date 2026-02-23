import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LabelItem {
  id: string;
  name: string;
  quantity: number;
  width_mm?: number;
  height_mm?: number;
}

interface Dieline {
  columns_across: number;
  rows_around: number;
  label_width_mm: number;
  label_height_mm: number;
  roll_width_mm: number;
  vertical_gap_mm?: number;
  bleed_top_mm?: number;
  bleed_bottom_mm?: number;
}

interface OptimizeRequest {
  items: LabelItem[];
  dieline: Dieline;
  constraints?: {
    max_runs?: number;
    prefer_ganging?: boolean;
    rush_job?: boolean;
    max_overrun?: number;
  };
}

interface AISlotAssignment {
  item_id: string;
  quantity_in_slot: number;
}

interface AIRun {
  slot_assignments: AISlotAssignment[];
  reasoning: string;
}

interface AILayout {
  runs: AIRun[];
  overall_reasoning: string;
  estimated_waste_percent: number;
}

/**
 * Calculate labelsPerSlotPerFrame server-side for accurate prompting
 */
function calcLabelsPerSlotPerFrame(dieline: Dieline): number {
  const MAX_FRAME_LENGTH_MM = 960;
  const bleedVertical = (dieline.bleed_top_mm || 0) + (dieline.bleed_bottom_mm || 0);
  const templateHeightMm = dieline.label_height_mm * dieline.rows_around +
    (dieline.vertical_gap_mm || 0) * (dieline.rows_around - 1) +
    bleedVertical;
  const templatesPerFrame = Math.max(1, Math.floor(MAX_FRAME_LENGTH_MM / templateHeightMm));
  return dieline.rows_around * templatesPerFrame;
}

/**
 * Validate AI output:
 * - Every run has exactly totalSlots assignments
 * - All item quantities accounted for (no dropped items, no over-allocation)
 * - Per-slot overrun within maxOverrun
 */
function validateAILayout(
  layout: AILayout,
  items: LabelItem[],
  totalSlots: number,
  labelsPerSlotPerFrame: number,
  maxOverrun: number
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Check slot counts
  for (let i = 0; i < layout.runs.length; i++) {
    const run = layout.runs[i];
    if (run.slot_assignments.length !== totalSlots) {
      warnings.push(`Run ${i + 1}: has ${run.slot_assignments.length} slots, expected ${totalSlots}`);
    }
  }

  // Check all items are accounted for
  const itemTotals = new Map<string, number>();
  for (const run of layout.runs) {
    for (const slot of run.slot_assignments) {
      itemTotals.set(slot.item_id, (itemTotals.get(slot.item_id) || 0) + slot.quantity_in_slot);
    }
  }

  for (const item of items) {
    const assigned = itemTotals.get(item.id) || 0;
    if (assigned === 0) {
      warnings.push(`Item "${item.name}" (${item.id}) not assigned to any run`);
    }
    // Allow some tolerance for rounding but flag large discrepancies
    if (assigned > 0 && Math.abs(assigned - item.quantity) > maxOverrun) {
      warnings.push(`Item "${item.name}": assigned ${assigned} vs requested ${item.quantity} (diff ${assigned - item.quantity})`);
    }
  }

  // Check overrun per slot per run
  for (let i = 0; i < layout.runs.length; i++) {
    const run = layout.runs[i];
    const maxSlotQty = Math.max(...run.slot_assignments.map(s => s.quantity_in_slot));
    const frames = Math.ceil(maxSlotQty / labelsPerSlotPerFrame);
    const actualPerSlot = frames * labelsPerSlotPerFrame;

    for (const slot of run.slot_assignments) {
      const overrun = actualPerSlot - slot.quantity_in_slot;
      if (overrun > maxOverrun) {
        warnings.push(`Run ${i + 1}: slot for item ${slot.item_id} overrun ${overrun} > max ${maxOverrun}`);
      }
    }
  }

  return { valid: warnings.length === 0, warnings };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { items, dieline, constraints }: OptimizeRequest = await req.json();

    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "No items provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const totalSlots = dieline.columns_across;
    const labelsPerSlotPerFrame = calcLabelsPerSlotPerFrame(dieline);
    const labelsPerFrame = totalSlots * labelsPerSlotPerFrame;
    const totalLabels = items.reduce((sum, i) => sum + i.quantity, 0);
    const maxOverrun = constraints?.max_overrun ?? 250;

    const systemPrompt = `You are an expert print production optimizer for HP Indigo digital label printing on rolls.

CRITICAL PRODUCTION RULES:
1. EVERY slot (column) in a frame MUST be filled. No empty slots allowed.
   - If there are ${totalSlots} slots and only 3 items, duplicate items across remaining slots using round-robin.
   - A single-item run fills ALL ${totalSlots} slots with the same artwork.
2. The run length (number of frames) is determined by the slot with the HIGHEST quantity_in_slot.
   All slots print for the same length. The actual output per slot = frames × ${labelsPerSlotPerFrame}.
3. Quantities CAN and SHOULD be split across multiple runs when it reduces waste.
4. Gang items with SIMILAR quantities together to minimize waste.
5. When items are duplicated across slots via round-robin, divide their quantity by the number of slots they occupy.

OVERRUN CONSTRAINT (CRITICAL):
- Maximum acceptable overrun per slot: ${maxOverrun} labels
- Overrun = (frames × ${labelsPerSlotPerFrame}) − quantity_in_slot
- Never create a run where any slot's overrun exceeds ${maxOverrun}
- If items cannot be ganged within this limit, put them on separate runs

MACHINE SPECIFICATIONS:
- Available slots (columns across): ${totalSlots}
- Labels per slot per frame: ${labelsPerSlotPerFrame}
- Labels per frame (all slots): ${labelsPerFrame}

YOU MUST return actual run layouts with specific slot assignments using the create_layout tool.
Each run must have EXACTLY ${totalSlots} slot_assignments.
Use the actual item IDs provided below.
The quantity_in_slot is how many labels that slot needs to print (before frame rounding).
If an item appears in multiple slots (round-robin), divide its total quantity by the number of slots it occupies.

ITEMS TO ASSIGN (use these exact IDs):
${items.map(i => `- ID: "${i.id}" | Name: "${i.name}" | Quantity: ${i.quantity}`).join('\n')}`;

    const userPrompt = `Create the optimal production layout for this order.

Total labels needed: ${totalLabels.toLocaleString()}
Available slots per frame: ${totalSlots}
Labels per slot per frame: ${labelsPerSlotPerFrame}
Max overrun per slot: ${maxOverrun}

${constraints?.rush_job ? 'RUSH JOB — prioritize speed (fewer runs).' : ''}
${constraints?.prefer_ganging ? 'Customer prefers ganging multiple items per run where possible.' : ''}

Return the complete layout using the create_layout tool with actual item IDs and quantities.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_layout",
              description: "Create an optimal production layout with specific run assignments",
              parameters: {
                type: "object",
                properties: {
                  runs: {
                    type: "array",
                    description: `Array of production runs. Each run must have exactly ${totalSlots} slot_assignments.`,
                    items: {
                      type: "object",
                      properties: {
                        slot_assignments: {
                          type: "array",
                          description: `Exactly ${totalSlots} slot assignments for this run`,
                          items: {
                            type: "object",
                            properties: {
                              item_id: {
                                type: "string",
                                description: "The actual item ID from the input list"
                              },
                              quantity_in_slot: {
                                type: "number",
                                description: "How many labels this slot needs to print"
                              }
                            },
                            required: ["item_id", "quantity_in_slot"],
                            additionalProperties: false
                          }
                        },
                        reasoning: {
                          type: "string",
                          description: "Brief explanation for this run's configuration"
                        }
                      },
                      required: ["slot_assignments", "reasoning"],
                      additionalProperties: false
                    }
                  },
                  overall_reasoning: {
                    type: "string",
                    description: "Overall explanation of the layout strategy"
                  },
                  estimated_waste_percent: {
                    type: "number",
                    description: "Estimated material waste percentage"
                  }
                },
                required: ["runs", "overall_reasoning", "estimated_waste_percent"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "create_layout" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI optimization failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await response.json();

    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    let layout: AILayout | null = null;

    if (toolCall?.function?.arguments) {
      try {
        layout = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("Failed to parse AI layout:", e);
      }
    }

    // Validate the AI output
    let validation = { valid: false, warnings: ["No layout returned from AI"] };
    if (layout) {
      validation = validateAILayout(layout, items, totalSlots, labelsPerSlotPerFrame, maxOverrun);
      if (!validation.valid) {
        console.warn("AI layout validation warnings:", validation.warnings);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        layout,
        validation,
        metadata: {
          items_count: items.length,
          total_labels: totalLabels,
          available_slots: totalSlots,
          labels_per_frame: labelsPerFrame,
          labels_per_slot_per_frame: labelsPerSlotPerFrame,
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("label-optimize error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Optimization failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
