> [!CAUTION]
> This package is under development. PRs are more than welcome.

# Expo WireGuard

A native WireGuard VPN client implementation for React Native (Expo). This module provides a simple API to establish and manage WireGuard VPN connections in your Expo app.

## Features

- WireGuard VPN tunneling for iOS (Android support coming soon)
- Standard wg-quick configuration format
- Event-based connection status updates
- TypeScript support

## Installation

```bash
# Using npm
npm install expo-wireguard

# Using Yarn
yarn add expo-wireguard
```

## Requirements

- iOS 15.1+ for the Network Extension capability
- A valid Apple Developer account with Network Extension entitlement enabled
- Basic understanding of WireGuard configuration

## Setup

### iOS

1. Add the plugin to your app.json:

```json
{
  "expo": {
    "plugins": ["expo-wireguard"],
    "ios": {
      "bundleIdentifier": "com.yourcompany.yourapp",
      "entitlements": {
        "com.apple.developer.networking.networkextension": ["packet-tunnel-provider"],
        "com.apple.security.application-groups": ["group.com.yourcompany.yourapp"]
      }
    }
  }
}
```

2. Make sure your Apple Developer account has the Network Extension capability enabled

3. Use EAS or `expo prebuild` to generate the native project files:

```bash
npx expo prebuild
# or
eas build --platform ios --profile development --local
```

## Usage

```javascript
import React, { useEffect } from 'react';
import { DeviceEventEmitter } from 'react-native';
import WireGuard from 'expo-wireguard';

function YourVPNComponent() {
  useEffect(() => {
    // Get the WireGuard version
    WireGuard.Version().then(version => console.log("WireGuard version:", version));

    // Listen for connection events
    const regularEventListener = DeviceEventEmitter.addListener(
      WireGuard.EV_TYPE_REGULAR,
      (event) => {
        if (event.event === WireGuard.EV_STARTED) {
          console.log('VPN Connected!');
        } else if (event.event === WireGuard.EV_STOPPED) {
          console.log('VPN Disconnected');
        }
      }
    );

    // Listen for error events
    const exceptionEventListener = DeviceEventEmitter.addListener(
      WireGuard.EV_TYPE_EXCEPTION,
      (error) => {
        console.error('VPN Error:', error.message || error);
      }
    );

    // Clean up listeners
    return () => {
      regularEventListener.remove();
      exceptionEventListener.remove();
    };
  }, []);

  const connectVPN = async () => {
    const config = `
      [Interface]
      PrivateKey = YOUR_PRIVATE_KEY_HERE
      Address = 10.0.0.2/32
      DNS = 1.1.1.1, 8.8.8.8

      [Peer]
      PublicKey = PEER_PUBLIC_KEY_HERE
      AllowedIPs = 0.0.0.0/0, ::/0
      Endpoint = your-vpn-server.com:51820
    `;

    const sessionName = 'My VPN Connection';

    try {
      await WireGuard.Connect(config, sessionName);
    } catch (error) {
      console.error('Failed to connect to VPN:', error);
    }
  };

  const disconnectVPN = async () => {
    try {
      await WireGuard.Disconnect();
    } catch (error) {
      console.error('Failed to disconnect from VPN:', error);
    }
  };

  const checkStatus = async () => {
    const isConnected = await WireGuard.Status();
    console.log('VPN connected:', isConnected);
    return isConnected;
  };

  // Your component UI...
}
```

## API Reference

### Methods

#### `Version(): Promise<string>`

Returns the WireGuard version string.

#### `Connect(config: string, session: string, notif?: NotificationConfig): Promise<void>`

Establishes a VPN connection.

- `config`: WireGuard configuration in wg-quick format 
- `session`: A descriptive name for the VPN session
- `notif`: (Android only) Notification configuration

#### `Status(): Promise<boolean>`

Checks if VPN is currently connected.

#### `Disconnect(): Promise<void>`

Terminates the VPN connection.

### Events

Listen to these events using React Native's `DeviceEventEmitter`:

#### `WireGuard.EV_TYPE_REGULAR`

Regular VPN events:
- `WireGuard.EV_STARTED`: VPN connection established
- `WireGuard.EV_STOPPED`: VPN connection terminated

#### `WireGuard.EV_TYPE_EXCEPTION`

Error events with a `message` property.

#### `WireGuard.EV_TYPE_SYSTEM`

System events:
- `WireGuard.EV_STARTED_BY_SYSTEM`: VPN service started by the system

## Types

### NotificationConfig

```typescript
type NotificationConfig = {
  icon?: string;  // Name of the icon in /res directory (Android only)
  title: string;  // Title of the notification 
  text: string;   // Text content of the notification
};
```

## License

MIT
