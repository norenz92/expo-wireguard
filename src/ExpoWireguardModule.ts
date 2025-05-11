// filepath: /Users/adamnoren/hemla/expo-wireguard/src/ExpoWireguardModule.ts
import { requireNativeModule } from 'expo-modules-core';
import { ExpoWireguardProps, NotificationConfig } from './ExpoWireguard.types';

// Import the native module
const ExpoWireguard = requireNativeModule('ExpoWireguard') as ExpoWireguardProps;

/**
 * Get the WireGuard version
 * @returns A promise that resolves with the WireGuard version string
 */
export function Version(): Promise<string> {
  return ExpoWireguard.Version();
}

/**
 * Connect to WireGuard VPN
 * @param config WireGuard configuration in wg-quick format
 * @param session Descriptive name for the VPN session
 * @param notif Optional notification configuration for Android
 * @returns A promise that resolves when the connection attempt starts
 * @throws Error if the connection attempt fails
 */
export function Connect(config: string, session: string, notif?: NotificationConfig): Promise<void> {
  return ExpoWireguard.Connect(config, session, notif);
}

/**
 * Check if WireGuard VPN is connected
 * @returns A promise that resolves to true if connected, false otherwise
 */
export function Status(): Promise<boolean> {
  return ExpoWireguard.Status();
}

/**
 * Disconnect from WireGuard VPN
 * @returns A promise that resolves when the disconnection request is initiated
 */
export function Disconnect(): Promise<void> {
  return ExpoWireguard.Disconnect();
}

// Export constants for event types and event names
export const EV_TYPE_SYSTEM = ExpoWireguard.EV_TYPE_SYSTEM;
export const EV_TYPE_EXCEPTION = ExpoWireguard.EV_TYPE_EXCEPTION;
export const EV_TYPE_REGULAR = ExpoWireguard.EV_TYPE_REGULAR;
export const EV_STARTED = ExpoWireguard.EV_STARTED;
export const EV_STOPPED = ExpoWireguard.EV_STOPPED;
export const EV_STARTED_BY_SYSTEM = ExpoWireguard.EV_STARTED_BY_SYSTEM;