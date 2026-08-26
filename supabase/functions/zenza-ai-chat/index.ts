import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { geminiHistory, groqHistory, groqSupported } = await req.json();

    const apiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('EXPO_PUBLIC_GEMINI_API_KEY');
    const groqKey = Deno.env.get('GROQ_API_KEY') || Deno.env.get('EXPO_PUBLIC_GROQ_API_KEY');

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY environment variable is not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const attemptGemini = async (modelName: string) => {
      const model = genAI.getGenerativeModel({ model: modelName });
      const disableThinking = modelName.includes('2.5') || modelName.includes('3.1') || modelName.includes('3.5');
      const generationConfig: any = disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {};
      const result = await model.generateContent({ contents: geminiHistory, generationConfig });
      return result.response.text();
    };

    const attemptGroq = async () => {
      if (!groqKey) throw new Error("GROQ_API_KEY is not configured");
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: groqHistory,
          temperature: 0.4,
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Groq API Error");
      return data.choices[0].message.content;
    };

    const geminiModels = [
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-2.5-pro"
    ];

    let responseText = "";
    let geminiSuccess = false;

    for (const modelName of geminiModels) {
      try {
        console.log(`[AI Chat] Attempting model: ${modelName}...`);
        responseText = await attemptGemini(modelName);
        geminiSuccess = true;
        break;
      } catch (err: any) {
        console.warn(`[AI Chat] ${modelName} failed:`, err?.message || err);
      }
    }

    if (!geminiSuccess) {
      if (groqSupported && groqKey) {
        console.log("[AI Chat] Fallback to Groq...");
        responseText = await attemptGroq();
      } else {
        throw new Error("All AI models are currently overloaded. Please try again in a minute.");
      }
    }

    return new Response(JSON.stringify({ responseText }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'AI processing error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
