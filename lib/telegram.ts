import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Invokes the 'telegram-upload' Supabase Edge Function to securely upload a file.
 * The BOT_TOKEN is kept secret in the Supabase backend.
 */
export async function uploadToTelegramViaEdge(fileUri: string, fileName: string): Promise<string> {
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

  const formData = new FormData();
  formData.append('document', {
    uri: Platform.OS === 'android' ? fileUri : fileUri.replace('file://', ''),
    name: fileName,
    type: mimeType,
  } as any);
  formData.append('fileName', fileName);

  const { data, error } = await supabase.functions.invoke('telegram-upload', {
    body: formData,
  });

  if (error) {
    throw new Error(`Edge Function invocation failed: ${error.message}`);
  }

  if (!data || !data.success) {
    throw new Error(`Telegram Upload Failed: ${data?.error || 'Unknown error'}`);
  }

  return data.file_id; // Return the fast-track Telegram file_id
}

/**
 * Invokes the 'telegram-resolve' Supabase Edge Function to safely convert 
 * a Telegram file_id into a direct, high-speed download link.
 */
export async function getTelegramFastLink(tgFileId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('telegram-resolve', {
    body: { file_id: tgFileId },
  });

  if (error) {
    throw new Error(`Edge Function resolve failed: ${error.message}`);
  }

  if (!data || !data.success) {
    throw new Error(`Failed to resolve Telegram link: ${data?.error || 'Unknown error'}`);
  }

  return data.downloadUrl;
}
