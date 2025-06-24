import type { StyleProp, ViewStyle } from "react-native";

// WireGuard Configuration Types
export interface WireGuardConfiguration {
  name: string;
  privateKey: string;
  address: string;
  dns?: string;
  mtu?: number;
  peers: WireGuardPeer[];
}

export interface WireGuardPeer {
  publicKey: string;
  endpoint: string;
  allowedIPs: string;
  persistentKeepalive?: number;
  presharedKey?: string;
}

// Connection State Types
export enum VPNConnectionState {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  DISCONNECTING = "disconnecting",
  RECONNECTING = "reconnecting",
  INVALID = "invalid",
}

// Event Payload Types
export type ConnectionStateChangePayload = {
  state: VPNConnectionState;
  configuration?: string;
  timestamp: number;
};

export type VPNErrorPayload = {
  error: string;
  code: string;
  configuration?: string;
};

export type ExpoWireguardModuleEvents = {
  onConnectionStateChange: (params: ConnectionStateChangePayload) => void;
  onError: (params: VPNErrorPayload) => void;
};

// Legacy types for backward compatibility
export type OnLoadEventPayload = {
  url: string;
};

export type ChangeEventPayload = {
  value: string;
};

export type ExpoWireguardViewProps = {
  url: string;
  onLoad: (event: { nativeEvent: OnLoadEventPayload }) => void;
  style?: StyleProp<ViewStyle>;
};
