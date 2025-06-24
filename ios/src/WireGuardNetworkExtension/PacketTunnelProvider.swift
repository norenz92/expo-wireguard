import NetworkExtension
import wg_go

class PacketTunnelProvider: NEPacketTunnelProvider {
    private var tunnelHandle: Int32 = -1
    private var tunnelFileDescriptor: Int32 = -1
    
    override func startTunnel(options: [String : NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        // Extract configuration from options
        guard let wgConfig = options?["wg-quick"] as? String else {
            completionHandler(NSError(domain: "WireGuardError", code: -1, userInfo: [NSLocalizedDescriptionKey: "Missing WireGuard configuration"]))
            return
        }
        
        // Configure tunnel settings
        let tunnelNetworkSettings = createTunnelSettings(from: wgConfig)
        
        setTunnelNetworkSettings(tunnelNetworkSettings) { [weak self] error in
            if let error = error {
                completionHandler(error)
                return
            }
            
            // Start WireGuard tunnel
            self?.startWireGuardTunnel(config: wgConfig, completionHandler: completionHandler)
        }
    }
    
    override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        // Stop WireGuard tunnel
        if tunnelHandle >= 0 {
            wgTurnOff(tunnelHandle)
            tunnelHandle = -1
        }
        
        if tunnelFileDescriptor >= 0 {
            close(tunnelFileDescriptor)
            tunnelFileDescriptor = -1
        }
        
        completionHandler()
    }
    
    public override func handleAppMessage(_ messageData: Data, completionHandler: ((Data?) -> Void)?) {
        // Handle messages from the main app if needed
        completionHandler?(nil)
    }
    
    public override func sleep(completionHandler: @escaping () -> Void) {
        // Handle sleep event
        completionHandler()
    }
    
    public override func wake() {
        // Handle wake event
    }
    
    // MARK: - Private Methods
    
    private func createTunnelSettings(from config: String) -> NEPacketTunnelNetworkSettings {
        // Parse the WireGuard configuration to extract network settings
        let lines = config.components(separatedBy: .newlines)
        var address: String?
        var dns: [String] = []
        var mtu: Int = 1420 // Default MTU for WireGuard
        
        for line in lines {
            let trimmedLine = line.trimmingCharacters(in: .whitespaces)
            if trimmedLine.starts(with: "Address = ") {
                address = String(trimmedLine.dropFirst("Address = ".count))
            } else if trimmedLine.starts(with: "DNS = ") {
                let dnsString = String(trimmedLine.dropFirst("DNS = ".count))
                dns = dnsString.components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespaces) }
            } else if trimmedLine.starts(with: "MTU = ") {
                if let mtuValue = Int(String(trimmedLine.dropFirst("MTU = ".count))) {
                    mtu = mtuValue
                }
            }
        }
        
        // Create tunnel settings
        let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "127.0.0.1")
        settings.mtu = NSNumber(value: mtu)
        
        // Configure IPv4 settings
        if let address = address {
            let ipv4Settings = NEIPv4Settings(addresses: [address.components(separatedBy: "/")[0]], subnetMasks: ["255.255.255.0"])
            ipv4Settings.includedRoutes = [NEIPv4Route.default()]
            settings.ipv4Settings = ipv4Settings
        }
        
        // Configure DNS settings
        if !dns.isEmpty {
            let dnsSettings = NEDNSSettings(servers: dns)
            settings.dnsSettings = dnsSettings
        }
        
        return settings
    }
    
    private func startWireGuardTunnel(config: String, completionHandler: @escaping (Error?) -> Void) {
        // Get the tunnel file descriptor from the packet flow
        tunnelFileDescriptor = packetFlow.value(forKeyPath: "socket.fileDescriptor") as? Int32 ?? -1
        
        guard tunnelFileDescriptor >= 0 else {
            completionHandler(NSError(domain: "WireGuardError", code: -2, userInfo: [NSLocalizedDescriptionKey: "Failed to get tunnel file descriptor"]))
            return
        }
        
        // Start WireGuard with the configuration
        // Convert Swift String to C string (const char *)
        config.withCString { configCString in
            let result = wgTurnOn(configCString, tunnelFileDescriptor)
            
            if result < 0 {
                completionHandler(NSError(domain: "WireGuardError", code: Int(result), userInfo: [NSLocalizedDescriptionKey: "Failed to start WireGuard tunnel"]))
                return
            }
            
            // Store the tunnel handle (not a pointer, just an int)
            tunnelHandle = Int32(result)
            completionHandler(nil)
        }
    }
}
