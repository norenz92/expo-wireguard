import NetworkExtension
import os.log

class PacketTunnelProvider: NEPacketTunnelProvider {

  private var tunnelHandle: Int32 = -1
  private let tunnelQueue = DispatchQueue(label: "WireGuardTunnelQueue")

  override func startTunnel(
    options: [String: NSObject]?, completionHandler: @escaping (Error?) -> Void
  ) {
    // Get the WireGuard configuration from the provider configuration
    guard let tunnelProviderProtocol = protocolConfiguration as? NETunnelProviderProtocol,
      let providerConfig = tunnelProviderProtocol.providerConfiguration,
      let wgQuickConfig = providerConfig["wgQuickConfig"] as? String
    else {
      os_log("Invalid tunnel configuration", log: OSLog.default, type: .error)
      completionHandler(NEVPNError(.configurationInvalid))
      return
    }

    // Configure the tunnel settings
    let tunnelNetworkSettings = createTunnelNetworkSettings(from: wgQuickConfig)

    // Apply the network settings to the tunnel
    setTunnelNetworkSettings(tunnelNetworkSettings) { [weak self] error in
      guard let self = self else { return }

      if let error = error {
        os_log(
          "Failed to set tunnel network settings: %{public}@", log: OSLog.default, type: .error,
          error.localizedDescription)
        completionHandler(error)
        return
      }

      // Get the file descriptor for the tunnel
      guard let tunnelFd = self.packetFlow.value(forKeyPath: "socket.fileDescriptor") as? Int32
      else {
        os_log("Failed to get tunnel file descriptor", log: OSLog.default, type: .error)
        completionHandler(NEVPNError(.configurationInvalid))
        return
      }

      self.tunnelQueue.async {
        // Turn on WireGuard tunnel using the WireGuard library
        self.tunnelHandle = wgTurnOn(wgQuickConfig, tunnelFd)

        if self.tunnelHandle < 0 {
          os_log(
            "Failed to start WireGuard tunnel: %d", log: OSLog.default, type: .error,
            self.tunnelHandle)
          DispatchQueue.main.async {
            completionHandler(NEVPNError(.configurationInvalid))
          }
          return
        }

        os_log("WireGuard tunnel started successfully", log: OSLog.default, type: .info)
        DispatchQueue.main.async {
          completionHandler(nil)
        }

        // Start reading packets
        self.readPackets()
      }
    }
  }

  // Read packets from the tunnel
  private func readPackets() {
    packetFlow.readPackets { [weak self] packets, protocols in
      guard let self = self, self.tunnelHandle >= 0 else { return }

      // Process the packets using WireGuard
      for (i, packet) in packets.enumerated() {
        let protocolNumber = protocols[i]
        self.tunnelQueue.async {
          wgWritePacket(self.tunnelHandle, packet, packet.count)
        }
      }

      // Continue reading packets
      self.readPackets()
    }
  }

  override func stopTunnel(
    with reason: NEProviderStopReason, completionHandler: @escaping () -> Void
  ) {
    // Shut down the WireGuard tunnel
    if tunnelHandle >= 0 {
      tunnelQueue.async {
        wgTurnOff(self.tunnelHandle)
        self.tunnelHandle = -1
        DispatchQueue.main.async {
          completionHandler()
        }
      }
    } else {
      completionHandler()
    }
  }

  // Parse the WireGuard configuration and create tunnel network settings
  private func createTunnelNetworkSettings(from wgQuickConfig: String)
    -> NEPacketTunnelNetworkSettings
  {
    // Parse the WireGuard config to extract IP addresses and DNS servers
    var ipv4Addresses: [String] = []
    var ipv4SubnetMasks: [String] = []
    var ipv6Addresses: [String] = []
    var ipv6NetworkPrefixLengths: [NSNumber] = []
    var dnsServers: [String] = []

    let lines = wgQuickConfig.components(separatedBy: .newlines)
    var inInterfaceSection = false

    // Simple parser for the wg-quick config format
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
              }
            } else {
              // IPv4 address
              if let (ip, mask) = parseIPv4Address(address) {
                ipv4Addresses.append(ip)
                ipv4SubnetMasks.append(mask)
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
        }
      }
    }

    // Create network settings
    let networkSettings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "127.0.0.1")

    // Configure IPv4 settings if we have IPv4 addresses
    if !ipv4Addresses.isEmpty {
      let ipv4Settings = NEIPv4Settings(addresses: ipv4Addresses, subnetMasks: ipv4SubnetMasks)
      ipv4Settings.includedRoutes = [NEIPv4Route.default()]
      networkSettings.ipv4Settings = ipv4Settings
    }

    // Configure IPv6 settings if we have IPv6 addresses
    if !ipv6Addresses.isEmpty {
      let ipv6Settings = NEIPv6Settings(
        addresses: ipv6Addresses, networkPrefixLengths: ipv6NetworkPrefixLengths)
      ipv6Settings.includedRoutes = [NEIPv6Route.default()]
      networkSettings.ipv6Settings = ipv6Settings
    }

    // Configure DNS settings if we have DNS servers
    if !dnsServers.isEmpty {
      let dnsSettings = NEDNSSettings(servers: dnsServers)
      dnsSettings.matchDomains = [""]  // Match all domains
      networkSettings.dnsSettings = dnsSettings
    }

    return networkSettings
  }

  // Parse IPv4 address with CIDR notation (e.g., "192.168.1.1/24")
  private func parseIPv4Address(_ cidrAddress: String) -> (String, String)? {
    let parts = cidrAddress.components(separatedBy: "/")
    guard parts.count == 2, let prefixLength = Int(parts[1]), prefixLength >= 0, prefixLength <= 32
    else {
      return nil
    }

    let ipAddress = parts[0]
    let subnetMask = subnetMaskFromPrefixLength(prefixLength)

    return (ipAddress, subnetMask)
  }

  // Convert prefix length to subnet mask (e.g., 24 -> "255.255.255.0")
  private func subnetMaskFromPrefixLength(_ prefixLength: Int) -> String {
    var mask = UInt32.max << (32 - prefixLength)
    mask = mask.byteSwapped  // Convert to network byte order

    let byte1 = (mask >> 24) & 0xFF
    let byte2 = (mask >> 16) & 0xFF
    let byte3 = (mask >> 8) & 0xFF
    let byte4 = mask & 0xFF

    return "\(byte1).\(byte2).\(byte3).\(byte4)"
  }

  // Parse IPv6 address with CIDR notation (e.g., "2001:db8::1/64")
  private func parseIPv6Address(_ cidrAddress: String) -> (String, Int)? {
    let parts = cidrAddress.components(separatedBy: "/")
    guard parts.count == 2, let prefixLength = Int(parts[1]), prefixLength >= 0, prefixLength <= 128
    else {
      return nil
    }

    return (parts[0], prefixLength)
  }
}
