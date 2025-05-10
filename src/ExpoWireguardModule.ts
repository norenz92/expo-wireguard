import { requireNativeModule, NativeModule } from 'expo';
import { ExpoWireguardModuleEvents } from './ExpoWireguard.types'

declare class ExpoWireguardModule extends NativeModule<ExpoWireguardModuleEvents> {
  configure: (config: string) => void;
}

// This call loads the native module object
export default requireNativeModule<ExpoWireguardModule>('ExpoWireguard');
