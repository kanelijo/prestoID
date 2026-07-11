import * as FileSystem from 'expo-file-system/legacy';
import { unzip } from 'react-native-zip-archive';
import Aes from 'react-native-aes-crypto';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

let Updates: any;
try {
  Updates = require('expo-updates');
} catch (e) {
  console.warn('expo-updates not found. Rebuild app.');
}

// Since localDb initializes the sqlite connection, we need a way to close it.
// We assume closeDatabase() will be added to lib/localDb.ts
import { closeDatabase } from './localDb';

const SALT = process.env.EXPO_PUBLIC_KANELFLOW_VAULT_SALT || 'KANELFLOW_VAULT_SALT_2024_PRO';

/**
 * Checks if a backup exists in Google Drive.
 */
export async function checkForBackup(): Promise<{ fileId: string; iv: string; size: number; date: string } | null> {
  try {
    await GoogleSignin.hasPlayServices();
    await GoogleSignin.signIn();
    const tokens = await GoogleSignin.getTokens();
    
    const searchRes = await fetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name="backup_v1.enc"&fields=files(id,description,size,createdTime)', {
      headers: { Authorization: `Bearer ${tokens.accessToken}` }
    });
    const searchData = await searchRes.json();
    
    if (searchData.files && searchData.files.length > 0) {
      const file = searchData.files[0];
      return {
        fileId: file.id,
        iv: file.description, // We stored the IV in the description field
        size: parseInt(file.size || '0', 10),
        date: file.createdTime
      };
    }
    return null;
  } catch (error) {
    console.warn('[RestoreService] Failed to check for backup:', error);
    return null;
  }
}

/**
 * Downloads, Decrypts, and Restores the database.
 * Then Restarts the app using expo-updates.
 */
export async function restoreProcedure(userId: string, fileId: string, iv: string): Promise<boolean> {
  const encPath = `${FileSystem.cacheDirectory}backup_v1.enc`;
  const zipPath = `${FileSystem.cacheDirectory}restored.zip`;
  const unzipDir = `${FileSystem.cacheDirectory}restored_db`;
  const finalDbPath = `${FileSystem.documentDirectory}SQLite/kanelflow.db`;

  try {
    const tokens = await GoogleSignin.getTokens();
    
    // 1. Download encrypted file
    const downloadRes = await FileSystem.downloadAsync(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      encPath,
      {
        headers: { Authorization: `Bearer ${tokens.accessToken}` }
      }
    );

    if (downloadRes.status !== 200) {
      throw new Error('Failed to download backup file');
    }

    // 2. Decrypt
    const key = await Aes.pbkdf2(userId, SALT, 5000, 256, 'sha256');
    const encryptedBase64 = await FileSystem.readAsStringAsync(encPath, { encoding: 'base64' });
    const decryptedBase64 = await Aes.decrypt(encryptedBase64, key, iv, 'aes-256-cbc');

    // Save decrypted zip
    await FileSystem.writeAsStringAsync(zipPath, decryptedBase64, { encoding: 'base64' });

    // 3. Unzip
    await FileSystem.makeDirectoryAsync(unzipDir, { intermediates: true }).catch(()=>{});
    await unzip(zipPath, unzipDir);

    const unzippedDbPath = `${unzipDir}/db_dump.db`; // This was the name we used during backup

    const dbExists = await FileSystem.getInfoAsync(unzippedDbPath);
    if (!dbExists.exists) {
       throw new Error('Corrupted zip: Database file missing.');
    }

    // 4. Hot-Swap (The Senior Way)
    console.log('[RestoreService] Closing active SQLite connection...');
    closeDatabase(); // Important to prevent corruption!

    console.log('[RestoreService] Overwriting database file...');
    await FileSystem.copyAsync({ from: unzippedDbPath, to: finalDbPath });

    // Cleanup
    await FileSystem.deleteAsync(encPath, { idempotent: true });
    await FileSystem.deleteAsync(zipPath, { idempotent: true });
    await FileSystem.deleteAsync(unzipDir, { idempotent: true });

    // 5. Restart App
    console.log('[RestoreService] Restore complete. Restarting app...');
    if (Updates && Updates.reloadAsync) {
      await Updates.reloadAsync();
    } else {
      console.warn('Updates.reloadAsync not available. App requires manual restart.');
    }
    
    return true;
  } catch (e) {
    console.error('[RestoreService] Restore Engine Error:', e);
    // Cleanup on failure
    await FileSystem.deleteAsync(encPath, { idempotent: true }).catch(()=>{});
    await FileSystem.deleteAsync(zipPath, { idempotent: true }).catch(()=>{});
    await FileSystem.deleteAsync(unzipDir, { idempotent: true }).catch(()=>{});
    return false;
  }
}
