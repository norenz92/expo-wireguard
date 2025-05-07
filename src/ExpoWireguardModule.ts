import { NativeModule, requireNativeModule } from 'expo';

declare class ExpoWireguardModule extends NativeModule {
  getTheme(): string;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoWireguardModule>('ExpoWireguard');
