import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_INSTRUCTION = `**ROLE**
You are a "Strict Educational Data Transcriber." Your primary function is to extract structured Multiple Choice Questions (MCQs) from the provided Context (PDFs, Images, or Text) with 100% verbatim accuracy.

**STRICT GOVERNANCE RULES**
1. **ZERO-OUTSIDE KNOWLEDGE:** You are forbidden from using any information not explicitly stated in the provided context. Even if you "know" a fact is true, if it is not in the source text, it does not exist.
2. **LINE-BY-LINE FIDELITY:** Questions must be derived directly from the sentences in the text. Do not summarize or paraphrase in a way that changes the technical terminology of the source.
3. **VERIFICATION LAYER:** For every question generated, you MUST provide a \`source_quote\`. This quote must be the exact, word-for-word sentence from the text where the answer is found.
4. **SCHEMA ADHERENCE:** You will output only valid JSON. No conversational text, no markdown headers, and no apologies.

**MCQ CONSTRUCTION GUIDELINES**
- **Question:** Must be a clear inquiry based on a specific fact in the text.
- **Options:** Provide 4 plausible options. Only one must be correct according to the text.
- **Distractors:** Incorrect options must be contextually related to the text but factually incorrect based on the specific question.
- **Correct Answer:** Clearly state the correct option.
- **Citation:** Include the \`source_quote\` and, if detectable, the \`page_number\`.

**ERROR HANDLING**
- If the teacher requests more questions than the context can support accurately, provide only as many as can be 100% verified. 
- If the provided document is unreadable or empty, return: {"error": "INSUFFICIENT_CONTEXT"}.

**OUTPUT JSON SCHEMA**
{
  "test_metadata": {
    "source_verified": true,
    "total_questions_extracted": 0
  },
  "questions": [
    {
      "id": "uuid",
      "question_text": "string",
      "options": ["string", "string", "string", "string"],
      "correct_option_index": 0,
      "source_quote": "string",
      "page_reference": 1,
      "difficulty_level": "easy/medium/hard",
      "explanation": "string",
      "type": "text"
    }
  ]
}
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { fileData, mimeType, count = 20, promptDetails } = await req.json();

    if (!fileData || !mimeType) {
      return new Response(JSON.stringify({ error: 'fileData (base64) and mimeType are required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    const userPrompt = `Please extract ${count} questions based on the provided material. ${promptDetails ? 'Additional Instructions: ' + promptDetails : ''}`;

    const parts = [
      { text: userPrompt },
      {
        inlineData: {
          mimeType,
          data: fileData
        }
      }
    ];

    const attemptExtraction = async (modelName: string) => {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_INSTRUCTION
      });
      // Disable thinking for 2.5, 3.1, and 3.5 models to conserve free-tier quota
      const disableThinking = modelName.includes('2.5') || modelName.includes('3.1') || modelName.includes('3.5');
      const generationConfig: any = {
        responseMimeType: "application/json",
        ...(disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      };
      return await model.generateContentStream({
        contents: [{ role: "user", parts }],
        generationConfig,
      });
    };

    let resultStream;

    try {
      console.log("Attempt 1: Gemini 3.5 Flash");
      resultStream = await attemptExtraction("gemini-3.5-flash");
    } catch (err1: any) {
      console.warn("Gemini 3.5 Flash failed:", err1.message);
      try {
        console.log("Attempt 2: Gemini 3.1 Flash Lite");
        resultStream = await attemptExtraction("gemini-3.1-flash-lite");
      } catch (err2: any) {
        console.warn("Gemini 3.1 Flash Lite failed:", err2.message);
        try {
          console.log("Attempt 3: Gemini 2.5 Flash");
          resultStream = await attemptExtraction("gemini-2.5-flash");
        } catch (err3: any) {
          console.warn("Gemini 2.5 Flash failed:", err3.message);
          try {
            console.log("Attempt 4: Gemini 2.5 Pro");
            resultStream = await attemptExtraction("gemini-2.5-pro");
          } catch (err4: any) {
            console.warn("Gemini 2.5 Pro failed:", err4.message);
            try {
              console.log("Attempt 5: Gemini 2.0 Flash");
              resultStream = await attemptExtraction("gemini-2.0-flash");
            } catch (err5: any) {
              console.error("All Gemini models failed:", err5.message);
              throw new Error("All Gemini models are currently overloaded. Please try again in a minute.");
            }
          }
        }
      }
    }
    
    if (!resultStream) throw new Error("Failed to generate content stream after retries.");

    const body = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of resultStream) {
            const text = chunk.text();
            // Send chunk via Server-Sent Events (SSE)
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ chunk: text })}\n\n`));
          }
          controller.enqueue(new TextEncoder().encode(`event: end\ndata: [DONE]\n\n`));
          controller.close();
        } catch (err) {
          controller.enqueue(new TextEncoder().encode(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
