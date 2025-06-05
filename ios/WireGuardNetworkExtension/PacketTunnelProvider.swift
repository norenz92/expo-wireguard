import NetworkExtension
import os.log
import wg_go
import Darwin
import Foundation
import SystemConfiguration

enum PacketTunnelProviderError: Error {
    case savedProtocolConfigurationIsInvalid
    case couldNotDetermineFileDescriptor
    case couldNotSetNetworkSettings
    case couldNotStartBackend
    case dnsResolutionFailure
    
    var localizedDescription: String {
        switch self {
        case .savedProtocolConfigurationIsInvalid:
            return "Invalid protocol configuration"
        case .couldNotDetermineFileDescriptor:
            return "Could not determine file descriptor"
        case .couldNotSetNetworkSettings:
            return "Could not set network settings"
        case .couldNotStartBackend:
            return "Could not start WireGuard backend"
        case .dnsResolutionFailure:
            return "DNS resolution failure"
        }
    }
}

class PacketTunnelProvider: NEPacketTunnelProvider {
    private var tunnelHandle: Int32 = -1
    private let tunnelQueue = DispatchQueue(label: "WireGuardTunnelQueue")
    
    override func startTunnel(options: [String : NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        wg_log(.info, message: "🚀 Starting WireGuard tunnel")
        
        // Test the wgVersion function first
        testWgVersion()
        
        do {
            let tunnelProtocol = try parseConfiguration(from: protocolConfiguration)
            try startWireGuardTunnel(with: tunnelProtocol, completionHandler: completionHandler)
        } catch {
            wg_log(.error, message: "❌ Failed to start tunnel: \(error.localizedDescription)")
            completionHandler(error)
        }
    }
    
    // MARK: - Configuration Parsing
    
    private func parseConfiguration(from protocolConfig: NEVPNProtocol?) throws -> String {
        wg_log(.info, message: "🔧 Parsing tunnel configuration")
        
        guard let tunnelProviderProtocol = protocolConfig as? NETunnelProviderProtocol else {
            throw PacketTunnelProviderError.savedProtocolConfigurationIsInvalid
        }
        
        guard let configData = tunnelProviderProtocol.providerConfiguration?["config"] as? Data else {
            wg_log(.info, message: "📋 Available keys: \(tunnelProviderProtocol.providerConfiguration?.keys.joined(separator: ", ") ?? "none")")
            throw PacketTunnelProviderError.savedProtocolConfigurationIsInvalid
        }
        
        guard let configString = String(data: configData, encoding: .utf8) else {
            throw PacketTunnelProviderError.savedProtocolConfigurationIsInvalid
        }
        
        wg_log(.info, message: "✅ WireGuard configuration loaded successfully")
        wg_log(.info, message: "📄 Config preview: \(String(configString.prefix(100)))")
        
        return configString
    }
    
    // MARK: - Tunnel Management
    
    private func startWireGuardTunnel(with config: String, completionHandler: @escaping (Error?) -> Void) throws {
        wg_log(.info, message: "🔄 Starting WireGuard tunnel with configuration")
        
        // Validate the configuration first
        guard validateConfiguration(config) else {
            wg_log(.error, message: "❌ Configuration validation failed")
            completionHandler(PacketTunnelProviderError.savedProtocolConfigurationIsInvalid)
            return
        }
        
        // Parse the WireGuard configuration and create tunnel network settings
        let tunnelNetworkSettings = createTunnelNetworkSettings(from: config)
        
        // Apply the network settings to the tunnel interface
        setTunnelNetworkSettings(tunnelNetworkSettings) { [weak self] error in
            guard let self = self else { return }
            
            if let error = error {
                self.wg_log(.error, message: "❌ Failed to set tunnel network settings: \(error.localizedDescription)")
                completionHandler(PacketTunnelProviderError.couldNotSetNetworkSettings)
                return
            }
            
            self.wg_log(.info, message: "✅ Tunnel network settings applied successfully")
            
            // Wait a moment for the interface to be ready
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                self.startWireGuardEngine(with: config, completionHandler: completionHandler)
            }
        }
    }
    
    private func startWireGuardEngine(with config: String, completionHandler: @escaping (Error?) -> Void) {
        self.wg_log(.info, message: "🔄 Starting WireGuard engine with proper file descriptor approach")
        
        // Set up WireGuard logger first
        setupWireGuardLogger()
        
        // Start packet forwarding to handle data flow
        self.startPacketForwarding()
        
        // Log configuration details for debugging
        self.wg_log(.info, message: "📄 WireGuard config to be used:")
        let configLines = config.components(separatedBy: .newlines)
        for (index, line) in configLines.enumerated() {
            if line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { continue }
            if line.lowercased().contains("privatekey") {
                self.wg_log(.info, message: "  Line \(index): PrivateKey = [REDACTED]")
            } else {
                self.wg_log(.info, message: "  Line \(index): \(line)")
            }
        }
        
        // Try to get the file descriptor from NEPacketTunnelProvider's packet flow
        self.tunnelQueue.async {
            self.wg_log(.info, message: "🚀 Starting WireGuard engine...")
            
            // Try to extract file descriptor using reflection
            let tunFileDescriptor = self.extractFileDescriptor()
            self.wg_log(.info, message: "🔧 Extracted file descriptor: \(tunFileDescriptor)")
            
            if tunFileDescriptor > 0 {
                // Validate the file descriptor
                let flags = fcntl(tunFileDescriptor, F_GETFL)
                if flags == -1 {
                    self.wg_log(.error, message: "❌ File descriptor \(tunFileDescriptor) is invalid")
                    DispatchQueue.main.async {
                        completionHandler(PacketTunnelProviderError.couldNotDetermineFileDescriptor)
                    }
                    return
                } else {
                    self.wg_log(.info, message: "✅ File descriptor \(tunFileDescriptor) is valid (flags: \(flags))")
                }
                
                // Try to start WireGuard with the valid file descriptor
                self.wg_log(.info, message: "🚨 Calling wgTurnOn with fd=\(tunFileDescriptor)")
                let result = wgTurnOn(config, tunFileDescriptor)
                self.tunnelHandle = result
                self.wg_log(.info, message: "🚨 wgTurnOn returned: \(result)")
            } else {
                // Fallback: try without file descriptor (let wg-go handle it)
                self.wg_log(.info, message: "⚠️ No valid file descriptor found, trying wgTurnOn with fd=-1")
                let result = wgTurnOn(config, -1)
                self.tunnelHandle = result
                self.wg_log(.info, message: "🚨 wgTurnOn returned: \(result)")
            }
            
            DispatchQueue.main.async {
                if self.tunnelHandle < 0 {
                    self.wg_log(.error, message: "❌ WireGuard failed to start: \(self.tunnelHandle)")
                    
                    // Provide detailed error information
                    let errorDescription = self.getWireGuardErrorDescription(self.tunnelHandle)
                    self.wg_log(.error, message: "❌ Error details: \(errorDescription)")
                    
                    // Log the config format for debugging
                    self.wg_log(.error, message: "❌ Config format check:")
                    self.wg_log(.error, message: "  - Has [Interface]: \(config.contains("[Interface]"))")
                    self.wg_log(.error, message: "  - Has [Peer]: \(config.contains("[Peer]"))")
                    self.wg_log(.error, message: "  - Has PrivateKey: \(config.contains("PrivateKey"))")
                    self.wg_log(.error, message: "  - Has PublicKey: \(config.contains("PublicKey"))")
                    self.wg_log(.error, message: "  - Has Endpoint: \(config.contains("Endpoint"))")
                    self.wg_log(.error, message: "  - Config length: \(config.count) characters")
                    
                    completionHandler(PacketTunnelProviderError.couldNotStartBackend)
                } else {
                    self.wg_log(.info, message: "🎉 WireGuard started successfully with handle: \(self.tunnelHandle)")
                    
                    completionHandler(nil)
                }
            }
        }
    }
    
    
    override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        wg_log(.info, message: "🛑 Stopping WireGuard tunnel (reason: \(reason.rawValue))")
        
        if tunnelHandle >= 0 {
            tunnelQueue.async {
                self.wg_log(.info, message: "🔄 Turning off WireGuard tunnel handle: \(self.tunnelHandle)")
                wgTurnOff(self.tunnelHandle)
                self.tunnelHandle = -1
                
                DispatchQueue.main.async {
                    self.wg_log(.info, message: "✅ WireGuard tunnel stopped successfully")
                    completionHandler()
                }
            }
        } else {
            wg_log(.info, message: "ℹ️ No active tunnel to stop")
            completionHandler()
        }
    }
    
    override func handleAppMessage(_ messageData: Data, completionHandler: ((Data?) -> Void)?) {
        // Handle app messages if needed
        wg_log(.info, message: "📨 Received app message: \(messageData.count) bytes")
        completionHandler?(nil)
    }
    
    override func sleep(completionHandler: @escaping () -> Void) {
        wg_log(.info, message: "😴 Putting tunnel to sleep")
        // Put the tunnel to sleep
        completionHandler()
    }
    
    override func wake() {
        wg_log(.info, message: "⏰ Waking up tunnel")
        // Wake up the tunnel
    }
    
    // MARK: - WireGuard Configuration Parsing
    
    private func createTunnelNetworkSettings(from wgConfig: String) -> NEPacketTunnelNetworkSettings {
        wg_log(.info, message: "🔧 Parsing WireGuard configuration for network settings")
        
        // Parse the WireGuard config to extract IP addresses and DNS servers
        var ipv4Addresses: [String] = []
        var ipv4SubnetMasks: [String] = []
        var ipv6Addresses: [String] = []
        var ipv6NetworkPrefixLengths: [NSNumber] = []
        var dnsServers: [String] = []
        
        let lines = wgConfig.components(separatedBy: .newlines)
        var inInterfaceSection = false
        
        // Parse the wg-quick config format
        for line in lines {
            let trimmedLine = line.trimmingCharacters(in: .whitespacesAndNewlines)
            
            if trimmedLine == "[Interface]" {
                inInterfaceSection = true
                continue
            } else if trimmedLine.starts(with: "[") {
                inInterfaceSection = false
                continue
            }
            
            if inInterfaceSection {
                // Parse Address lines in the Interface section
                if trimmedLine.starts(with: "Address = ") {
                    let addressesString = trimmedLine.replacingOccurrences(of: "Address = ", with: "")
                    let addresses = addressesString.components(separatedBy: ",").map {
                        $0.trimmingCharacters(in: .whitespaces)
                    }
                    
                    for address in addresses {
                        if address.contains(":") {
                            // IPv6 address
                            if let (ip, prefixLength) = parseIPv6Address(address) {
                                ipv6Addresses.append(ip)
                                ipv6NetworkPrefixLengths.append(NSNumber(value: prefixLength))
                                wg_log(.info, message: "📍 Found IPv6 address: \(ip)/\(prefixLength)")
                            }
                        } else {
                            // IPv4 address
                            if let (ip, mask) = parseIPv4Address(address) {
                                ipv4Addresses.append(ip)
                                ipv4SubnetMasks.append(mask)
                                wg_log(.info, message: "📍 Found IPv4 address: \(ip) with mask: \(mask)")
                            }
                        }
                    }
                }
                // Parse DNS lines in the Interface section
                else if trimmedLine.starts(with: "DNS = ") {
                    let dnsString = trimmedLine.replacingOccurrences(of: "DNS = ", with: "")
                    let servers = dnsString.components(separatedBy: ",").map {
                        $0.trimmingCharacters(in: .whitespaces)
                    }
                    dnsServers.append(contentsOf: servers)
                    wg_log(.info, message: "🌐 Found DNS servers: \(servers.joined(separator: ", "))")
                }
            }
        }
        
        // Create network settings using the first IPv4 address as the remote address
        let remoteAddress = ipv4Addresses.first ?? "127.0.0.1"
        let networkSettings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: remoteAddress)
        
        wg_log(.info, message: "🔧 Creating tunnel with remote address: \(remoteAddress)")
        
        // Configure IPv4 settings if we have IPv4 addresses
        if !ipv4Addresses.isEmpty {
            let ipv4Settings = NEIPv4Settings(addresses: ipv4Addresses, subnetMasks: ipv4SubnetMasks)
            // Route all traffic through the VPN
            ipv4Settings.includedRoutes = [NEIPv4Route.default()]
            networkSettings.ipv4Settings = ipv4Settings
            wg_log(.info, message: "✅ Configured IPv4 settings with \(ipv4Addresses.count) addresses")
        }
        
        // Configure IPv6 settings if we have IPv6 addresses
        if !ipv6Addresses.isEmpty {
            let ipv6Settings = NEIPv6Settings(addresses: ipv6Addresses, networkPrefixLengths: ipv6NetworkPrefixLengths)
            // Route all IPv6 traffic through the VPN
            ipv6Settings.includedRoutes = [NEIPv6Route.default()]
            networkSettings.ipv6Settings = ipv6Settings
            wg_log(.info, message: "✅ Configured IPv6 settings with \(ipv6Addresses.count) addresses")
        }
        
        // Configure DNS settings if we have DNS servers
        if !dnsServers.isEmpty {
            let dnsSettings = NEDNSSettings(servers: dnsServers)
            dnsSettings.matchDomains = [""] // Match all domains
            networkSettings.dnsSettings = dnsSettings
            wg_log(.info, message: "✅ Configured DNS with servers: \(dnsServers.joined(separator: ", "))")
        }
        
        return networkSettings
    }
    
    // Parse IPv4 address with CIDR notation (e.g., "192.168.1.1/24")
    private func parseIPv4Address(_ cidrAddress: String) -> (String, String)? {
        let parts = cidrAddress.components(separatedBy: "/")
        guard parts.count == 2,
              let prefixLength = Int(parts[1]),
              prefixLength >= 0 && prefixLength <= 32 else {
            wg_log(.error, message: "❌ Invalid IPv4 CIDR format: \(cidrAddress)")
            return nil
        }
        
        let ipAddress = parts[0]
        let subnetMask = cidrToSubnetMask(prefixLength)
        return (ipAddress, subnetMask)
    }
    
    // Parse IPv6 address with prefix notation (e.g., "2001:db8::1/64")
    private func parseIPv6Address(_ cidrAddress: String) -> (String, Int)? {
        let parts = cidrAddress.components(separatedBy: "/")
        guard parts.count == 2,
              let prefixLength = Int(parts[1]),
              prefixLength >= 0 && prefixLength <= 128 else {
            wg_log(.error, message: "❌ Invalid IPv6 CIDR format: \(cidrAddress)")
            return nil
        }
        
        let ipAddress = parts[0]
        
        // Validate that it's a valid IPv6 address format
        guard ipAddress.contains(":") else {
            wg_log(.error, message: "❌ Invalid IPv6 address format: \(ipAddress)")
            return nil
        }
        
        return (ipAddress, prefixLength)
    }
    
    // Convert CIDR prefix length to subnet mask
    private func cidrToSubnetMask(_ prefixLength: Int) -> String {
        let mask = UInt32.max << (32 - prefixLength)
        let a = UInt8((mask >> 24) & 0xFF)
        let b = UInt8((mask >> 16) & 0xFF)
        let c = UInt8((mask >> 8) & 0xFF)
        let d = UInt8(mask & 0xFF)
        return "\(a).\(b).\(c).\(d)"
    }
    
    // MARK: - Configuration Validation
    
    private func validateConfiguration(_ config: String) -> Bool {
        wg_log(.info, message: "🔍 Validating WireGuard configuration...")
        
        var hasInterface = false
        var hasPrivateKey = false
        var hasAddress = false
        var hasPeer = false
        var hasPublicKey = false
        var hasEndpoint = false
        
        let lines = config.components(separatedBy: .newlines)
        var inInterfaceSection = false
        var inPeerSection = false
        
        for line in lines {
            let trimmedLine = line.trimmingCharacters(in: .whitespacesAndNewlines)
            
            if trimmedLine == "[Interface]" {
                hasInterface = true
                inInterfaceSection = true
                inPeerSection = false
                continue
            } else if trimmedLine == "[Peer]" {
                hasPeer = true
                inInterfaceSection = false
                inPeerSection = true
                continue
            } else if trimmedLine.starts(with: "[") {
                inInterfaceSection = false
                inPeerSection = false
                continue
            }
            
            if inInterfaceSection {
                if trimmedLine.starts(with: "PrivateKey = ") {
                    hasPrivateKey = true
                    wg_log(.info, message: "✅ Found PrivateKey")
                } else if trimmedLine.starts(with: "Address = ") {
                    hasAddress = true
                    wg_log(.info, message: "✅ Found Address")
                }
            } else if inPeerSection {
                if trimmedLine.starts(with: "PublicKey = ") {
                    hasPublicKey = true
                    wg_log(.info, message: "✅ Found PublicKey")
                } else if trimmedLine.starts(with: "Endpoint = ") {
                    hasEndpoint = true
                    wg_log(.info, message: "✅ Found Endpoint")
                } else if trimmedLine.starts(with: "publickey = ") {
                    wg_log(.error, message: "❌ Found 'publickey' (lowercase) - should be 'PublicKey'")
                    return false
                }
            }
        }
        
        let isValid = hasInterface && hasPrivateKey && hasAddress && hasPeer && hasPublicKey && hasEndpoint
        
        if !isValid {
            wg_log(.error, message: "❌ Configuration validation failed:")
            wg_log(.error, message: "   - Interface section: \(hasInterface ? "✅" : "❌")")
            wg_log(.error, message: "   - PrivateKey: \(hasPrivateKey ? "✅" : "❌")")
            wg_log(.error, message: "   - Address: \(hasAddress ? "✅" : "❌")")
            wg_log(.error, message: "   - Peer section: \(hasPeer ? "✅" : "❌")")
            wg_log(.error, message: "   - PublicKey: \(hasPublicKey ? "✅" : "❌")")
            wg_log(.error, message: "   - Endpoint: \(hasEndpoint ? "✅" : "❌")")
        } else {
            wg_log(.info, message: "✅ Configuration validation passed")
        }
        
        return isValid
    }
    
    // MARK: - Error Handling
    
    private func getWireGuardErrorDescription(_ errorCode: Int32) -> String {
        switch errorCode {
        case -1:
            return "Generic error in wg-go (configuration or interface issue)"
        case -2:
            return "Invalid configuration format"
        case -3:
            return "Network interface error"
        case -4:
            return "Permission denied or capability error"
        case -5:
            return "Memory allocation error"
        case -997:
            return "wgTurnOn timed out (possible hang or crash)"
        case -998:
            return "wgTurnOn threw an exception"
        case -999:
            return "wgTurnOn never returned (initialization error)"
        default:
            return "Unknown error code: \(errorCode)"
        }
    }
    
    // MARK: - Utilities
    
    private func extractFileDescriptor() -> Int32 {
        wg_log(.info, message: "🔧 Attempting to extract file descriptor from packet flow")
        
        // Method 1: Try to use the packet flow's underlying socket file descriptor
        // This is a bit hacky but necessary for WireGuard-go integration
        let mirror = Mirror(reflecting: packetFlow)
        wg_log(.info, message: "🔍 PacketFlow mirror: \(mirror)")
        
        for child in mirror.children {
            if let label = child.label {
                wg_log(.info, message: "🔍 PacketFlow property: \(label) = \(child.value)")
                
                // Look for socket-related properties
                if label.lowercased().contains("socket") || label.lowercased().contains("fd") {
                    let socketMirror = Mirror(reflecting: child.value)
                    for socketChild in socketMirror.children {
                        if let socketLabel = socketChild.label {
                            wg_log(.info, message: "🔍 Socket property: \(socketLabel) = \(socketChild.value)")
                            
                            if socketLabel.lowercased().contains("descriptor") || socketLabel.lowercased().contains("fd") {
                                if let fd = socketChild.value as? Int32 {
                                    wg_log(.info, message: "✅ Found file descriptor via reflection: \(fd)")
                                    return fd
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Method 2: Try common file descriptor values used by the system
        for fd in 3..<20 {
            let flags = fcntl(Int32(fd), F_GETFL)
            if flags != -1 {
                // Check if this is a tun interface by trying to get interface name
                var ifname = [CChar](repeating: 0, count: Int(IFNAMSIZ))
                let result = if_indextoname(UInt32(fd), &ifname)
                if result != nil {
                    let interfaceName = String(cString: ifname)
                    if interfaceName.hasPrefix("utun") {
                        wg_log(.info, message: "✅ Found utun interface: \(interfaceName) with fd: \(fd)")
                        return Int32(fd)
                    }
                }
            }
        }
        
        wg_log(.info, message: "⚠️ Could not extract file descriptor, will try without one")
        return -1
    }
    
    private func setupWireGuardLogger() {
        wg_log(.info, message: "🔧 Setting up WireGuard logger")
        
        // Set up a custom logger for WireGuard-go
        let loggerContext = UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque())
        
        wgSetLogger(loggerContext) { context, level, message in
            guard let context = context,
                  let message = message else { return }
            
            let logMessage = String(cString: message)
            let logLevel: OSLogType
            
            switch level {
            case 0: // Debug
                logLevel = .debug
            case 1: // Info
                logLevel = .info
            case 2: // Warning
                logLevel = .error
            case 3: // Error
                logLevel = .fault
            default:
                logLevel = .default
            }
            
            os_log("🔧 WG-GO: %{public}s", 
                   log: OSLog(subsystem: "WireGuardNetworkExtension", category: "WG-GO"), 
                   type: logLevel, 
                   logMessage)
        }
    }
    
    private func createUtunInterface() -> Int32 {
        wg_log(.info, message: "🔧 Creating new utun interface...")
        
        // For now, we'll return -1 and rely on the packet flow file descriptor
        // The utun interface creation requires more complex low-level networking code
        // that's better handled by the NEPacketTunnelProvider framework
        wg_log(.info, message: "⚠️ Direct utun creation not implemented - relying on NEPacketTunnelProvider")
        return -1
    }
    
    // Test the wgVersion function from wg-go
    private func testWgVersion() {
        wg_log(.info, message: "🔍 Testing wgVersion() function...")
        
        if let versionPtr = wgVersion() {
            let version = String(cString: versionPtr)
            wg_log(.info, message: "✅ WireGuard-go version: \(version)")
        } else {
            wg_log(.error, message: "❌ Failed to get WireGuard-go version")
        }
    }
    
    // MARK: - Packet Forwarding
    
    private func startPacketForwarding() {
        wg_log(.info, message: "🔄 Starting packet forwarding...")
        
        // Start reading packets from the tunnel interface
        packetFlow.readPackets { [weak self] (packets: [Data], protocols: [NSNumber]) in
            guard let self = self else { return }
            
            // Forward packets to WireGuard for processing
            if !packets.isEmpty {
                self.wg_log(.info, message: "📦 Received \(packets.count) packets to forward")
                
                // Process each packet
                for (index, packet) in packets.enumerated() {
                    let protocolNumber = protocols[index].uint8Value
                    self.wg_log(.info, message: "📦 Packet \(index): \(packet.count) bytes, protocol: \(protocolNumber)")
                    
                    // In a real implementation, you would forward these packets to WireGuard
                    // For now, we'll just log them
                }
            }
            
            // Continue reading packets
            self.startPacketForwarding()
        }
    }
    
    private func wg_log(_ level: OSLogType, message: String) {
        os_log("%{public}s", log: OSLog(subsystem: "WireGuardNetworkExtension", category: "Tunnel"), type: level, message)
    }
}

// MARK: - Global Logging Function

func wg_log(_ level: OSLogType, message: String) {
    os_log("%{public}s", log: OSLog(subsystem: "WireGuardNetworkExtension", category: "Global"), type: level, message)
}


