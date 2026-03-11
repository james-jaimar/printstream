/**
 * Label Layout Optimizer — AI Edge Function
 * 
 * Physics-focused prompt with explicit self-check algorithm.
 * Single retry with concrete violation feedback if overrun limit breached.
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

interface ValidationResult {
  warnings: string[];
  overrunViolations: string[];
  missingItems: string[];
}

function validateLayout(
  layout: any,
  items: LabelItem[],
  totalSlots: number,
  labelsPerSlotPerFrame: number,
  maxOverrun: number
): ValidationResult {
  const warnings: string[] = [];
  const overrunViolations: string[] = [];
  const missingItems: string[] = [];

  // Check every item is assigned
  const itemTotals = new Map<string, number>();
  for (let i = 0; i < layout.runs.length; i++) {
    const run = layout.runs[i];
    if (run.slot_assignments.length !== totalSlots) {
      warnings.push(`Run ${i + 1} has ${run.slot_assignments.length} slots, expected ${totalSlots}`);
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
      missingItems.push(`MISSING: Item "${item.name}" (${item.id}) not assigned to any run`);
    } else if (assigned < item.quantity) {
      const shortfall = item.quantity - assigned;
      warnings.push(`Item "${item.name}": only assigned ${assigned} of ${item.quantity} (short by ${shortfall})`);
    }
  }

  // Check overrun per slot
  for (let i = 0; i < layout.runs.length; i++) {
    const run = layout.runs[i];
    const filledSlots = run.slot_assignments.filter((s: any) => s.quantity_in_slot > 0);
    if (filledSlots.length === 0) continue;
    
    const maxSlotQty = Math.max(...filledSlots.map((s: any) => s.quantity_in_slot));
    const frames = Math.ceil(maxSlotQty / labelsPerSlotPerFrame);
    const actualPerSlot = frames * labelsPerSlotPerFrame;

    for (let j = 0; j < run.slot_assignments.length; j++) {
      const slot = run.slot_assignments[j];
      if (slot.quantity_in_slot > 0) {
        const overrun = actualPerSlot - slot.quantity_in_slot;
        if (overrun > maxOverrun) {
          overrunViolations.push(
            `Run ${i + 1}, slot ${j + 1} ("${slot.item_id}"): requested ${slot.quantity_in_slot}, actual output ${actualPerSlot}, overrun ${overrun} > max ${maxOverrun}`
          );
        }
      }
    }
  }

  return { warnings: [...warnings, ...missingItems], overrunViolations, missingItems };
}

function buildSystemPrompt(
  items: LabelItem[],
  totalSlots: number,
  labelsPerSlotPerFrame: number,
  maxOverrun: number,
  qtyPerRoll: number | undefined
): string {
  return `You are a production planner for an HP Indigo roll label press.

PHYSICS:
- The press has ${totalSlots} slots across the roll. All ${totalSlots} slots print simultaneously.
- One frame produces ${labelsPerSlotPerFrame} labels per slot.
- A run's length = ceil(highest_slot_qty / ${labelsPerSlotPerFrame}) frames.
- EVERY slot in that run produces frames × ${labelsPerSlotPerFrame} labels — even slots that need fewer.
- Overrun = actual_produced − requested.

CRITICAL CONSTRAINT — MAX OVERRUN: ${maxOverrun} labels per slot. This is a HARD LIMIT. ANY slot exceeding this FAILS.

HOW TO CHECK YOUR WORK (you MUST do this for every run before returning):
  1. Find the HIGHEST quantity_in_slot across all filled slots in the run.
  2. frames = ceil(highest_qty / ${labelsPerSlotPerFrame})
  3. actual_output = frames × ${labelsPerSlotPerFrame}
  4. For EACH filled slot: overrun = actual_output − that_slot's quantity_in_slot
  5. If ANY overrun > ${maxOverrun}, you MUST fix it:
     - SPLIT the item: put part of its quantity in this run, remainder in another run
     - Or MOVE the slot to a different run where the highest qty is closer to it
     - Or CREATE a new run for items with very different quantities

WORKED EXAMPLE (labelsPerSlotPerFrame=${labelsPerSlotPerFrame}, maxOverrun=${maxOverrun}):
  Bad: Slot A=5300, Slot B=700 → frames=ceil(5300/${labelsPerSlotPerFrame})=${Math.ceil(5300 / labelsPerSlotPerFrame)} → actual=${Math.ceil(5300 / labelsPerSlotPerFrame) * labelsPerSlotPerFrame} → Slot B overrun=${Math.ceil(5300 / labelsPerSlotPerFrame) * labelsPerSlotPerFrame - 700} ← VIOLATION
  Fix: Put Slot B in a separate run, or split Slot A so the highest qty in this run ≤ ${700 + maxOverrun}.

SPLITTING STRATEGY:
- When an item's quantity is very different from others, SPLIT it across multiple runs.
- Example: Item X needs 5000, Item Y needs 800. Don't put them in the same run.
  Instead: Run 1 has Item X across multiple slots (e.g., 2500+2500). Run 2 has Item Y.
- You can also split an item across slots WITHIN a run: e.g., 5000 labels across 3 slots = 1667+1667+1666.

RULES:
1. EVERY item MUST appear in at least one slot with quantity_in_slot > 0. Missing items = FAILURE.
2. The SUM of quantity_in_slot for each item across ALL runs MUST equal or exceed the item's requested quantity.
3. Each run MUST have EXACTLY ${totalSlots} slot_assignments. Use item_id="" and quantity_in_slot=0 for blank/empty slots.
4. Minimize blank slots — each wastes ${Math.round(100 / totalSlots)}% of material per frame.
5. Minimize total number of runs — each costs ~20 min setup time.
6. When items have similar quantities, group them in the same run across different slots.
7. When items have very different quantities, put them in SEPARATE runs to avoid overrun.
${qtyPerRoll ? `8. Customer wants ${qtyPerRoll} labels per output roll. Note in trade_offs if slot output doesn't match.` : ''}

ITEMS TO ASSIGN (use these EXACT IDs — do NOT modify, skip, or duplicate any):
${items.map((i: LabelItem) => `- ID: "${i.id}" | Name: "${i.name}" | Qty: ${i.quantity.toLocaleString()}`).join('\n')}

BEFORE RETURNING:
✓ Every item ID from the list above appears in at least one slot_assignment
✓ Sum of quantity_in_slot per item ≥ item's requested quantity
✓ Run the overrun check algorithm above for EVERY run — fix any violations
✓ Each run has exactly ${totalSlots} slot_assignments

Return your layout via the create_layout tool.`;
}

function buildTools(totalSlots: number) {
  return [{
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
}

async function callAI(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  tools: any[]
): Promise<{ layout: any; error?: string }> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      tools,
      tool_choice: { type: "function", function: { name: "create_layout" } }
    }),
  });

  if (!response.ok) {
    const status = response.status;
    const errorText = await response.text();
    console.error("AI gateway error:", status, errorText);
    if (status === 429) return { layout: null, error: "rate_limit" };
    if (status === 402) return { layout: null, error: "credits_exhausted" };
    throw new Error(`AI gateway error: ${status}`);
  }

  const aiResult = await response.json();
  const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

  if (!toolCall?.function?.arguments) {
    return { layout: null, error: "no_tool_call" };
  }

  try {
    return { layout: JSON.parse(toolCall.function.arguments) };
  } catch {
    return { layout: null, error: "parse_failed" };
  }
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

    console.log(`[label-optimize] ${items.length} items, ${totalLabels} labels, ${totalSlots} slots, ${labelsPerSlotPerFrame} labels/slot/frame, maxOverrun=${max_overrun}`);

    const systemPrompt = buildSystemPrompt(items, totalSlots, labelsPerSlotPerFrame, max_overrun, qty_per_roll);
    const tools = buildTools(totalSlots);
    const userMessage = `Plan the layout for ${items.length} items, ${totalLabels.toLocaleString()} total labels, ${totalSlots} slots. Max overrun: ${max_overrun}. Think step by step and verify each run's overrun before returning.`;

    // --- First AI call ---
    const firstResult = await callAI(LOVABLE_API_KEY, systemPrompt, userMessage, tools);

    if (firstResult.error === "rate_limit") {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (firstResult.error === "credits_exhausted") {
      return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (!firstResult.layout) {
      return new Response(JSON.stringify({ error: `AI returned no layout (${firstResult.error})` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let layout = firstResult.layout;
    let validation = validateLayout(layout, items, totalSlots, labelsPerSlotPerFrame, max_overrun);
    let retried = false;

    // --- Single retry if overrun violations or missing items ---
    if (validation.overrunViolations.length > 0 || validation.missingItems.length > 0) {
      console.warn(`[label-optimize] Attempt 1 failed validation. Violations: ${validation.overrunViolations.length}, Missing: ${validation.missingItems.length}`);
      console.warn("Violations:", validation.overrunViolations);
      console.warn("Missing:", validation.missingItems);

      const feedbackLines: string[] = [];
      
      if (validation.overrunViolations.length > 0) {
        feedbackLines.push("OVERRUN VIOLATIONS (each must be fixed):");
        feedbackLines.push(...validation.overrunViolations.map(v => `  - ${v}`));
        feedbackLines.push("");
        feedbackLines.push("To fix overrun: split the high-quantity item across more slots or runs, or move low-quantity items to a separate run where they share with items of similar quantity.");
      }

      if (validation.missingItems.length > 0) {
        feedbackLines.push("MISSING ITEMS (each must appear in at least one slot):");
        feedbackLines.push(...validation.missingItems.map(m => `  - ${m}`));
      }

      const retryMessage = `Your previous layout has these violations:\n\n${feedbackLines.join('\n')}\n\nFix ALL violations and return a corrected layout. Remember: max overrun is ${max_overrun} per slot. Every item must be assigned. Use the overrun check algorithm from the system prompt.`;

      const retryResult = await callAI(LOVABLE_API_KEY, systemPrompt, retryMessage, tools);
      retried = true;

      if (retryResult.layout) {
        layout = retryResult.layout;
        validation = validateLayout(layout, items, totalSlots, labelsPerSlotPerFrame, max_overrun);
        console.log(`[label-optimize] Retry result: ${validation.overrunViolations.length} violations, ${validation.missingItems.length} missing`);
      } else {
        console.warn("[label-optimize] Retry failed, using first attempt result");
      }
    }

    // Combine all warnings
    const allWarnings = [...validation.warnings, ...validation.overrunViolations];
    if (retried) {
      allWarnings.push(`Layout was retried due to violations. ${validation.overrunViolations.length > 0 ? 'Some violations remain — review carefully.' : 'All violations resolved.'}`);
    }

    console.log(`[label-optimize] Final: ${layout.runs.length} runs, ${allWarnings.length} warnings, retried=${retried}`);

    return new Response(JSON.stringify({
      success: true,
      layout,
      warnings: allWarnings,
      metadata: {
        items_count: items.length,
        total_labels: totalLabels,
        available_slots: totalSlots,
        labels_per_slot_per_frame: labelsPerSlotPerFrame,
        retried,
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
