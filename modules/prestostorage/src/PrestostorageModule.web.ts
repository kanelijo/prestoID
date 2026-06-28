import { registerWebModule, NativeModule } from 'expo';

class PrestostorageModule extends NativeModule<{}> {}

export default registerWebModule(PrestostorageModule, 'PrestostorageModule');
