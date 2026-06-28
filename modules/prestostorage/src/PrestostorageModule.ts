import { NativeModule, requireNativeModule } from 'expo';

declare class PrestostorageModule extends NativeModule<{}> {
  saveAndOpenDocument(localUri: string, fileName: string): Promise<{ success: boolean; uri: string; legacy: boolean }>;
}

export default requireNativeModule<PrestostorageModule>('Prestostorage');
