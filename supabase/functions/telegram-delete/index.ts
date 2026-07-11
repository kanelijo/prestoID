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
    const CHANNEL_ID = Deno.env.get('TELEGRAM_CHANNEL_ID');

    if (!BOT_TOKEN || !CHANNEL_ID) {
      throw new Error('Telegram Bot Token or Channel ID is not configured.');
    }

    const { messageId } = await req.json();

    if (!messageId) {
      throw new Error('No messageId provided.');
    }

    const telegramRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage?chat_id=${CHANNEL_ID}&message_id=${messageId}`, {
      method: 'POST'
    });

    const telegramResult = await telegramRes.json();

    return new Response(
      JSON.stringify({ success: telegramResult.ok, result: telegramResult }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    )
  }
})
