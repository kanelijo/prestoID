import * as FileSystem from 'expo-file-system/legacy';
import { zip } from 'react-native-zip-archive';
import Aes from 'react-native-aes-crypto';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

const SALT = process.env.EXPO_PUBLIC_KANELFLOW_VAULT_SALT || 'KANELFLOW_VAULT_SALT_2024_PRO';

/**
 * Ensures we have a valid access token. Tries to silently refresh if needed.
 */
async function getValidAccessToken() {
  try {
    await GoogleSignin.signInSilently();
    const tokens = await GoogleSignin.getTokens();
    return tokens.accessToken;
  } catch (silentError) {
    // Silent sign-in failed — try interactive
    try {
      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      return tokens.accessToken;
    } catch (interactiveError) {
      console.warn('[BackupService] Interactive sign-in also failed:', interactiveError);
      return null;
    }
  }
}

/**
 * Uploads a file to the hidden Google Drive AppData folder using multipart upload.
 */
async function uploadToGoogleDriveHidden(encryptedBase64: string, iv: string, accessToken: string) {
  const boundary = 'foo_bar_baz';
  
  // Create metadata
  const metadata = {
    name: 'backup_v1.enc',
    parents: ['appDataFolder'],
    description: iv, // Save IV in the description field for easy retrieval
  };

  // Construct multipart body
  let body = '';
  body += '--' + boundary + '\r\n';
  body += 'Content-Type: application/json; charset=UTF-8\r\n\r\n';
  body += JSON.stringify(metadata) + '\r\n';
  
  body += '--' + boundary + '\r\n';
  body += 'Content-Transfer-Encoding: base64\r\n';
  body += 'Content-Type: application/octet-stream\r\n\r\n';
  body += encryptedBase64 + '\r\n';
  body += '--' + boundary + '--';

  // First, check if the file already exists in appDataFolder so we can overwrite/delete it
  const searchRes = await fetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name="backup_v1.enc"', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const searchData = await searchRes.json();
  
  if (searchData.files && searchData.files.length > 0) {
    // Delete old backups
    for (const file of searchData.files) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    }
  }

  // Upload the new file
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(body.length),
    },
    body: body
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Drive Upload Failed: ${errorText}`);
  }

  return response.json();
}

/**
 * Main Backup Engine (Zips, Encrypts, Uploads)
 */
export async function backupProcedure(
  userId: string,
  onProgress?: (step: 'preparing' | 'compressing' | 'encrypting' | 'authorizing' | 'uploading' | 'cleaning' | 'success' | 'failed', detail?: string) => void
): Promise<boolean> {
  const dbPath = `${FileSystem.documentDirectory}SQLite/kanelflow.db`;
  const tempPath = `${FileSystem.cacheDirectory}db_dump.db`;
  const zipPath = `${FileSystem.cacheDirectory}backup.zip`;

  console.log('[BackupService] Starting WhatsApp-style backup...');

  try {
    onProgress?.('authorizing', 'Connecting to Google Drive...');
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      console.warn('[BackupService] Aborting backup: No valid access token.');
      onProgress?.('failed', 'Authentication failed. Please sign in to Google.');
      return false;
    }

    // 1. Snapshot the database
    onProgress?.('preparing', 'Snapshotting local database...');
    const dbInfo = await FileSystem.getInfoAsync(dbPath);
    if (!dbInfo.exists) {
      console.warn('[BackupService] Aborting backup: DB does not exist yet.');
      onProgress?.('failed', 'Local database not found.');
      return false;
    }
    await FileSystem.copyAsync({ from: dbPath, to: tempPath });

    // 2. Compress (Reduce size)
    onProgress?.('compressing', 'Compressing database package...');
    await zip(tempPath, zipPath);

    const zipInfo = await FileSystem.getInfoAsync(zipPath);
    const sizeBytes = zipInfo.exists ? zipInfo.size : 0;
    const sizeDisplay = sizeBytes >= 100 * 1024
      ? `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`
      : `${(sizeBytes / 1024).toFixed(1)} KB`;

    // 3. Encrypt (AES-256-CBC)
    onProgress?.('encrypting', `Encrypting package payload (${sizeDisplay})...`);
    const key = await Aes.pbkdf2(userId, SALT, 5000, 256, 'sha256');
    const iv = await Aes.randomKey(16);
    
    const fileContent = await FileSystem.readAsStringAsync(zipPath, { encoding: 'base64' });
    const encryptedData = await Aes.encrypt(fileContent, key, iv, 'aes-256-cbc');

    // 4. Upload to Google Drive AppDataFolder (Hidden)
    onProgress?.('uploading', `Uploading archive to Google Drive (${sizeDisplay})...`);
    await uploadToGoogleDriveHidden(encryptedData, iv, accessToken);

    // 5. Cleanup temp files to save phone storage
    onProgress?.('cleaning', 'Cleaning temporary workspace cache...');
    await FileSystem.deleteAsync(tempPath, { idempotent: true });
    await FileSystem.deleteAsync(zipPath, { idempotent: true });

    console.log('[BackupService] Backup successfully encrypted and uploaded to hidden Google Drive.');
    onProgress?.('success', `Backup successfully stored. Size: ${sizeDisplay}`);
    return true;
  } catch (e: any) {
    console.error('[BackupService] Backup Engine Error:', e);
    
    // Cleanup on failure
    await FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(()=>{});
    await FileSystem.deleteAsync(zipPath, { idempotent: true }).catch(()=>{});
    onProgress?.('failed', e.message || 'Drive communication failed.');
    return false;
  }
}
