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

    // Expecting a multipart/form-data payload with 'document' (the file) and 'fileName'
    const formData = await req.formData();
    const document = formData.get('document');
    const fileName = formData.get('fileName') || 'upload.file';

    if (!document) {
      throw new Error('No document provided in formData.');
    }

    // Forward to Telegram
    const telegramFormData = new FormData();
    telegramFormData.append('chat_id', CHANNEL_ID);
    telegramFormData.append('document', document, fileName as string);

    const telegramRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
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

    return new Response(
      JSON.stringify({ success: true, file_id: fileId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    )
  }
})
