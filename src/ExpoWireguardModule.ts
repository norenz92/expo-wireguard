import { NativeModule, requireNativeModule } from "expo";

import {
  ExpoWireguardModuleEvents,
  WireGuardConfiguration,
  VPNConnectionState,
} from "./ExpoWireguard.types";

declare class ExpoWireguardModule extends NativeModule<ExpoWireguardModuleEvents> {
  // Legacy properties for backward compatibility
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;

  // WireGuard VPN Methods
  addConfiguration(config: WireGuardConfiguration): Promise<void>;
  removeConfiguration(name: string): Promise<void>;
  listConfigurations(): Promise<string[]>;
  connect(configurationName: string): Promise<void>;
  disconnect(): Promise<void>;
  getConnectionState(): Promise<VPNConnectionState>;
  getCurrentConfiguration(): Promise<string | null>;
  requestVPNPermission(): Promise<void>;

  // Utility methods
  generateKeyPair(): Promise<{ privateKey: string; publicKey: string }>;
  validateConfiguration(config: WireGuardConfiguration): Promise<boolean>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoWireguardModule>("ExpoWireguard");
