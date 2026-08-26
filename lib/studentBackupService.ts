import * as FileSystem from 'expo-file-system/legacy';
import { zip, unzip } from 'react-native-zip-archive';
import Aes from 'react-native-aes-crypto';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { supabase } from './supabase';

const SALT = process.env.EXPO_PUBLIC_KANELFLOW_VAULT_SALT || 'ZENZA_STUDENT_VAULT_SALT_2026';

const GOOGLE_CONFIG = {
  webClientId: '500087439972-42l1848gjo7lm7du488ui5f44fluup5m.apps.googleusercontent.com',
  offlineAccess: true,
  scopes: [
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/drive.file',
  ],
};

async function getValidAccessToken(): Promise<string | null> {
  try {
    GoogleSignin.configure(GOOGLE_CONFIG);
    await GoogleSignin.hasPlayServices();
    await GoogleSignin.signInSilently();
    const tokens = await GoogleSignin.getTokens();
    return tokens.accessToken;
  } catch (silentError) {
    try {
      GoogleSignin.configure(GOOGLE_CONFIG);
      await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      return tokens.accessToken;
    } catch (interactiveError) {
      console.warn('[StudentBackupService] Google Sign-In failed:', interactiveError);
      return null;
    }
  }
}

/**
 * Uploads student encrypted chat & media vault to Google Drive AppDataFolder.
 */
async function uploadStudentVaultToDrive(encryptedBase64: string, iv: string, accessToken: string) {
  const boundary = 'zenza_student_chat_boundary';
  const metadata = {
    name: 'student_chats_v1.enc',
    parents: ['appDataFolder'],
    description: iv,
  };

  let body = '';
  body += '--' + boundary + '\r\n';
  body += 'Content-Type: application/json; charset=UTF-8\r\n\r\n';
  body += JSON.stringify(metadata) + '\r\n';
  body += '--' + boundary + '\r\n';
  body += 'Content-Transfer-Encoding: base64\r\n';
  body += 'Content-Type: application/octet-stream\r\n\r\n';
  body += encryptedBase64 + '\r\n';
  body += '--' + boundary + '--';

  // Delete previous student chat backup in appDataFolder
  const searchRes = await fetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name="student_chats_v1.enc"', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const searchData = await searchRes.json();

  if (searchData.files && searchData.files.length > 0) {
    for (const file of searchData.files) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }
  }

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(body.length),
    },
    body: body,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Student Drive Upload Failed: ${errText}`);
  }

  return response.json();
}

/**
 * Student WhatsApp-Style Backup Engine (Chats, Community Posts, Local Notes & Media)
 */
export async function backupStudentChatsAndMedia(
  userId: string,
  businessId?: string,
  onProgress?: (step: string, detail?: string) => void
): Promise<boolean> {
  const stagingDir = `${FileSystem.cacheDirectory}student_backup_staging/`;
  const zipPath = `${FileSystem.cacheDirectory}student_chats.zip`;

  try {
    onProgress?.('authorizing', 'Connecting to Google Drive...');
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      throw new Error('Google Sign-In required to back up chats.');
    }

    // 1. Create Staging Directory
    await FileSystem.makeDirectoryAsync(stagingDir, { intermediates: true }).catch(() => {});

    // 2. Export Peer Direct Messages
    onProgress?.('fetching_chats', 'Archiving peer chat messages...');
    const { data: messages } = await supabase
      .from('student_messages')
      .select('*')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: true });

    await FileSystem.writeAsStringAsync(
      `${stagingDir}messages.json`,
      JSON.stringify(messages || [], null, 2),
      { encoding: FileSystem.EncodingType.UTF8 }
    );

    // 3. Export Community Threads & Bookmarks
    onProgress?.('fetching_community', 'Archiving community discussions...');
    if (businessId) {
      const { data: posts } = await supabase
        .from('community_posts')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: true })
        .limit(200);

      await FileSystem.writeAsStringAsync(
        `${stagingDir}community_posts.json`,
        JSON.stringify(posts || [], null, 2),
        { encoding: FileSystem.EncodingType.UTF8 }
      );
    }

    // 4. Archive Local Downloaded Study Documents & Notes
    onProgress?.('packaging_media', 'Packaging downloaded study notes & documents...');
    const docsDir = `${FileSystem.documentDirectory}Zenza/Zenza Documents/`;
    const docsInfo = await FileSystem.getInfoAsync(docsDir);
    if (docsInfo.exists) {
      const stagingDocs = `${stagingDir}documents/`;
      await FileSystem.makeDirectoryAsync(stagingDocs, { intermediates: true }).catch(() => {});
      const files = await FileSystem.readDirectoryAsync(docsDir);
      for (const f of files.slice(0, 20)) {
        await FileSystem.copyAsync({ from: `${docsDir}${f}`, to: `${stagingDocs}${f}` }).catch(() => {});
      }
    }

    // 5. ZIP Compression
    onProgress?.('compressing', 'Compressing chat and notes archive...');
    await zip(stagingDir, zipPath);
    const zipInfo = await FileSystem.getInfoAsync(zipPath);
    const sizeBytes = zipInfo.exists ? zipInfo.size : 0;
    const sizeDisplay = sizeBytes >= 1024 * 1024
      ? `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`
      : `${(sizeBytes / 1024).toFixed(1)} KB`;

    // 6. AES-256 Encryption
    onProgress?.('encrypting', `Securing with AES-256 military encryption (${sizeDisplay})...`);
    const key = await Aes.pbkdf2(userId, SALT, 5000, 256, 'sha256');
    const iv = await Aes.randomKey(16);
    const zipBase64 = await FileSystem.readAsStringAsync(zipPath, { encoding: 'base64' });
    const encryptedData = await Aes.encrypt(zipBase64, key, iv, 'aes-256-cbc');

    // 7. Upload to Google Drive
    onProgress?.('uploading', `Uploading encrypted archive to Google Drive (${sizeDisplay})...`);
    await uploadStudentVaultToDrive(encryptedData, iv, accessToken);

    // 8. Cleanup
    await FileSystem.deleteAsync(stagingDir, { idempotent: true }).catch(() => {});
    await FileSystem.deleteAsync(zipPath, { idempotent: true }).catch(() => {});

    onProgress?.('success', `Chats & study media backed up successfully (${sizeDisplay})`);
    return true;
  } catch (err: any) {
    console.error('[StudentBackupService] Backup Error:', err);
    await FileSystem.deleteAsync(stagingDir, { idempotent: true }).catch(() => {});
    await FileSystem.deleteAsync(zipPath, { idempotent: true }).catch(() => {});
    onProgress?.('failed', err.message || 'Failed to back up chats to Google Drive.');
    return false;
  }
}
