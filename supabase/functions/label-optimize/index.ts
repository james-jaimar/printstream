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

/**
 * Post-processor: correct any AI layout that violates overrun constraints.
 * For each run, if a slot's overrun exceeds maxOverrun:
 *   - Try to bump the slot qty up to (actualPerSlot - maxOverrun) if item can absorb it
 *   - Otherwise blank the slot (qty=0) and collect orphaned quantity for corrective runs
 * Then create equal-qty corrective runs for orphaned quantities.
 */
function correctAILayout(
  layout: AILayout,
  items: LabelItem[],
  totalSlots: number,
  labelsPerSlotPerFrame: number,
  maxOverrun: number
): { layout: AILayout; corrected: boolean; correctionNotes: string[] } {
  const notes: string[] = [];
  let corrected = false;

  // Track how much quantity each item still needs (ordered qty)
  const itemOrderedQty = new Map<string, number>();
  for (const item of items) {
    itemOrderedQty.set(item.id, item.quantity);
  }

  // First pass: track total assigned per item across all runs
  const itemAssigned = new Map<string, number>();
  for (const run of layout.runs) {
    for (const slot of run.slot_assignments) {
      itemAssigned.set(slot.item_id, (itemAssigned.get(slot.item_id) || 0) + slot.quantity_in_slot);
    }
  }

  // Orphaned quantities that need new runs
  const orphaned = new Map<string, number>();

  // Fix each run
  for (let i = 0; i < layout.runs.length; i++) {
    const run = layout.runs[i];
    const maxSlotQty = Math.max(...run.slot_assignments.map(s => s.quantity_in_slot));
    if (maxSlotQty === 0) continue;

    const frames = Math.ceil(maxSlotQty / labelsPerSlotPerFrame);
    const actualPerSlot = frames * labelsPerSlotPerFrame;

    for (const slot of run.slot_assignments) {
      if (slot.quantity_in_slot <= 0) continue;

      const overrun = actualPerSlot - slot.quantity_in_slot;
      if (overrun <= maxOverrun) continue;

      // Overrun violation detected
      corrected = true;
      const minAcceptableQty = actualPerSlot - maxOverrun;

      // Option A: Can we bump this slot's qty up?
      const itemOrdered = itemOrderedQty.get(slot.item_id) || 0;
      const currentTotal = itemAssigned.get(slot.item_id) || 0;
      const headroom = itemOrdered - currentTotal + slot.quantity_in_slot; // how much this item can go up to

      if (minAcceptableQty <= headroom) {
        // Bump up — the extra labels are still within ordered qty headroom
        const bump = minAcceptableQty - slot.quantity_in_slot;
        notes.push(`Run ${i + 1}: bumped slot for item ${slot.item_id} from ${slot.quantity_in_slot} to ${minAcceptableQty} (+${bump}) to stay within overrun limit`);
        itemAssigned.set(slot.item_id, currentTotal - slot.quantity_in_slot + minAcceptableQty);
        slot.quantity_in_slot = minAcceptableQty;
      } else {
        // Option B: blank the slot, orphan the quantity
        notes.push(`Run ${i + 1}: blanked slot for item ${slot.item_id} (had ${slot.quantity_in_slot}, overrun was ${overrun} > max ${maxOverrun})`);
        orphaned.set(slot.item_id, (orphaned.get(slot.item_id) || 0) + slot.quantity_in_slot);
        itemAssigned.set(slot.item_id, currentTotal - slot.quantity_in_slot);
        slot.quantity_in_slot = 0;
      }
    }
  }

  // Create corrective runs for orphaned quantities — SPREAD items across slots
  if (orphaned.size > 0) {
    const orphanedEntries = Array.from(orphaned.entries()).filter(([_, qty]) => qty > 0);
    
    // Spread ALL orphaned items across a single corrective run if possible
    const numOrphans = orphanedEntries.length;
    
    if (numOrphans > 0) {
      const baseSlotsPerItem = Math.floor(totalSlots / numOrphans);
      const extraSlots = totalSlots % numOrphans;
      
      const slots: AISlotAssignment[] = [];
      let slotIdx = 0;
      
      for (let i = 0; i < numOrphans; i++) {
        const [itemId, qty] = orphanedEntries[i];
        const slotsForItem = baseSlotsPerItem + (i < extraSlots ? 1 : 0);
        const qtyPerSlot = Math.ceil(qty / slotsForItem);
        let remaining = qty;
        
        for (let s = 0; s < slotsForItem; s++) {
          const thisSlotQty = Math.min(qtyPerSlot, remaining);
          slots.push({ item_id: itemId, quantity_in_slot: thisSlotQty });
          remaining -= thisSlotQty;
          slotIdx++;
        }
      }
      
      // Fill any leftover slots as blank (should be 0-1)
      while (slotIdx < totalSlots) {
        slots.push({ item_id: orphanedEntries[0][0], quantity_in_slot: 0 });
        slotIdx++;
      }
      
      // Validate overrun on this corrective run
      const maxSlotQty = Math.max(...slots.map(s => s.quantity_in_slot));
      const frames = Math.ceil(maxSlotQty / labelsPerSlotPerFrame);
      const actualPerSlot = frames * labelsPerSlotPerFrame;
      
      // Check if all items in this run are within overrun
      const allOk = slots.every(s => s.quantity_in_slot === 0 || (actualPerSlot - s.quantity_in_slot) <= maxOverrun);
      
      if (allOk) {
        // Single corrective run with items spread across slots
        layout.runs.push({
          slot_assignments: slots,
          reasoning: `Corrective run: ${numOrphans} item(s) spread across ${totalSlots} slots to minimize blanks`,
        });
        notes.push(`Created 1 corrective run with ${numOrphans} orphaned items spread across ${totalSlots - Math.max(0, totalSlots - slotIdx)} slots`);
      } else {
        // Items have too-different quantities for one run — create separate runs per item, but SPREAD each
        for (const [itemId, qty] of orphanedEntries) {
          const itemSlots: AISlotAssignment[] = [];
          const qtyPerSlot = Math.ceil(qty / totalSlots);
          let remaining = qty;
          
          for (let s = 0; s < totalSlots; s++) {
            const thisSlotQty = Math.min(qtyPerSlot, remaining);
            itemSlots.push({ item_id: itemId, quantity_in_slot: thisSlotQty > 0 ? thisSlotQty : 0 });
            remaining -= Math.max(0, thisSlotQty);
          }
          
          layout.runs.push({
            slot_assignments: itemSlots,
            reasoning: `Corrective run for ${qty} labels of item ${itemId} (spread across ${totalSlots} slots)`,
          });
          notes.push(`Created corrective run for item ${itemId} with ${qty} labels spread across slots`);
        }
      }
    }
  }

  // Update trade_offs
  if (corrected) {
    let totalBlanks = 0;
    for (const run of layout.runs) {
      totalBlanks += run.slot_assignments.filter(s => s.quantity_in_slot === 0).length;
    }

    layout.trade_offs = {
      ...layout.trade_offs,
      blank_slots_available: totalBlanks,
      blank_slot_note: totalBlanks > 0
        ? `${totalBlanks} blank slot(s) — available for internal labels or another job`
        : layout.trade_offs?.blank_slot_note,
      overrun_warnings: notes,
    };

    layout.overall_reasoning = `[Auto-corrected] ${layout.overall_reasoning}. Server-side correction applied to enforce overrun limit of ${maxOverrun}.`;
  }

  return { layout, corrected, correctionNotes: notes };
}

function buildSystemPrompt(
  totalSlots: number,
  labelsPerSlotPerFrame: number,
  labelsPerFrame: number,
  maxOverrun: number,
  rollSizeContext: string,
  items: LabelItem[]
): string {
  // Pre-compute example values for the worked example
  const exHigh = 5000;
  const exLow = 1000;
  const exFrames = Math.ceil(exHigh / labelsPerSlotPerFrame);
  const exActual = exFrames * labelsPerSlotPerFrame;
  const exOverrunLow = exActual - exLow;
  const wastePerBlank = Math.round(100 / totalSlots);

  return `You are a print production planner for an HP Indigo digital label press. Think like an experienced press operator who hates waste.

THE PRESS — HOW IT WORKS:
- The press prints rolls with ${totalSlots} label positions ("slots") across the web.
- All ${totalSlots} slots print simultaneously. One "frame" produces ${labelsPerSlotPerFrame} labels per slot.
- A run's length is determined by its HIGHEST-quantity slot: frames = ceil(max_slot_qty / ${labelsPerSlotPerFrame}).
- EVERY slot in that run produces frames × ${labelsPerSlotPerFrame} labels — even if a slot only needs a fraction of that.
- Therefore: the difference between what a slot produces and what it needs is "overrun" (waste labels).

WORKED EXAMPLE:
  Slot A: qty=${exHigh} → frames = ceil(${exHigh}/${labelsPerSlotPerFrame}) = ${exFrames} → produces ${exActual} → overrun = ${exActual - exHigh} ✓
  Slot B: qty=${exLow} in the SAME run → also produces ${exActual} → overrun = ${exOverrunLow} ✗ UNACCEPTABLE
  Lesson: items with very different quantities cannot share a run.

THE OBJECTIVE:
Produce every ordered label with MINIMUM total waste. Waste comes in two forms:
1. OVERRUN waste — extra labels beyond what was ordered. HARD LIMIT: max ${maxOverrun} per slot per run. Non-negotiable.
2. SUBSTRATE waste — blank slots (qty=0) waste ${wastePerBlank}% of material per frame. A run with 5 blank slots out of ${totalSlots} wastes ${wastePerBlank * 5}% of substrate — unacceptable.

THE ECONOMICS (use these to make trade-off decisions):
- Each additional run costs ~20 minutes of setup + substrate for leader/trailer material
- Each blank slot wastes ${wastePerBlank}% of substrate for every frame in that run
- Overrun beyond ${maxOverrun} = hard failure (labels get thrown away AND customer complains)
- A run with ≤1 blank slot is good. 2 is acceptable. 3+ means you should redistribute.

YOUR REASONING PROCESS (think step by step):
1. SORT items by quantity (descending).
2. GROUP items whose quantities are close enough to share a run (i.e., the difference between highest and lowest qty in the group would produce overrun ≤ ${maxOverrun} for every slot).
3. SPREAD each group's items across ALL ${totalSlots} slots. If a group has N items and ${totalSlots} slots, give each item floor(${totalSlots}/N) slots. Split each item's quantity evenly across its slots: qty_per_slot = ceil(item_qty / num_slots_for_item).
   Example: 4 items in ${totalSlots} slots → ${Math.floor(totalSlots / 4)} slots each = ${Math.floor(totalSlots / 4) * 4} filled, ${totalSlots - Math.floor(totalSlots / 4) * 4} blank.
   Example: 3 items in ${totalSlots} slots → ${Math.floor(totalSlots / 3)} slots each = ${Math.floor(totalSlots / 3) * 3} filled, ${totalSlots - Math.floor(totalSlots / 3) * 3} blank.
4. If an item's quantity is too far from others to share a run, give it its OWN run and spread it across all ${totalSlots} slots (qty_per_slot = ceil(qty / ${totalSlots})).
5. VERIFY every run before committing: for each slot, calculate (frames × ${labelsPerSlotPerFrame}) − slot_qty. If any result > ${maxOverrun}, the run is invalid — fix it.

ITEMS TO ASSIGN (use these exact IDs):
${items.map(i => `- ID: "${i.id}" | Name: "${i.name}" | Qty: ${i.quantity}`).join('\n')}
${rollSizeContext}

Return your layout using the create_layout tool. Each run must have EXACTLY ${totalSlots} slot_assignments.`;
}

function buildToolSchema(totalSlots: number) {
  return [
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
                        item_id: { type: "string", description: "The actual item ID from the input list" },
                        quantity_in_slot: { type: "number", description: "How many labels this slot needs. Use 0 for blank slots." }
                      },
                      required: ["item_id", "quantity_in_slot"],
                      additionalProperties: false
                    }
                  },
                  reasoning: { type: "string", description: "Brief explanation for this run's configuration" }
                },
                required: ["slot_assignments", "reasoning"],
                additionalProperties: false
              }
            },
            overall_reasoning: { type: "string", description: "Overall explanation of the layout strategy" },
            estimated_waste_percent: { type: "number", description: "Estimated material waste percentage" },
            trade_offs: {
              type: "object",
              description: "Trade-off suggestions and notes for the operator",
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
    }
  ];
}

async function callAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  tools: any[]
): Promise<AILayout | null> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools,
      tool_choice: { type: "function", function: { name: "create_layout" } }
    }),
  });

  if (!response.ok) {
    const status = response.status;
    const errorText = await response.text();
    console.error("AI gateway error:", status, errorText);
    throw { status, message: errorText };
  }

  const aiResult = await response.json();
  const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

  if (toolCall?.function?.arguments) {
    try {
      return JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse AI layout:", e);
    }
  }
  return null;
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

    // Roll size context
    const lw = label_width_mm || dieline.label_width_mm;
    const lh = label_height_mm || dieline.label_height_mm;
    const labelArea = lw * lh;
    let rollSizeContext = '';
    if (qty_per_roll) {
      rollSizeContext = `\nROLL SIZE: Customer requires ${qty_per_roll} labels per output roll. Factor this into your layout.`;
    } else {
      const suggestedQpr = labelArea < 2500 ? 1000 : labelArea < 10000 ? 500 : 250;
      rollSizeContext = `\nROLL SIZE: No qty_per_roll specified. Based on label dimensions (${lw}×${lh}mm), suggest ~${suggestedQpr}/roll in trade_offs.roll_size_note.`;
    }

    const systemPrompt = buildSystemPrompt(totalSlots, labelsPerSlotPerFrame, labelsPerFrame, maxOverrun, rollSizeContext, items);
    const tools = buildToolSchema(totalSlots);

    const userPrompt = `Plan the production layout for this order.

Summary: ${items.length} items, ${totalLabels.toLocaleString()} total labels, ${totalSlots} slots, ${labelsPerSlotPerFrame} labels/slot/frame, max overrun ${maxOverrun}.
${qty_per_roll ? `Customer requires ${qty_per_roll} labels per output roll.` : 'No qty/roll specified — suggest one in trade_offs.roll_size_note.'}
${constraints?.rush_job ? 'RUSH JOB — minimize number of runs.' : ''}
${constraints?.prefer_ganging ? 'Customer prefers ganging where possible.' : ''}

Think step by step, then return the layout via create_layout.`;

    // --- First AI attempt ---
    let layout: AILayout | null = null;
    try {
      layout = await callAI(LOVABLE_API_KEY, systemPrompt, userPrompt, tools);
    } catch (err: any) {
      if (err.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (err.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "AI optimization failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let validation = { valid: false, warnings: ["No layout returned from AI"] };
    let wasCorrected = false;
    let correctionNotes: string[] = [];

    if (layout) {
      validation = validateAILayout(layout, items, totalSlots, labelsPerSlotPerFrame, maxOverrun);

      if (!validation.valid) {
        console.warn("AI layout validation warnings (attempt 1):", validation.warnings);

        // Check if there are overrun violations specifically
        const hasOverrunViolations = validation.warnings.some(w => w.includes('overrun') && w.includes('> max'));

        if (hasOverrunViolations) {
          // Try server-side correction first
          const correction = correctAILayout(layout, items, totalSlots, labelsPerSlotPerFrame, maxOverrun);
          layout = correction.layout;
          wasCorrected = correction.corrected;
          correctionNotes = correction.correctionNotes;

          // Re-validate after correction
          validation = validateAILayout(layout, items, totalSlots, labelsPerSlotPerFrame, maxOverrun);

          if (!validation.valid) {
            // Still not valid — retry AI with explicit failure feedback
            console.warn("Post-correction still invalid, retrying AI with feedback...");
            const retryPrompt = `Your previous layout attempt had these overrun violations:
${validation.warnings.filter(w => w.includes('overrun')).join('\n')}

The MAXIMUM overrun per slot is ${maxOverrun} labels. You MUST fix this.

Key rule: frames = ceil(max_slot_qty / ${labelsPerSlotPerFrame}). ALL slots in a run produce frames × ${labelsPerSlotPerFrame} labels. If one slot has qty 5000 and another has qty 1000, the small slot gets massive overrun.

SOLUTION: Put items with different quantities in SEPARATE runs, or blank the smaller slots (qty=0).

Redo the layout now. Each run's slots should ideally all have the SAME quantity_in_slot value.

${userPrompt}`;

            try {
              const retryLayout = await callAI(LOVABLE_API_KEY, systemPrompt, retryPrompt, tools);
              if (retryLayout) {
                const retryValidation = validateAILayout(retryLayout, items, totalSlots, labelsPerSlotPerFrame, maxOverrun);
                if (retryValidation.valid || 
                    !retryValidation.warnings.some(w => w.includes('overrun') && w.includes('> max'))) {
                  // Retry is better — use it
                  layout = retryLayout;
                  validation = retryValidation;
                  wasCorrected = false;
                  correctionNotes = [];
                  console.log("AI retry succeeded — overrun violations resolved");
                } else {
                  // Retry still bad — apply correction to retry result
                  const retryCorrection = correctAILayout(retryLayout, items, totalSlots, labelsPerSlotPerFrame, maxOverrun);
                  layout = retryCorrection.layout;
                  wasCorrected = retryCorrection.corrected;
                  correctionNotes = retryCorrection.correctionNotes;
                  validation = validateAILayout(layout, items, totalSlots, labelsPerSlotPerFrame, maxOverrun);
                  console.warn("AI retry also had violations — applied server-side correction");
                }
              }
            } catch (retryErr) {
              console.warn("AI retry failed, using corrected first attempt:", retryErr);
              // Keep the corrected first attempt
            }
          } else {
            console.log("Server-side correction resolved all overrun violations");
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        layout,
        validation,
        corrected: wasCorrected,
        correction_notes: correctionNotes,
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
