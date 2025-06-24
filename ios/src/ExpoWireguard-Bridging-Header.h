//
//  ExpoWireguard-Bridging-Header.h
//  ExpoWireguard
//
//  Created by Expo WireGuard Module
//

#ifndef ExpoWireguard_Bridging_Header_h
#define ExpoWireguard_Bridging_Header_h

// NOTE: wireguard.h is NOT imported here because the main app doesn't need direct access to wg-go functions.
// The main app only manages VPN connections through NetworkExtension framework.
// The actual WireGuard implementation (wg-go) is only used in the Network Extension target.

#endif /* ExpoWireguard_Bridging_Header_h */
