import { NativeModule, requireNativeModule } from 'expo';

declare class ExpoTestModule extends NativeModule {
  getVersion(): Promise<string>;
  configure(config: string): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): Promise<string>;
}

// This call loads the native module object
export default requireNativeModule<ExpoTestModule>('ExpoWireguard');
