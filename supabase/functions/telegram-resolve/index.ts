// @ts-nocheck
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

    const url = new URL(req.url);
    
    // Support both GET (for browser direct download) and POST (for API resolution)
    let file_id = url.searchParams.get('file_id');
    let file_name = url.searchParams.get('file_name') || 'document.pdf';

    if (!file_id && req.method === 'POST') {
      const body = await req.json();
      file_id = body.file_id;
      if (body.file_name) file_name = body.file_name;
    }

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
    const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    // If it's a GET request, we securely proxy the file stream to force a clean download!
    if (req.method === 'GET') {
      const fileResponse = await fetch(downloadUrl);
      
      // Stream the response directly to the client, hiding the BOT_TOKEN
      return new Response(fileResponse.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': fileResponse.headers.get('Content-Type') || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${file_name}"`,
        }
      });
    }

    // If it's a POST request (legacy resolver), return the URL (Warning: exposes BOT_TOKEN)
    // We keep this just in case, but frontend should use the GET proxy.
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
