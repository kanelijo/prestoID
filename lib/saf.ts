import * as FileSystem from 'expo-file-system/legacy';
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SAF_DIR_KEY = 'presto_saf_directory';

export const downloadAndOpenSaf = async (downloadUrl: string, fileName: string) => {
  try {
    const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');

    if (Platform.OS === 'android') {
      try {
        // Attempt 1: Automatic Folder Creation (The WhatsApp/Telegram Way)
        // We will try to create a folder in the public Downloads directory.
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
        );

        if (granted === PermissionsAndroid.RESULTS.GRANTED || granted === 'never_ask_again' || Platform.Version >= 33) {
          // In Android 11+ (API 30+) and especially 13+ (API 33+), WRITE_EXTERNAL_STORAGE is deprecated.
          // But apps can still write to public directories like Download/ or Documents/ freely.
          const prestoDir = 'file:///storage/emulated/0/Download/PrestoID/';
          
          const dirInfo = await FileSystem.getInfoAsync(prestoDir);
          if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(prestoDir, { intermediates: true });
          }

          const fileUri = `${prestoDir}${safeName}`;
          
          // Download directly to the public folder
          await FileSystem.downloadAsync(downloadUrl, fileUri);

          // Get the content URI so we can open it natively
          const contentUri = await FileSystem.getContentUriAsync(fileUri);
          
          await Linking.openURL(contentUri);
          return { success: true };
        }
      } catch (autoErr) {
        console.warn("Auto folder creation failed, falling back to SAF:", autoErr);
        // Fall through to Attempt 2
      }

      // Attempt 2: Storage Access Framework (SAF) Fallback
      let directoryUri = await AsyncStorage.getItem(SAF_DIR_KEY);
      let hasPermission = false;

      if (directoryUri) {
        try {
          await FileSystem.StorageAccessFramework.readDirectoryAsync(directoryUri);
          hasPermission = true;
        } catch (e) {
          hasPermission = false;
        }
      }

      if (!hasPermission) {
        Alert.alert(
          'Select Download Folder',
          'Please create a "PrestoID" folder to save your downloaded documents. We will save this choice for future downloads.',
        );
        
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          directoryUri = permissions.directoryUri;
          await AsyncStorage.setItem(SAF_DIR_KEY, directoryUri);
        } else {
          return { success: false, error: 'Permission denied to save files.' };
        }
      }

      if (!directoryUri) return { success: false, error: 'No directory selected.' };

      const mimeType = fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
      const safFileUri = await FileSystem.StorageAccessFramework.createFileAsync(directoryUri, safeName, mimeType);

      const tempUri = `${FileSystem.cacheDirectory}${safeName}`;
      await FileSystem.downloadAsync(downloadUrl, tempUri);

      const base64Data = await FileSystem.readAsStringAsync(tempUri, { encoding: FileSystem.EncodingType.Base64 });
      await FileSystem.writeAsStringAsync(safFileUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
      await FileSystem.deleteAsync(tempUri, { idempotent: true });

      await Linking.openURL(safFileUri);
      return { success: true };
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
    console.error('SAF Download Error:', error);
    return { success: false, error: error.message };
  }
};
