// filepath: /Users/adamnoren/hemla/expo-wireguard/src/ExpoWireguard.types.ts
/**
 * Configuration for Android notification displayed when VPN is active
 */
export interface NotificationConfig {
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
}