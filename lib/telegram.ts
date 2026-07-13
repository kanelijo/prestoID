import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

/**
 * Invokes the 'telegram-upload' Supabase Edge Function to securely upload a file.
 * The BOT_TOKEN is kept secret in the Supabase backend.
 * onProgress(0-100) is called with real upload percentage via XHR.
 */
export async function uploadToTelegramViaEdge(
  fileUri: string,
  fileName: string,
  onProgress?: (pct: number) => void
): Promise<{ fileId: string; messageId: number | null }> {
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (!fileInfo.exists) throw new Error('File does not exist locally.');

  const ext = fileName.split('.').pop()?.toLowerCase();
  let mimeType = 'application/octet-stream';
  if (ext === 'pdf') mimeType = 'application/pdf';
  else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
  else if (ext === 'png') mimeType = 'image/png';
  else if (ext === 'mp4') mimeType = 'video/mp4';

  const fileBase64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  onProgress?.(15); // file read done

  // Use XMLHttpRequest for real upload progress events
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || anonKey || '';

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${supabaseUrl}/functions/v1/telegram-upload`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 120000;

    // Progress: XHR upload phase maps to 15% → 90%
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = 15 + Math.round((e.loaded / e.total) * 75);
        onProgress?.(pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data?.success) {
            onProgress?.(100);
            resolve({ fileId: data.file_id, messageId: data.message_id || null });
          } else {
            reject(new Error(`Telegram Upload Failed: ${data?.error || 'Unknown'}`));
          }
        } catch {
          reject(new Error('Invalid response from edge function'));
        }
      } else {
        reject(new Error(`Upload failed: HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));
    xhr.send(JSON.stringify({ fileName, mimeType, fileBase64 }));
  });
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
