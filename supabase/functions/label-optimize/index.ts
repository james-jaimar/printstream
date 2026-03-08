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
  qty_per_roll?: number;
  label_width_mm?: number;
  label_height_mm?: number;
}

interface AISlotAssignment {
  item_id: string;
  quantity_in_slot: number;
}

interface AITradeOffs {
  blank_slots_available?: number;
  blank_slot_note?: string;
  roll_size_note?: string;
  overrun_warnings?: string[];
}

interface AIRun {
  slot_assignments: AISlotAssignment[];
  reasoning: string;
}

interface AILayout {
  runs: AIRun[];
  overall_reasoning: string;
  estimated_waste_percent: number;
  trade_offs?: AITradeOffs;
}

function calcLabelsPerSlotPerFrame(dieline: Dieline): number {
  const MAX_FRAME_LENGTH_MM = 960;
  const bleedVertical = (dieline.bleed_top_mm || 0) + (dieline.bleed_bottom_mm || 0);
  const templateHeightMm = dieline.label_height_mm * dieline.rows_around +
    (dieline.vertical_gap_mm || 0) * (dieline.rows_around - 1) +
    bleedVertical;
  const templatesPerFrame = Math.max(1, Math.floor(MAX_FRAME_LENGTH_MM / templateHeightMm));
  return dieline.rows_around * templatesPerFrame;
}

function validateAILayout(
  layout: AILayout,
  items: LabelItem[],
  totalSlots: number,
  labelsPerSlotPerFrame: number,
  maxOverrun: number
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  for (let i = 0; i < layout.runs.length; i++) {
    const run = layout.runs[i];
    if (run.slot_assignments.length !== totalSlots) {
      warnings.push(`Run ${i + 1}: has ${run.slot_assignments.length} slots, expected ${totalSlots}`);
    }
  }

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
    if (assigned > 0 && assigned < item.quantity) {
      const shortfall = item.quantity - assigned;
      if (shortfall > maxOverrun) {
        warnings.push(`Item "${item.name}": only assigned ${assigned} of ${item.quantity} (short by ${shortfall})`);
      }
    }
    if (assigned > item.quantity + maxOverrun * totalSlots) {
      warnings.push(`Item "${item.name}": over-assigned ${assigned} vs requested ${item.quantity}`);
    }
  }

  for (let i = 0; i < layout.runs.length; i++) {
    const run = layout.runs[i];
    const maxSlotQty = Math.max(...run.slot_assignments.map(s => s.quantity_in_slot));
    const frames = Math.ceil(maxSlotQty / labelsPerSlotPerFrame);
    const actualPerSlot = frames * labelsPerSlotPerFrame;

    for (const slot of run.slot_assignments) {
      if (slot.quantity_in_slot > 0) {
        const overrun = actualPerSlot - slot.quantity_in_slot;
        if (overrun > maxOverrun) {
          warnings.push(`Run ${i + 1}: slot for item ${slot.item_id} overrun ${overrun} > max ${maxOverrun}`);
        }
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
    const { items, dieline, constraints, qty_per_roll, label_width_mm, label_height_mm }: OptimizeRequest = await req.json();

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

    // Derive roll size context
    const lw = label_width_mm || dieline.label_width_mm;
    const lh = label_height_mm || dieline.label_height_mm;
    const labelArea = lw * lh;
    let rollSizeContext = '';
    if (qty_per_roll) {
      rollSizeContext = `\nROLL SIZE: Customer requires ${qty_per_roll} labels per output roll. Factor this into your layout.`;
    } else {
      const suggestedQpr = labelArea < 2500 ? 1000 : labelArea < 10000 ? 500 : 250;
      rollSizeContext = `\nROLL SIZE: No qty_per_roll specified. Based on label dimensions (${lw}×${lh}mm), a sensible default would be ~${suggestedQpr}/roll. Include a roll_size_note in your trade_offs suggesting this.`;
    }

    const systemPrompt = `You are an expert print production optimizer for HP Indigo digital label printing on rolls.

STRATEGY — EQUAL-QUANTITY RUNS (CRITICAL):
Your PRIMARY goal is to create runs where ALL slots print the SAME quantity_in_slot.
This eliminates intra-run overrun entirely (every slot uses the full run length).

HOW TO ACHIEVE THIS:
1. List every item and its ordered quantity.
2. Find natural "quantity levels" — groups of up to ${totalSlots} items (or item-portions) that share the same quantity.
3. For each level, create a run where every slot has quantity_in_slot = that level's quantity.
4. Large items are SPLIT across multiple runs. E.g. an item needing 6300 labels might contribute 2650 to one run, 2650 to another, and 1000 to a third.
5. Small items may be BUMPED UP slightly (e.g. 150 → 300) if doing so fills a run cleanly and the extra labels are acceptable.
6. A slot may have quantity_in_slot = 0 (blank) if fewer items than slots remain at that level. Use the same item_id as another slot in the run.
7. The sum of all quantity_in_slot values for each item across ALL runs must be >= the ordered quantity.

BLANK SLOT STRATEGY (IMPORTANT):
- If placing an item in a slot via round-robin would cause overrun > ${maxOverrun} labels, LEAVE THE SLOT BLANK (quantity_in_slot = 0) instead.
- Blank slots are VALUABLE — the operator can fill them with internal labels, test prints, or another customer's short job.
- When you create blank slots, note how many in the trade_offs.blank_slots_available field and add a helpful note in trade_offs.blank_slot_note.
- It is ALWAYS better to have blank slots than to violate the overrun constraint.

OVERRUN CONSTRAINT (CRITICAL — HARD LIMIT):
- Maximum acceptable overrun per slot: ${maxOverrun} labels
- Overrun = (frames × ${labelsPerSlotPerFrame}) − quantity_in_slot
- NEVER create a run where any slot's overrun exceeds ${maxOverrun}
- If items cannot be ganged within this limit, either split them to separate runs OR leave remaining slots blank
- This is a HARD constraint — do not violate it under any circumstances
${rollSizeContext}

MACHINE SPECIFICATIONS:
- Available slots (columns across): ${totalSlots}
- Labels per slot per frame: ${labelsPerSlotPerFrame}
- Labels per frame (all slots): ${labelsPerFrame}

CRITICAL PRODUCTION RULES:
1. EVERY slot must be accounted for — either with an item assignment or as a blank (qty=0).
2. The run length (number of frames) is determined by the slot with the HIGHEST quantity_in_slot.
   All slots print for the same length. Actual output per slot = frames × ${labelsPerSlotPerFrame}.
3. Quantities CAN and SHOULD be split across multiple runs when it reduces waste.
4. Gang items with SIMILAR quantities together to minimize waste.
5. When items are duplicated across slots via round-robin, divide their quantity by the number of slots they occupy.

QUANTITY SPLITTING:
- You MAY split a single item's total quantity across multiple runs.
- The total quantity_in_slot for each item across ALL runs must equal or slightly exceed the ordered quantity.
- Splitting is especially useful when an item's quantity is much larger than others.

TRADE-OFF THINKING:
Think creatively about the layout. Consider:
- Is it better to leave 2 blank slots than to create 800 overrun on a small-quantity item?
- Could the operator use blank slots for internal labels?
- If qty_per_roll isn't set, what would be a practical suggestion based on label size?
- Surface your reasoning in the trade_offs object so the operator can make informed decisions.

YOU MUST return actual run layouts with specific slot assignments using the create_layout tool.
Each run must have EXACTLY ${totalSlots} slot_assignments.
Use the actual item IDs provided below.

REMEMBER: The single most important rule is that ALL slots within a run should have the SAME quantity_in_slot value. The second most important rule is NEVER exceed the ${maxOverrun}-label overrun limit.

ITEMS TO ASSIGN (use these exact IDs):
${items.map(i => `- ID: "${i.id}" | Name: "${i.name}" | Quantity: ${i.quantity}`).join('\n')}`;

    const userPrompt = `Create the optimal production layout for this order.

Total labels needed: ${totalLabels.toLocaleString()}
Available slots per frame: ${totalSlots}
Labels per slot per frame: ${labelsPerSlotPerFrame}
Max overrun per slot: ${maxOverrun}
${qty_per_roll ? `Qty per roll: ${qty_per_roll}` : 'Qty per roll: not specified (suggest one)'}
Label dimensions: ${lw}×${lh}mm

${constraints?.rush_job ? 'RUSH JOB — prioritize speed (fewer runs).' : ''}
${constraints?.prefer_ganging ? 'Customer prefers ganging multiple items per run where possible.' : ''}

Return the complete layout using the create_layout tool with actual item IDs and quantities. Include trade_offs with blank slot counts and any roll size suggestions.`;

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
                                description: "How many labels this slot needs to print. Use 0 for blank slots."
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
                  },
                  trade_offs: {
                    type: "object",
                    description: "Trade-off suggestions and notes for the operator",
                    properties: {
                      blank_slots_available: {
                        type: "number",
                        description: "Total number of blank (qty=0) slots across all runs"
                      },
                      blank_slot_note: {
                        type: "string",
                        description: "Note about blank slots, e.g. 'Use for internal labels or another job'"
                      },
                      roll_size_note: {
                        type: "string",
                        description: "Suggestion about qty_per_roll if not specified"
                      },
                      overrun_warnings: {
                        type: "array",
                        items: { type: "string" },
                        description: "Per-slot warnings about overrun approaching limits"
                      }
                    },
                    additionalProperties: false
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
