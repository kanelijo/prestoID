import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Platform } from 'react-native';

export const ZENZA_ROOT = `${FileSystem.documentDirectory}Zenza/`;

export const DIRS = {
  root: ZENZA_ROOT,
  images: `${ZENZA_ROOT}Zenza Images/`,
  docs: `${ZENZA_ROOT}Zenza Documents/`,
  backups: `${ZENZA_ROOT}Zenza Backups/`,
};

/**
 * Ensures the structured Zenza folder tree exists in the private app sandbox.
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
  } catch (err) {
    console.warn('Failed to initialize Zenza storage tree:', err);
  }
}

/**
 * Saves a local image file to the public Gallery under a "Zenza Images" album using MediaStore API.
 */
export async function saveImageToPublicGallery(localUri: string, albumName: string = 'Zenza Images') {
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
