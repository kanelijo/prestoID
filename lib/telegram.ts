import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

/**
 * Invokes the 'telegram-upload' Supabase Edge Function to securely upload a file.
 * The BOT_TOKEN is kept secret in the Supabase backend.
 */
export async function uploadToTelegramViaEdge(fileUri: string, fileName: string): Promise<{ fileId: string; messageId: number | null }> {
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (!fileInfo.exists) {
    throw new Error('File does not exist locally.');
  }

  // Determine mime type
  const ext = fileName.split('.').pop()?.toLowerCase();
  let mimeType = 'application/octet-stream';
  if (ext === 'pdf') mimeType = 'application/pdf';
  else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
  else if (ext === 'png') mimeType = 'image/png';
  else if (ext === 'mp4') mimeType = 'video/mp4';

  const fileBase64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const { data, error } = await supabase.functions.invoke('telegram-upload', {
    body: {
      fileName,
      mimeType,
      fileBase64,
    },
  });

  if (error) {
    let detail = error.message;
    try {
      const bodyText = await error.context.text();
      const parsed = JSON.parse(bodyText);
      if (parsed?.error) detail = parsed.error;
    } catch {}
    throw new Error(`Edge Function invocation failed: ${detail}`);
  }

  if (!data || !data.success) {
    throw new Error(`Telegram Upload Failed: ${data?.error || 'Unknown error'}`);
  }

  return { fileId: data.file_id, messageId: data.message_id || null };
}

/**
 * Invokes the 'telegram-delete' Edge Function to delete a message from the Telegram group.
 */
export async function deleteTelegramMessage(tgMessageId: number): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('telegram-delete', {
    body: { messageId: tgMessageId },
  });

  if (error) {
    console.warn('Failed to delete message from Telegram:', error);
    return false;
  }

  return data?.success || false;
}

/**
 * Invokes the 'telegram-resolve' Supabase Edge Function to safely convert 
 * a Telegram file_id into a direct, high-speed download link.
 */
export async function getTelegramFastLink(tgFileId: string): Promise<string> {
  const cleanFileId = tgFileId.includes(':') ? tgFileId.split(':')[1] : tgFileId;
  const { data, error } = await supabase.functions.invoke('telegram-resolve', {
    body: { file_id: cleanFileId },
  });

  if (error) {
    let detail = error.message;
    try {
      const bodyText = await error.context.text();
      const parsed = JSON.parse(bodyText);
      if (parsed?.error) detail = parsed.error;
    } catch {}
    throw new Error(`Edge Function resolve failed: ${detail}`);
  }

  if (!data || !data.success) {
    throw new Error(`Failed to resolve Telegram link: ${data?.error || 'Unknown error'}`);
  }

  return data.downloadUrl;
}
