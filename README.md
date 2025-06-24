# Expo WireGuard

A native WireGuard VPN client for React Native (Expo) with iOS support.

> [!CAUTION]
> This package is under development. PRs are welcome.

## Features

- WireGuard VPN tunneling for iOS
- Configuration management (add, remove, list)
- Connection state monitoring
- Key generation utilities
- Background VPN operation via Network Extension
- TypeScript support

## Installation

```bash
npm install expo-wireguard
```

## Requirements

- iOS 15.1+ with Network Extension capability
- Apple Developer account with Network Extension entitlement
- Basic WireGuard configuration knowledge

## Setup

1. Add the plugin to your `app.json` with your Apple Developer Team ID:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-wireguard",
        {
          "developmentTeam": "YOUR_TEAM_ID"
        }
      ]
    ],
    "ios": {
      "bundleIdentifier": "com.yourcompany.yourapp"
    }
  }
}
```

2. Generate native files:
```bash
npx expo prebuild
```

That's it! The plugin automatically:
- Creates the Network Extension target
- Configures required entitlements
- Sets up proper code signing
- Links the WireGuard framework

## Usage

```javascript
import { useEvent } from 'expo';
import ExpoWireguard from 'expo-wireguard';

function VPNComponent() {
  const connectionStateChange = useEvent(ExpoWireguard, 'onConnectionStateChange');
  
  const connect = async () => {
    const config = {
      name: 'MyVPN',
      privateKey: 'YOUR_PRIVATE_KEY',
      address: '10.0.0.2/32',
      dns: '1.1.1.1',
      peers: [{
        publicKey: 'PEER_PUBLIC_KEY',
        endpoint: 'server.com:51820',
        allowedIPs: '0.0.0.0/0'
      }]
    };
    
    await ExpoWireguard.addConfiguration(config);
    await ExpoWireguard.connect('MyVPN');
  };
  
  // ...
}
```

## API Reference

### Core Methods

- `generateKeyPair()` - Generate WireGuard key pair
- `addConfiguration(config)` - Add VPN configuration
- `connect(name)` - Connect to VPN
- `disconnect()` - Disconnect VPN
- `getConnectionState()` - Get current state
- `listConfigurations()` - List saved configs

### Events

- `onConnectionStateChange` - Connection state updates
- `onError` - Error notifications

### Types

```typescript
interface WireGuardConfiguration {
  name: string;
  privateKey: string;
  address: string;
  dns?: string;
  peers: Array<{
    publicKey: string;
    endpoint: string;
    allowedIPs: string;
    persistentKeepalive?: number;
  }>;
}
```

## Contributing

Contributions welcome! Submit PRs or issues.

## License

MIT
