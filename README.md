# Expo WireGuard

A native WireGuard VPN client implementation for React Native (Expo). This module provides a simple API to establish and manage WireGuard VPN connections in your Expo app.

> [!CAUTION]
> This package is under development. PRs are more than welcome.

## Features

- WireGuard VPN tunneling for iOS (Android support coming soon)
- Configuration management (add, remove, list)
- Connection state monitoring
- Key generation utilities
- Event-based connection status updates
- TypeScript support
- Background VPN operation via Network Extension

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

## Manual Network Extension Setup

The Network Extension target needs to be manually created in Xcode due to limitations with automatic target creation. Follow these steps:

### 1. Open Xcode Project
```bash
cd your-app/ios
open YourApp.xcworkspace
```

### 2. Add Network Extension Target
1. In Xcode, click on your project in the navigator
2. Click the "+" button at the bottom of the targets list
3. Choose "Network Extension" from the template list
4. Name it: `WireGuardNetworkExtension`
5. Set Bundle Identifier to: `your.bundle.id.network-extension`
6. Set Language to: Swift
7. Click "Finish"

### 3. Configure Network Extension Target
1. Select the `WireGuardNetworkExtension` target
2. In "Build Settings":
   - Set "iOS Deployment Target" to 14.0 or higher
   - Set "Swift Language Version" to 5.0
   - Add to "Framework Search Paths": `$(PROJECT_DIR)/Frameworks`
   - Add to "Other Linker Flags": `-framework wg-go`

### 4. Add Required Files
1. Copy `PacketTunnelProvider.swift` from `node_modules/expo-wireguard/ios/WireGuardNetworkExtension/` to your Network Extension target
2. Copy `Info.plist` from the same location
3. Add both files to the Network Extension target (not the main app target)

### 5. Add Frameworks
1. In the Network Extension target, go to "General" > "Frameworks and Libraries"
2. Add `NetworkExtension.framework` (from iOS SDK)
3. Add `wg-go.xcframework` from `ios/Frameworks/` (set to "Embed & Sign")

### 6. Configure Entitlements
1. Ensure both main app and Network Extension have proper entitlements
2. Main app should have: `com.apple.developer.networking.networkextension`
3. Network Extension should have the same plus app groups for data sharing

### 7. Update Info.plist
Ensure the Network Extension's Info.plist has the correct bundle identifier and is configured as a packet tunnel provider.

After completing these steps, rebuild your app and the Network Extension should be properly integrated.

## Usage

```javascript
import React, { useEffect } from 'react';
import { useEvent } from 'expo';
import ExpoWireguard from 'expo-wireguard';

function YourVPNComponent() {
  // Listen to VPN state changes
  const connectionStateChange = useEvent(ExpoWireguard, 'onConnectionStateChange');
  const errorEvent = useEvent(ExpoWireguard, 'onError');

  useEffect(() => {
    if (connectionStateChange) {
      console.log('Connection state changed:', connectionStateChange.state);
    }
  }, [connectionStateChange]);

  useEffect(() => {
    if (errorEvent) {
      console.error('VPN Error:', errorEvent.error);
    }
  }, [errorEvent]);

  const generateKeys = async () => {
    try {
      const keyPair = await ExpoWireguard.generateKeyPair();
      console.log('Private key:', keyPair.privateKey);
      console.log('Public key:', keyPair.publicKey);
    } catch (error) {
      console.error('Failed to generate keys:', error);
    }
  };

  const addConfiguration = async () => {
    try {
      const config = {
        name: 'MyVPN',
        privateKey: 'YOUR_PRIVATE_KEY_HERE',
        address: '10.0.0.2/32',
        dns: '1.1.1.1',
        peers: [{
          publicKey: 'PEER_PUBLIC_KEY_HERE',
          endpoint: 'your-vpn-server.com:51820',
          allowedIPs: '0.0.0.0/0',
          persistentKeepalive: 25
        }]
      };

      await ExpoWireguard.addConfiguration(config);
      console.log('Configuration added successfully');
    } catch (error) {
      console.error('Failed to add configuration:', error);
    }
  };

  const connect = async () => {
    try {
      await ExpoWireguard.connect('MyVPN');
      console.log('Connecting to VPN...');
    } catch (error) {
      console.error('Failed to connect:', error);
    }
  };

  const disconnect = async () => {
    try {
      await ExpoWireguard.disconnect();
      console.log('Disconnecting from VPN...');
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  };

  const checkStatus = async () => {
    try {
      const state = await ExpoWireguard.getConnectionState();
      console.log('Current state:', state);
      
      const currentConfig = await ExpoWireguard.getCurrentConfiguration();
      console.log('Current configuration:', currentConfig);
    } catch (error) {
      console.error('Failed to check status:', error);
    }
  };

  // Your component UI...
}
```

## API Reference

### Methods

#### `generateKeyPair(): Promise<{ privateKey: string; publicKey: string }>`

Generates a new WireGuard key pair.

#### `addConfiguration(config: WireGuardConfiguration): Promise<void>`

Adds a new WireGuard configuration.

- `config`: WireGuardConfiguration object with the following structure:
  ```typescript
  {
    name: string;
    privateKey: string;
    address: string;
    dns?: string;
    mtu?: number;
    peers: Array<{
      publicKey: string;
      endpoint: string;
      allowedIPs: string;
      persistentKeepalive?: number;
      presharedKey?: string;
    }>;
  }
  ```

#### `removeConfiguration(name: string): Promise<void>`

Removes a configuration by name.

#### `listConfigurations(): Promise<string[]>`

Returns a list of all saved configuration names.

#### `connect(configurationName: string): Promise<void>`

Connects to a VPN using the specified configuration name.

#### `disconnect(): Promise<void>`

Disconnects from the current VPN connection.

#### `getConnectionState(): Promise<VPNConnectionState>`

Returns the current connection state. Possible values:
- `disconnected`
- `connecting`
- `connected`
- `disconnecting`
- `reconnecting`
- `invalid`

#### `getCurrentConfiguration(): Promise<string | null>`

Returns the name of the currently active configuration, or null if none.

#### `validateConfiguration(config: WireGuardConfiguration): Promise<boolean>`

Validates a configuration object without saving it.

### Events

Listen to these events using Expo's `useEvent` hook:

#### `onConnectionStateChange`

Fired when the VPN connection state changes.

Payload:
```typescript
{
  state: VPNConnectionState;
  configuration?: string;
  timestamp: number;
}
```

#### `onError`

Fired when an error occurs.

Payload:
```typescript
{
  error: string;
  code: string;
  configuration?: string;
}
```

### Legacy Methods (for backward compatibility)

#### `hello(): string`

Returns a greeting message.

#### `setValueAsync(value: string): Promise<void>`

Sets a value and fires the `onChange` event.

## Types

### WireGuardConfiguration

```typescript
interface WireGuardConfiguration {
  name: string;
  privateKey: string;
  address: string;
  dns?: string;
  mtu?: number;
  peers: WireGuardPeer[];
}
```

### WireGuardPeer

```typescript
interface WireGuardPeer {
  publicKey: string;
  endpoint: string;
  allowedIPs: string;
  persistentKeepalive?: number;
  presharedKey?: string;
}
```

### VPNConnectionState

```typescript
enum VPNConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
  RECONNECTING = 'reconnecting',
  INVALID = 'invalid'
}
```

## Development

To work on this module:

1. Clone the repository
2. Install dependencies: `npm install`
3. Build the module: `npm run build`
4. Test with the example app:
   ```bash
   cd example
   npx expo prebuild
   npx expo run:ios
   ```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
