// filepath: /Users/adamnoren/hemla/expo-wireguard/src/index.ts
import WireGuardModule from './ExpoWireguardModule';
import { NotificationConfig } from './ExpoWireguard.types';

// Re-export types
export { NotificationConfig } from './ExpoWireguard.types';

/**
 * Expo WireGuard Module
 * 
 * This module provides WireGuard VPN functionality for React Native (Expo) applications.
 * It uses the native WireGuard libraries for both iOS and Android.
 * 
 * @example
 * ```javascript
 * import WireGuard from 'expo-wireguard';
 * import { DeviceEventEmitter } from 'react-native';
 * 
 * // Gets the version of the underying wireguard-go
 * WireGuard.Version().then((v) => this.setState{version: v});
 * 
 * // Config is of type wg-quick
 * var config = `
 *     [Interface]
 *     PrivateKey = mBEJJwnMh6Ht9xLp88nTtHqmOY9pnN7YdriotquvgVI=
 *     Address = 192.168.7.237/32, fdaa::7f3/128
 *     DNS = 192.168.0.0, fdaa::
 * 
 *     [Peer]
 *     PublicKey = Cf0rdfToO5gxg7ObB6dLbTwfElO3Xx7Fh8jJobmqCnE=
 *     AllowedIPs = 0.0.0.0/0, ::/0
 *     Endpoint = 209.97.177.222:51820`;
 * 
 * // A name for your session
 * var session = 'MyVPNSession';
 * 
 * // After a successfull connection, application is brought to
 * // foreground and needs a notification
 * var notif = {
 *     icon: 'ic_notif_icon', // Name of the icon in /res directory
 *     title: 'My VPN',
 *     text: 'Connected to ' + country;
 * }
 * 
 * // Starts the VPN connection
 * WireGuard.Connect(config, session, notif).catch(
 *     (e) => console.warn(e.message));
 * 
 * // Listen for VPN events
 * DeviceEventEmitter.addListener(WireGuard.EV_TYPE_REGULAR, (e) => {
 *     if(e === WireGuard.EV_STOPPED) {
 *         // Update state
 *     } else if(e === WireGuard.EV_STARTED) {
 *         // Update state
 *     }
 * });
 * ```
 */
export default {
  /**
   * System event type identifier
   */
  EV_TYPE_SYSTEM: WireGuardModule.EV_TYPE_SYSTEM,

  /**
   * Exception event type identifier
   */
  EV_TYPE_EXCEPTION: WireGuardModule.EV_TYPE_EXCEPTION,

  /**
   * Regular event type identifier
   */
  EV_TYPE_REGULAR: WireGuardModule.EV_TYPE_REGULAR,

  /**
   * Event identifier when VPN connection is established
   */
  EV_STARTED: WireGuardModule.EV_STARTED,

  /**
   * Event identifier when VPN connection is terminated
   */
  EV_STOPPED: WireGuardModule.EV_STOPPED,

  /**
   * Event identifier when VPN is started by the system
   */
  EV_STARTED_BY_SYSTEM: WireGuardModule.EV_STARTED_BY_SYSTEM,

  /**
   * Returns the version of the underlying wireguard-go library
   * @returns A promise that resolves to the version string
   */
  Version(): Promise<string> {
    return WireGuardModule.Version();
  },

  /**
   * Establishes a WireGuard VPN connection using the provided configuration
   * @param config A string containing the WireGuard configuration in wg-quick format
   * @param session A name for the VPN session
   * @param notif An optional notification configuration for Android
   * @returns A promise that resolves when the connection attempt has been initiated
   */
  Connect(config: string, session: string, notif?: NotificationConfig): Promise<void> {
    return WireGuardModule.Connect(config, session, notif);
  },

  /**
   * Disconnects the active WireGuard VPN session
   * @returns A promise that resolves when the disconnection has been initiated
   */
  Disconnect(): Promise<void> {
    return WireGuardModule.Disconnect();
  },

  /**
   * Checks the current status of the WireGuard VPN connection
   * @returns A promise that resolves to a boolean indicating if the VPN is connected
   */
  Status(): Promise<boolean> {
    return WireGuardModule.Status();
  }
};