import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DownloadState {
  downloadedFiles: Record<string, string>; // Maps post ID or File ID to local URI
  markAsDownloaded: (id: string, uri: string) => void;
  removeDownload: (id: string) => void;
}

export const useDownloadStore = create<DownloadState>()(
  persist(
    (set) => ({
      downloadedFiles: {},
      markAsDownloaded: (id, uri) =>
        set((state) => ({
          downloadedFiles: { ...state.downloadedFiles, [id]: uri },
        })),
      removeDownload: (id) =>
        set((state) => {
          const newFiles = { ...state.downloadedFiles };
          delete newFiles[id];
          return { downloadedFiles: newFiles };
        }),
    }),
    {
      name: 'presto-downloads-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
