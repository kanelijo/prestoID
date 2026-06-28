import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!BOT_TOKEN) {
      throw new Error('Telegram Bot Token is not configured in Supabase Secrets.');
    }

    const { file_id } = await req.json();
    if (!file_id) {
      throw new Error('No file_id provided.');
    }

    // 1. Ask Telegram for the file_path
    const pathResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${file_id}`);
    const pathResult = await pathResponse.json();

    if (!pathResult.ok) {
      throw new Error(`Failed to resolve Telegram file: ${JSON.stringify(pathResult)}`);
    }

    const filePath = pathResult.result.file_path;
    
    // 2. Construct the high-speed direct download link
    const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    return new Response(
      JSON.stringify({ success: true, downloadUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    )
  }
})
