import * as FileSystem from 'expo-file-system/legacy';
import { Alert, Platform } from 'react-native';
import PrestostorageModule from '../modules/prestostorage/src/PrestostorageModule';

export const downloadAndOpenSaf = async (downloadUrl: string, fileName: string) => {
  try {
    const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');

    if (Platform.OS === 'android') {
      try {
        // 1. Download to persistent app document directory
        const localUri = `${FileSystem.documentDirectory}${safeName}`;
        const downloadResult = await FileSystem.downloadAsync(downloadUrl, localUri);
        
        if (downloadResult.status < 200 || downloadResult.status >= 300) {
          await FileSystem.deleteAsync(localUri, { idempotent: true });
          throw new Error(`Server returned HTTP status code ${downloadResult.status} (failed to download).`);
        }

        // 2. Call our custom native module to insert it into MediaStore (Downloads/PrestoID)
        await PrestostorageModule.saveDocument(localUri, safeName);
        
        return { success: true, uri: localUri };
      } catch (nativeErr: any) {
        console.error("Native Storage Module Error:", nativeErr);
        return { success: false, error: nativeErr.message || 'Native module failed to save file.' };
      }
    } else {
      // iOS Implementation
      const localUri = `${FileSystem.documentDirectory}${safeName}`;
      const downloadResult = await FileSystem.downloadAsync(downloadUrl, localUri);
      
      if (downloadResult.status < 200 || downloadResult.status >= 300) {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
        throw new Error(`Server returned HTTP status code ${downloadResult.status} (failed to download).`);
      }
      
      try {
        const Sharing = require('expo-sharing');
        await Sharing.shareAsync(localUri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf' });
        return { success: true };
      } catch (iosErr: any) {
        return { success: false, error: iosErr.message };
      }
    }

  } catch (error: any) {
    console.error('Download Error:', error);
    return { success: false, error: error.message };
  }
};
