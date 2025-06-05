# VPN Testing Guide for expo-wireguard

## Issues Fixed

### 1. Key Mismatch Between Main Module and NetworkExtension
**Problem**: The main module was storing the WireGuard configuration under the key `"wgQuickConfig"` but the NetworkExtension was looking for `"config"`.

**Fix**: Updated `ExpoWireguardModule.swift` to:
- Use the key `"config"` instead of `"wgQuickConfig"`
- Convert the configuration string to `Data` format as expected by NetworkExtension
- Added proper error handling for data conversion

### 2. Missing Source Files in NetworkExtension Target
**Problem**: The NetworkExtension target was created but didn't include the `PacketTunnelProvider.swift` file in its Sources build phase.

**Fix**: Enhanced the plugin to automatically add source files to the target's Sources build phase.

### 3. WireGuardKit Dependency Issues
**Problem**: The original template tried to import WireGuardKit which wasn't properly linked.

**Fix**: Simplified the NetworkExtension implementation to remove WireGuardKit dependencies for now, allowing the target to compile successfully.

## Current Implementation Status

### ✅ Completed
- NetworkExtension target creation and configuration
- Proper entitlements setup for both main app and extension
- Source file inclusion in build phases
- Basic PacketTunnelProvider implementation that compiles
- Configuration data passing from main app to extension
- Enhanced logging for debugging

### 🚧 In Progress
- VPN profile installation testing
- Configuration data validation in NetworkExtension
- Real device testing (simulator has VPN limitations)

### 📋 Next Steps
1. **Test VPN Profile Installation**: Verify that VPN configurations are properly saved and loaded
2. **Integrate wg-go**: Replace placeholder implementation with actual WireGuard functionality
3. **Real Device Testing**: Test on physical iOS devices where VPN functionality works properly
4. **Error Handling**: Improve error handling for various failure scenarios

## Testing the Current Implementation

### Prerequisites
- Apple Developer Account with valid Team ID
- iOS device (simulator has VPN limitations)
- Valid WireGuard configuration

### Testing Steps
1. **Build and Run**: `npx expo run:ios`
2. **Press Connect**: Monitor console logs for debugging information
3. **Check VPN Settings**: Go to iOS Settings > VPN to see if profile is installed
4. **Monitor Logs**: Look for:
   - Configuration encoding logs in main app
   - Configuration loading logs in NetworkExtension
   - VPN status change events

### Expected Behavior
- App should save VPN configuration without errors
- Configuration should be passed to NetworkExtension
- NetworkExtension should start successfully (even as placeholder)
- VPN profile should appear in iOS Settings

### Known Limitations
- **Simulator**: VPN functionality is limited in iOS Simulator
- **Placeholder Implementation**: Current NetworkExtension doesn't perform actual VPN tunneling
- **User Permission**: First-time VPN profile installation requires user permission

## Debugging

### Console Logs to Monitor
- `🔄 Starting VPN connection process...`
- `✅ Config data encoded: X bytes`
- `✅ VPN configuration saved successfully`
- `✅ VPN configuration loaded successfully`
- `Starting WireGuard tunnel` (from NetworkExtension)
- `WireGuard configuration loaded successfully` (from NetworkExtension)

### Common Issues
1. **Permission Denied**: User needs to approve VPN profile installation
2. **Simulator Limitations**: Use real device for full VPN testing
3. **Provisioning Issues**: Ensure proper Apple Developer Team ID configuration
4. **Configuration Errors**: Verify WireGuard configuration format

## Next Development Phase

### Integration with wg-go
1. Link `wg-go.xcframework` properly with NetworkExtension target
2. Replace placeholder implementation with actual WireGuard tunnel creation
3. Handle packet routing and network interface setup
4. Implement proper tunnel lifecycle management

### Enhanced Error Handling
1. Validate WireGuard configuration syntax
2. Provide user-friendly error messages
3. Handle network permission scenarios
4. Implement connection retry logic

This guide documents the current state and next steps for the expo-wireguard VPN implementation.
