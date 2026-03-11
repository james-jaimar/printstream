/**
 * Label Layout Optimizer — AI Edge Function
 * 
 * Physics-focused prompt, single AI call, no post-processing.
 * Returns raw AI layout + validation warnings for human review.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LabelItem {
  id: string;
  name: string;
  quantity: number;
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

function calcLabelsPerSlotPerFrame(dieline: Dieline): number {
  const MAX_FRAME_LENGTH_MM = 960;
  const bleedVertical = (dieline.bleed_top_mm || 0) + (dieline.bleed_bottom_mm || 0);
  const templateHeightMm = dieline.label_height_mm * dieline.rows_around +
    (dieline.vertical_gap_mm || 0) * (dieline.rows_around - 1) +
    bleedVertical;
  const templatesPerFrame = Math.max(1, Math.floor(MAX_FRAME_LENGTH_MM / templateHeightMm));
  return dieline.rows_around * templatesPerFrame;
}

function validateLayout(
  layout: any,
  items: LabelItem[],
  totalSlots: number,
  labelsPerSlotPerFrame: number,
  maxOverrun: number
): string[] {
  const warnings: string[] = [];

  // Check every item is assigned
  const itemTotals = new Map<string, number>();
  for (const run of layout.runs) {
    if (run.slot_assignments.length !== totalSlots) {
      warnings.push(`Run has ${run.slot_assignments.length} slots, expected ${totalSlots}`);
    }
    for (const slot of run.slot_assignments) {
      if (slot.item_id && slot.quantity_in_slot > 0) {
        itemTotals.set(slot.item_id, (itemTotals.get(slot.item_id) || 0) + slot.quantity_in_slot);
      }
    }
  }

  for (const item of items) {
    const assigned = itemTotals.get(item.id) || 0;
    if (assigned === 0) {
      warnings.push(`MISSING: Item "${item.name}" (${item.id}) not assigned to any run`);
    } else if (assigned < item.quantity) {
      const shortfall = item.quantity - assigned;
      warnings.push(`Item "${item.name}": only assigned ${assigned} of ${item.quantity} (short by ${shortfall})`);
    }
  }

  // Check overrun per slot
  for (let i = 0; i < layout.runs.length; i++) {
    const run = layout.runs[i];
    const maxSlotQty = Math.max(...run.slot_assignments.map((s: any) => s.quantity_in_slot));
    const frames = Math.ceil(maxSlotQty / labelsPerSlotPerFrame);
    const actualPerSlot = frames * labelsPerSlotPerFrame;

    for (const slot of run.slot_assignments) {
      if (slot.quantity_in_slot > 0) {
        const overrun = actualPerSlot - slot.quantity_in_slot;
        if (overrun > maxOverrun) {
          warnings.push(`Run ${i + 1}: slot "${slot.item_id}" overrun ${overrun} > max ${maxOverrun}`);
        }
      }
    }
  }

  return warnings;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { items, dieline, max_overrun = 250, qty_per_roll } = await req.json();

    if (!items?.length) {
      return new Response(JSON.stringify({ error: "No items provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const totalSlots = dieline.columns_across;
    const labelsPerSlotPerFrame = calcLabelsPerSlotPerFrame(dieline);
    const totalLabels = items.reduce((sum: number, i: LabelItem) => sum + i.quantity, 0);

    console.log(`[label-optimize] ${items.length} items, ${totalLabels} labels, ${totalSlots} slots, ${labelsPerSlotPerFrame} labels/slot/frame`);

    const systemPrompt = `You are a production planner for an HP Indigo roll label press.

PHYSICS:
- The press has ${totalSlots} slots across the roll. All ${totalSlots} slots print simultaneously.
- One frame produces ${labelsPerSlotPerFrame} labels per slot.
- A run's length = ceil(highest_slot_qty / ${labelsPerSlotPerFrame}) frames.
- EVERY slot in that run produces frames × ${labelsPerSlotPerFrame} labels — even slots that need fewer.
- Overrun = actual_produced − requested. MAX OVERRUN: ${max_overrun} labels per slot. HARD LIMIT.

RULES:
1. EVERY item MUST be assigned. Missing items = FAILURE. Double-check your output.
2. Items with similar quantities can share a run across multiple slots.
3. Items with very different quantities MUST be in separate runs (otherwise small-qty slots get massive overrun).
4. Spread each item across multiple slots: qty_per_slot = ceil(item_qty / num_slots_for_item).
5. Each run MUST have EXACTLY ${totalSlots} slot_assignments. Use item_id="" and quantity_in_slot=0 for blank/empty slots.
6. Minimize blank slots — each wastes ${Math.round(100 / totalSlots)}% of material per frame.
7. Minimize total number of runs — each costs ~20 min setup time.
${qty_per_roll ? `8. Customer wants ${qty_per_roll} labels per output roll. Note in trade_offs if slot output doesn't match.` : ''}

ITEMS TO ASSIGN (use these EXACT IDs — do NOT modify or skip any):
${items.map((i: LabelItem) => `- ID: "${i.id}" | Name: "${i.name}" | Qty: ${i.quantity.toLocaleString()}`).join('\n')}

BEFORE RETURNING: Verify that EVERY item ID from the list above appears in at least one slot_assignment with quantity_in_slot > 0.

Return your layout via the create_layout tool.`;

    const tools = [{
      type: "function",
      function: {
        name: "create_layout",
        description: "Create production layout with run assignments",
        parameters: {
          type: "object",
          properties: {
            runs: {
              type: "array",
              description: `Array of runs. Each MUST have exactly ${totalSlots} slot_assignments.`,
              items: {
                type: "object",
                properties: {
                  slot_assignments: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        item_id: { type: "string", description: "Item ID or empty string for blank slot" },
                        quantity_in_slot: { type: "number", description: "Labels needed. 0 for blank slots." }
                      },
                      required: ["item_id", "quantity_in_slot"],
                      additionalProperties: false
                    }
                  },
                  reasoning: { type: "string", description: "Why this run is configured this way" }
                },
                required: ["slot_assignments", "reasoning"],
                additionalProperties: false
              }
            },
            overall_reasoning: { type: "string", description: "Overall layout strategy explanation" },
            estimated_waste_percent: { type: "number", description: "Estimated waste %" },
            trade_offs: {
              type: "object",
              properties: {
                blank_slots_available: { type: "number" },
                blank_slot_note: { type: "string" },
                roll_size_note: { type: "string" },
                overrun_warnings: { type: "array", items: { type: "string" } }
              },
              additionalProperties: false
            }
          },
          required: ["runs", "overall_reasoning", "estimated_waste_percent"],
          additionalProperties: false
        }
      }
    }];

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
          { role: "user", content: `Plan the layout for ${items.length} items, ${totalLabels.toLocaleString()} total labels, ${totalSlots} slots. Max overrun: ${max_overrun}. Think step by step.` }
        ],
        tools,
        tool_choice: { type: "function", function: { name: "create_layout" } }
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const errorText = await response.text();
      console.error("AI gateway error:", status, errorText);
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("AI returned no tool call");
      return new Response(JSON.stringify({ error: "AI returned no layout" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let layout: any;
    try {
      layout = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse AI response:", e);
      return new Response(JSON.stringify({ error: "Failed to parse AI layout" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Validate — warnings only, no auto-correction
    const warnings = validateLayout(layout, items, totalSlots, labelsPerSlotPerFrame, max_overrun);
    
    if (warnings.length > 0) {
      console.warn("AI layout warnings:", warnings);
    }

    console.log(`[label-optimize] Success: ${layout.runs.length} runs, ${warnings.length} warnings`);

    return new Response(JSON.stringify({
      success: true,
      layout,
      warnings,
      metadata: {
        items_count: items.length,
        total_labels: totalLabels,
        available_slots: totalSlots,
        labels_per_slot_per_frame: labelsPerSlotPerFrame,
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("label-optimize error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Optimization failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
