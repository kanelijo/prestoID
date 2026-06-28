import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking } from 'react-native';

const SAF_DIR_KEY = 'presto_saf_directory';

export const downloadAndOpenSaf = async (downloadUrl: string, fileName: string) => {
  try {
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
        'Please select or create a folder (e.g., "PrestoID") to save your downloaded documents. We will save this choice for future downloads.',
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

    // Create the file in the SAF directory
    const mimeType = fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
    const safFileUri = await FileSystem.StorageAccessFramework.createFileAsync(directoryUri, fileName, mimeType);

    // We first download to a temporary local cache, because downloading directly to SAF URI can fail in some Expo versions
    const tempUri = `${FileSystem.cacheDirectory}${fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
    await FileSystem.downloadAsync(downloadUrl, tempUri);

    // Read the file as Base64 and write it to SAF
    const base64Data = await FileSystem.readAsStringAsync(tempUri, { encoding: FileSystem.EncodingType.Base64 });
    await FileSystem.writeAsStringAsync(safFileUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });

    // Clean up temp file
    await FileSystem.deleteAsync(tempUri, { idempotent: true });

    // Open the SAF URI directly! This bypasses the share sheet and opens natively!
    await Linking.openURL(safFileUri);

    return { success: true };
  } catch (error: any) {
    console.error('SAF Download Error:', error);
    return { success: false, error: error.message };
  }
};
