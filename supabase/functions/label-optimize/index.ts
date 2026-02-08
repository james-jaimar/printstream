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

    // Build context for AI
    const totalSlots = dieline.columns_across;
    const labelsPerFrame = dieline.columns_across * dieline.rows_around;
    const totalLabels = items.reduce((sum, i) => sum + i.quantity, 0);

    const systemPrompt = `You are an expert print production optimizer for HP Indigo label printing.
Your goal is to minimize material waste while balancing production efficiency.

Key constraints:
- Roll width: ${dieline.roll_width_mm}mm
- Available slots (columns): ${totalSlots}
- Labels per frame: ${labelsPerFrame}
- Max frame length: 960mm

Optimization priorities:
1. Minimize substrate waste
2. Reduce number of production runs
3. Balance slot utilization across runs`;

    const userPrompt = `Analyze this label order and suggest the optimal production layout:

Items to print:
${items.map(i => `- ${i.name}: ${i.quantity} labels${i.width_mm ? ` (${i.width_mm}x${i.height_mm}mm)` : ''}`).join('\n')}

Total labels needed: ${totalLabels}

${constraints?.rush_job ? 'This is a RUSH JOB - prioritize speed over efficiency.' : ''}
${constraints?.prefer_ganging ? 'Customer prefers ganging multiple items per run if possible.' : ''}

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
    
    // Extract tool call result
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
