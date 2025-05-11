// filepath: /Users/adamnoren/hemla/expo-wireguard/src/index.ts

// Export the core API functions
import {
  Version,
  Connect,
  Status,
  Disconnect,
  // Event types
  EV_TYPE_SYSTEM,
  EV_TYPE_EXCEPTION,
  EV_TYPE_REGULAR,
  // Event names
  EV_STARTED,
  EV_STOPPED,
  EV_STARTED_BY_SYSTEM,
} from './ExpoWireguardModule';

// Export types
import { NotificationConfig, WireGuardEvent, WireGuardEventType } from './ExpoWireguard.types';

// Default export with all functions and constants
export default {
  Version,
  Connect,
  Status,
  Disconnect,
  // Event types
  EV_TYPE_SYSTEM,
  EV_TYPE_EXCEPTION,
  EV_TYPE_REGULAR,
  // Event names
  EV_STARTED,
  EV_STOPPED,
  EV_STARTED_BY_SYSTEM,
};

// Named exports for those who prefer them
export {
  Version,
  Connect,
  Status,
  Disconnect,
  // Event types
  EV_TYPE_SYSTEM,
  EV_TYPE_EXCEPTION,
  EV_TYPE_REGULAR,
  // Event names
  EV_STARTED,
  EV_STOPPED,
  EV_STARTED_BY_SYSTEM,
  // Types
  NotificationConfig,
  WireGuardEvent,
  WireGuardEventType,
};

// Note: The plugin is intentionally not exported here to prevent 
// Node.js dependencies from being bundled with the React Native app.
// Import the plugin directly from app.plugin.js when configuring your Expo app.