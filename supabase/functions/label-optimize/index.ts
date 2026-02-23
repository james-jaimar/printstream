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
    const labelsPerFrame = dieline.columns_across * dieline.rows_around;
    const totalLabels = items.reduce((sum, i) => sum + i.quantity, 0);
    const maxOverrun = constraints?.max_overrun ?? 250;

    const systemPrompt = `You are an expert print production optimizer for HP Indigo digital label printing on rolls.

CRITICAL PRODUCTION RULES:
1. EVERY slot (column) in a frame MUST be filled. No empty slots allowed.
   - If there are ${totalSlots} slots and only 3 items, duplicate items across remaining slots.
   - A single-item run fills ALL ${totalSlots} slots with the same artwork.
2. The run length (number of frames) is determined by the slot with the HIGHEST quantity.
   All slots print for the same length. Slots with fewer labels than the max produce waste/overrun.
3. Quantities CAN and SHOULD be split across multiple runs when it reduces waste.
   Example: 1,500 labels can become 1,000 in Run 1 + 500 in Run 2.
4. There is NO default batch size. Use the actual requested quantities.
5. Gang items with SIMILAR quantities together to minimize waste from mismatched run lengths.

OVERRUN CONSTRAINT (CRITICAL):
- Maximum acceptable overrun per slot: ${maxOverrun} labels
- Never suggest ganging items whose quantities differ by more than ${maxOverrun} labels
- If items cannot be ganged within this limit, they MUST go on separate runs
- When N items are ganged across ${totalSlots} slots, items are distributed round-robin.
  If ${totalSlots} is not evenly divisible by N, some items get more slots than others,
  causing the minority item's slots to have much higher per-slot quantities.
  ALWAYS check: does the actual frame output minus the requested quantity exceed ${maxOverrun}?
  Example: 2 items across 5 slots = 3+2 split. Item with 2 slots needs ceil(qty/2) per slot,
  item with 3 slots needs ceil(qty/3). The run prints at the HIGHER value, so the 3-slot item
  gets massive overrun. This is NOT acceptable if overrun > ${maxOverrun}.

MACHINE SPECIFICATIONS:
- Roll width: ${dieline.roll_width_mm}mm
- Available slots (columns across): ${totalSlots}
- Rows around (labels per slot per frame): ${dieline.rows_around}
- Labels per frame (all slots): ${labelsPerFrame}
- Max frame length: 960mm

OPTIMIZATION PRIORITIES:
1. Fill all slots (mandatory — never leave a slot empty)
2. Keep every slot's overrun within ${maxOverrun} labels (mandatory)
3. Minimize substrate waste (match quantities in ganged runs)
4. Reduce number of production runs (fewer changeovers)
5. Split quantities across runs when it improves ganging efficiency`;

    const userPrompt = `Analyze this label order and suggest the optimal production layout:

Items to print:
${items.map(i => `- ${i.name}: ${i.quantity.toLocaleString()} labels${i.width_mm ? ` (${i.width_mm}x${i.height_mm}mm)` : ''}`).join('\n')}

Total labels needed: ${totalLabels.toLocaleString()}
Available slots per frame: ${totalSlots}
Labels per slot per frame: ${dieline.rows_around}

${constraints?.rush_job ? 'RUSH JOB — prioritize speed (fewer runs) over waste minimization.' : ''}
${constraints?.prefer_ganging ? 'Customer prefers ganging multiple items per run where possible.' : ''}

Remember: every slot must be filled, quantities can be split across runs, and there is no default batch size.

Provide your recommendation with reasoning.`;

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
              name: "suggest_layout",
              description: "Suggest an optimal production layout for label printing",
              parameters: {
                type: "object",
                properties: {
                  recommendation: {
                    type: "string",
                    enum: ["ganged", "individual", "hybrid"],
                    description: "The recommended approach"
                  },
                  reasoning: {
                    type: "string",
                    description: "Brief explanation of why this approach is optimal"
                  },
                  estimated_waste_percent: {
                    type: "number",
                    description: "Estimated material waste percentage"
                  },
                  suggested_run_count: {
                    type: "number",
                    description: "Recommended number of production runs"
                  },
                  efficiency_tips: {
                    type: "array",
                    items: { type: "string" },
                    description: "Tips to improve production efficiency"
                  }
                },
                required: ["recommendation", "reasoning", "estimated_waste_percent", "suggested_run_count"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "suggest_layout" } }
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
    let suggestion = null;
    
    if (toolCall?.function?.arguments) {
      try {
        suggestion = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("Failed to parse AI suggestion:", e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        suggestion,
        metadata: {
          items_count: items.length,
          total_labels: totalLabels,
          available_slots: totalSlots,
          labels_per_frame: labelsPerFrame
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
