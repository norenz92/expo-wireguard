// filepath: /Users/adamnoren/hemla/expo-wireguard/src/ExpoWireguardModule.ts
import { requireNativeModule } from "expo-modules-core";
import { ExpoWireguardProps, NotificationConfig } from "./ExpoWireguard.types";

// Import the native module
const ExpoWireguard = requireNativeModule(
  "ExpoWireguard"
) as ExpoWireguardProps;

/**
 * Get the WireGuard version
 * @returns A promise that resolves with the WireGuard version string
 */
export function Version(): Promise<string> {
  console.log("📱 [JS] Getting WireGuard version...");
  return ExpoWireguard.Version()
    .then((version) => {
      console.log(`📱 [JS] ✅ WireGuard version: ${version}`);
      return version;
    })
    .catch((error) => {
      console.log(
        `📱 [JS] ❌ Error getting version: ${error.message || error}`
      );
      throw error;
    });
}

/**
 * Connect to WireGuard VPN
 * @param config WireGuard configuration in wg-quick format
 * @param session Descriptive name for the VPN session
 * @param notif Optional notification configuration for Android
 * @returns A promise that resolves when the connection attempt starts
 * @throws Error if the connection attempt fails
 */
export function Connect(
  config: string,
  session: string,
  notif?: NotificationConfig
): Promise<void> {
  console.log("📱 [JS] 🔄 Starting VPN connection...");
  console.log(`📱 [JS] Session: ${session}`);
  console.log(`📱 [JS] Config length: ${config.length} characters`);
  console.log(`📱 [JS] Config preview: ${config.substring(0, 100)}...`);

  return ExpoWireguard.Connect(config, session, notif)
    .then(() => {
      console.log("📱 [JS] ✅ Connect command sent to native module");
    })
    .catch((error) => {
      console.log(`📱 [JS] ❌ Connect failed: ${error.message || error}`);
      throw error;
    });
}

/**
 * Check if WireGuard VPN is connected
 * @returns A promise that resolves to true if connected, false otherwise
 */
export function Status(): Promise<boolean> {
  console.log("📱 [JS] 🔍 Checking VPN connection status...");
  return ExpoWireguard.Status()
    .then((status) => {
      console.log(
        `📱 [JS] ✅ VPN status: ${status ? "Connected" : "Disconnected"}`
      );
      return status;
    })
    .catch((error) => {
      console.log(
        `📱 [JS] ❌ Error checking status: ${error.message || error}`
      );
      throw error;
    });
}

/**
 * Disconnect from WireGuard VPN
 * @returns A promise that resolves when the disconnection request is initiated
 */
export function Disconnect(): Promise<void> {
  console.log("📱 [JS] 🔌 Disconnecting from VPN...");
  return ExpoWireguard.Disconnect()
    .then(() => {
      console.log("📱 [JS] ✅ Disconnect command sent to native module");
    })
    .catch((error) => {
      console.log(`📱 [JS] ❌ Disconnect failed: ${error.message || error}`);
      throw error;
    });
}

// Export constants for event types and event names
export const EV_TYPE_SYSTEM = ExpoWireguard.EV_TYPE_SYSTEM;
export const EV_TYPE_EXCEPTION = ExpoWireguard.EV_TYPE_EXCEPTION;
export const EV_TYPE_REGULAR = ExpoWireguard.EV_TYPE_REGULAR;
export const EV_STARTED = ExpoWireguard.EV_STARTED;
export const EV_STOPPED = ExpoWireguard.EV_STOPPED;
export const EV_STARTED_BY_SYSTEM = ExpoWireguard.EV_STARTED_BY_SYSTEM;
