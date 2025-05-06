import { registerWebModule, NativeModule } from 'expo';

import { ExpoWireguardModuleEvents } from './ExpoWireguard.types';

class ExpoWireguardModule extends NativeModule<ExpoWireguardModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(ExpoWireguardModule, 'ExpoWireguardModule');
