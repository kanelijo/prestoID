// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const CHANNEL_ID = Deno.env.get('TELEGRAM_CHANNEL_ID');

    if (!BOT_TOKEN || !CHANNEL_ID) {
      throw new Error('Telegram Bot Token or Channel ID is not configured in Supabase Secrets.');
    }

    // Expecting a JSON payload with fileBase64, fileName, mimeType
    const { fileBase64, fileName, mimeType } = await req.json();

    if (!fileBase64) {
      throw new Error('No fileBase64 provided in payload.');
    }

    // Convert base64 to Blob
    const binaryStr = atob(fileBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const documentBlob = new Blob([bytes], { type: mimeType || 'application/octet-stream' });

    // Detect if the file is an image (excluding GIFs which should stay as documents)
    const isImage = mimeType && mimeType.startsWith('image/') && !mimeType.includes('gif');
    const endpoint = isImage ? 'sendPhoto' : 'sendDocument';
    const paramName = isImage ? 'photo' : 'document';

    // Forward to Telegram
    const telegramFormData = new FormData();
    telegramFormData.append('chat_id', CHANNEL_ID);
    telegramFormData.append(paramName, documentBlob, fileName || (isImage ? 'upload.jpg' : 'upload.file'));

    const telegramRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${endpoint}`, {
      method: 'POST',
      body: telegramFormData,
    });

    const telegramResult = await telegramRes.json();

    if (!telegramResult.ok) {
      throw new Error(`Telegram API Error: ${JSON.stringify(telegramResult)}`);
    }

    // Extract file_id from Telegram response
    const fileId = telegramResult.result.document?.file_id || telegramResult.result.photo?.pop()?.file_id || telegramResult.result.video?.file_id;

    if (!fileId) {
      throw new Error('Telegram did not return a valid file_id.');
    }

    const messageId = telegramResult.result?.message_id || null;

    return new Response(
      JSON.stringify({ success: true, file_id: fileId, message_id: messageId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    )
  }
})
