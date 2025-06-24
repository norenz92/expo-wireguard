import Foundation

public struct WireGuardConfiguration: Codable {
    public let name: String
    public let privateKey: String
    public let address: String
    public let dns: String?
    public let mtu: Int?
    public let peers: [WireGuardPeer]
    
    public init(name: String, privateKey: String, address: String, dns: String? = nil, mtu: Int? = nil, peers: [WireGuardPeer]) {
        self.name = name
        self.privateKey = privateKey
        self.address = address
        self.dns = dns
        self.mtu = mtu
        self.peers = peers
    }
    
    /// Converts the configuration to WireGuard config format
    public func toWGConfig() -> String {
        var config = """
        [Interface]
        PrivateKey = \(privateKey)
        Address = \(address)
        """
        
        if let dns = dns {
            config += "\nDNS = \(dns)"
        }
        
        if let mtu = mtu {
            config += "\nMTU = \(mtu)"
        }
        
        for peer in peers {
            config += "\n\n[Peer]"
            config += "\nPublicKey = \(peer.publicKey)"
            config += "\nEndpoint = \(peer.endpoint)"
            config += "\nAllowedIPs = \(peer.allowedIPs)"
            
            if let presharedKey = peer.presharedKey {
                config += "\nPresharedKey = \(presharedKey)"
            }
            
            if let persistentKeepalive = peer.persistentKeepalive {
                config += "\nPersistentKeepalive = \(persistentKeepalive)"
            }
        }
        
        return config
    }
}

public struct WireGuardPeer: Codable {
    public let publicKey: String
    public let endpoint: String
    public let allowedIPs: String
    public let persistentKeepalive: Int?
    public let presharedKey: String?
    
    public init(publicKey: String, endpoint: String, allowedIPs: String, persistentKeepalive: Int? = nil, presharedKey: String? = nil) {
        self.publicKey = publicKey
        self.endpoint = endpoint
        self.allowedIPs = allowedIPs
        self.persistentKeepalive = persistentKeepalive
        self.presharedKey = presharedKey
    }
}

public enum VPNConnectionState: String, CaseIterable {
    case disconnected = "disconnected"
    case connecting = "connecting"
    case connected = "connected"
    case disconnecting = "disconnecting"
    case reconnecting = "reconnecting"
    case invalid = "invalid"
}
