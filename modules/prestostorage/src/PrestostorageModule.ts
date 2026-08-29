import { NativeModule, requireNativeModule } from 'expo';

declare class PrestostorageModule extends NativeModule<{}> {
  saveDocument(localUri: string, fileName: string): Promise<{ success: boolean; uri: string; legacy?: boolean; isRoot?: boolean }>;
  createMocksDirectory(): Promise<{ success: boolean; path?: string; error?: string }>;
}

export default requireNativeModule<PrestostorageModule>('Prestostorage');
