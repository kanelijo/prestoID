import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Platform } from 'react-native';
import PrestostorageModule from '../modules/prestostorage/src/PrestostorageModule';

export const MOCKS_ROOT = `${FileSystem.documentDirectory}Mocks/`;

export const DIRS = {
  root: MOCKS_ROOT,
  images: `${MOCKS_ROOT}Mocks Images/`,
  docs: `${MOCKS_ROOT}Mocks Documents/`,
  backups: `${MOCKS_ROOT}Mocks Backups/`,
};

/**
 * Ensures the structured Mocks folder tree exists in sandbox and triggers creation in main internal storage.
 * Run once on app initialization.
 */
export async function initializeZenzaStorage() {
  try {
    for (const dir of Object.values(DIRS)) {
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }
    }

    if (Platform.OS === 'android' && PrestostorageModule?.createMocksDirectory) {
      await PrestostorageModule.createMocksDirectory();
    }
  } catch (err) {
    console.log('[Storage] Init notice:', err);
  }
}

/**
 * Saves a local image file to the public Gallery under a "Mocks Images" album using MediaStore API.
 */
export async function saveImageToPublicGallery(localUri: string, albumName: string = 'Mocks Images') {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status === 'granted') {
      const asset = await MediaLibrary.createAssetAsync(localUri);
      await MediaLibrary.createAlbumAsync(albumName, asset, false);
      return { success: true, asset };
    }
  } catch (err) {
    console.warn(`MediaLibrary save to album '${albumName}' failed:`, err);
  }
  return { success: false };
}
