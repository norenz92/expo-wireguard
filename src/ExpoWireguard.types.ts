// filepath: /Users/adamnoren/hemla/expo-wireguard/src/ExpoWireguard.types.ts
/**
 * Configuration for Android notification displayed when VPN is active
 */
export type NotificationConfig = {
  /**
   * Name of the icon in /res directory (Android only)
   */
  icon?: string;

  /**
   * Title of the notification
   */
  title: string;

  /**
   * Text content of the notification
   */
  text: string;
};

export type WireGuardEvent = "EV_STARTED" | "EV_STOPPED" | "EV_STARTED_BY_SYSTEM";
export type WireGuardEventType = "EV_TYPE_SYSTEM" | "EV_TYPE_EXCEPTION" | "EV_TYPE_REGULAR";

export interface ExpoWireguardProps {
  /**
   * Event types for WireGuard events
   */
  EV_TYPE_SYSTEM: "EV_TYPE_SYSTEM";
  EV_TYPE_EXCEPTION: "EV_TYPE_EXCEPTION";
  EV_TYPE_REGULAR: "EV_TYPE_REGULAR";

  /**
   * Event names for regular WireGuard events
   */
  EV_STARTED: "EV_STARTED";
  EV_STOPPED: "EV_STOPPED";
  EV_STARTED_BY_SYSTEM: "EV_STARTED_BY_SYSTEM";

  /**
   * Get the WireGuard version
   * @returns A promise that resolves with the WireGuard version string
   */
  Version(): Promise<string>;

  /**
   * Connect to WireGuard VPN
   * @param config WireGuard configuration in wg-quick format
   * @param session Descriptive name for the VPN session
   * @param notif Optional notification configuration for Android
   * @returns A promise that resolves when the connection attempt starts (not necessarily when connection is established)
   * @throws Error if the connection attempt fails
   */
  Connect(config: string, session: string, notif?: NotificationConfig): Promise<void>;

  /**
   * Check if WireGuard VPN is connected
   * @returns A promise that resolves to true if connected, false otherwise
   */
  Status(): Promise<boolean>;

  /**
   * Disconnect from WireGuard VPN
   * @returns A promise that resolves when the disconnection request is initiated
   */
  Disconnect(): Promise<void>;
}