import { NativeModule, requireNativeModule } from 'expo';

declare class PrestostorageModule extends NativeModule<{}> {
  saveDocument(localUri: string, fileName: string): Promise<{ success: boolean; uri: string; legacy?: boolean; isRoot?: boolean }>;
  createMocksDirectory(): Promise<{ success: boolean; path?: string; canWrite?: boolean; created?: boolean; error?: string }>;
  hasStoragePermission(): Promise<boolean>;
  requestStoragePermission(): Promise<{ requested: boolean; type?: string; alreadyGranted?: boolean }>;
}

export default requireNativeModule<PrestostorageModule>('Prestostorage');
