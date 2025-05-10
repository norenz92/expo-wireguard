// filepath: /Users/adamnoren/hemla/expo-wireguard/src/ExpoWireguardModule.ts
import { requireNativeModule } from 'expo-modules-core';

/**
 * This describes the native WireGuard module interface
 */
interface ExpoWireguardInterface {
  // Constants
  readonly EV_TYPE_SYSTEM: string;
  readonly EV_TYPE_EXCEPTION: string;
  readonly EV_TYPE_REGULAR: string;
  readonly EV_STARTED: string;
  readonly EV_STOPPED: string;
  readonly EV_STARTED_BY_SYSTEM: string;

  /**
   * Returns the version of the underlying wireguard-go library
   * @returns A promise that resolves to the version string
   */
  Version(): Promise<string>;

  /**
   * Establishes a WireGuard VPN connection using the provided configuration
   * @param config A string containing the WireGuard configuration in wg-quick format
   * @param session A name for the VPN session
   * @param notif An optional notification configuration for Android
   * @returns A promise that resolves when the connection attempt has been initiated
   */
  Connect(config: string, session: string, notif?: Record<string, any>): Promise<void>;

  /**
   * Disconnects the active WireGuard VPN session
   * @returns A promise that resolves when the disconnection has been initiated
   */
  Disconnect(): Promise<void>;

  /**
   * Checks the current status of the WireGuard VPN connection
   * @returns A promise that resolves to a boolean indicating if the VPN is connected
   */
  Status(): Promise<boolean>;
}

// This call loads the native module object
export default requireNativeModule<ExpoWireguardInterface>('ExpoWireguard');