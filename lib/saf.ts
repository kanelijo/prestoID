import * as FileSystem from 'expo-file-system/legacy';
import { Alert, Platform } from 'react-native';
import PrestostorageModule from '../modules/prestostorage/src/PrestostorageModule';

export const downloadAndOpenSaf = async (downloadUrl: string, fileName: string) => {
  try {
    const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');

    if (Platform.OS === 'android') {
      try {
        // 1. Download to temporary hidden cache directory first
        const tempUri = `${FileSystem.cacheDirectory}${safeName}`;
        await FileSystem.downloadAsync(downloadUrl, tempUri);

        // 2. Call our custom native module to insert it into MediaStore (Downloads/PrestoID)
        // and instantly open it using Android Intent.
        const result = await PrestostorageModule.saveAndOpenDocument(tempUri, safeName);
        
        // 3. Clean up cache
        await FileSystem.deleteAsync(tempUri, { idempotent: true });
        
        return { success: true, uri: result.uri };
      } catch (nativeErr: any) {
        console.error("Native Storage Module Error:", nativeErr);
        return { success: false, error: nativeErr.message || 'Native module failed to save file.' };
      }
    } else {
      // iOS Implementation
      const localUri = `${FileSystem.documentDirectory}${safeName}`;
      await FileSystem.downloadAsync(downloadUrl, localUri);
      
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
