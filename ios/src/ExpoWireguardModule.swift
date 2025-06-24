import ExpoModulesCore
import NetworkExtension

public class ExpoWireguardModule: Module, WireGuardVPNManagerDelegate {
  private let vpnManager = WireGuardVPNManager.shared
  private let keychain = WireGuardKeychain(accessGroup: "group.expo.modules.wireguard.example")
  
  public func definition() -> ModuleDefinition {
    Name("ExpoWireguard")

    // Legacy constants for backward compatibility
    Constants([
      "PI": Double.pi
    ])

    // Events for VPN state changes
    Events("onConnectionStateChange", "onError", "onChange")
    
    OnCreate {
      vpnManager.delegate = self
    }

    // Legacy functions for backward compatibility
    Function("hello") {
      return "Hello world! 👋"
    }

    AsyncFunction("setValueAsync") { (value: String) in
      self.sendEvent("onChange", [
        "value": value
      ])
    }
    
    // MARK: - WireGuard VPN Functions
    
    AsyncFunction("addConfiguration") { (configDict: [String: Any]) -> Void in
      do {
        let config = try self.parseConfiguration(from: configDict)
        try await self.vpnManager.addConfiguration(config)
      } catch {
        throw Exception(name: "CONFIGURATION_ERROR", description: error.localizedDescription)
      }
    }
    
    AsyncFunction("removeConfiguration") { (name: String) -> Void in
      do {
        try await self.vpnManager.removeConfiguration(name)
      } catch {
        throw Exception(name: "REMOVE_ERROR", description: error.localizedDescription)
      }
    }
    
    AsyncFunction("listConfigurations") { () -> [String] in
      do {
        return try self.vpnManager.listConfigurations()
      } catch {
        throw Exception(name: "LIST_ERROR", description: error.localizedDescription)
      }
    }
    
    AsyncFunction("connect") { (configurationName: String) -> Void in
      do {
        try await self.vpnManager.connect(configurationName: configurationName)
      } catch {
        throw Exception(name: "CONNECTION_ERROR", description: error.localizedDescription)
      }
    }
    
    AsyncFunction("requestVPNPermission") { () -> Void in
      do {
        try await self.vpnManager.requestVPNPermission()
      } catch {
        throw Exception(name: "PERMISSION_ERROR", description: error.localizedDescription)
      }
    }
    
    AsyncFunction("disconnect") { () -> Void in
      do {
        try await self.vpnManager.disconnect()
      } catch {
        throw Exception(name: "DISCONNECTION_ERROR", description: error.localizedDescription)
      }
    }
    
    Function("getConnectionState") { () -> String in
      return self.vpnManager.getConnectionState().rawValue
    }
    
    Function("getCurrentConfiguration") { () -> String? in
      return self.vpnManager.getCurrentConfigurationName()
    }
    
    AsyncFunction("generateKeyPair") { () -> [String: String] in
      do {
        let keyPair = try self.keychain.generateKeyPair()
        return [
          "privateKey": keyPair.privateKey,
          "publicKey": keyPair.publicKey
        ]
      } catch {
        throw Exception(name: "KEY_GENERATION_ERROR", description: error.localizedDescription)
      }
    }
    
    AsyncFunction("validateConfiguration") { (configDict: [String: Any]) -> Bool in
      do {
        _ = try self.parseConfiguration(from: configDict)
        return true
      } catch {
        return false
      }
    }
  }
  
  // MARK: - Helper Methods
  
  private func parseConfiguration(from dict: [String: Any]) throws -> WireGuardConfiguration {
    guard let name = dict["name"] as? String,
          let privateKey = dict["privateKey"] as? String,
          let address = dict["address"] as? String,
          let peersArray = dict["peers"] as? [[String: Any]] else {
      throw WireGuardError.configurationInvalid("Missing required fields")
    }
    
    let dns = dict["dns"] as? String
    let mtu = dict["mtu"] as? Int
    
    var peers: [WireGuardPeer] = []
    for peerDict in peersArray {
      guard let publicKey = peerDict["publicKey"] as? String,
            let endpoint = peerDict["endpoint"] as? String,
            let allowedIPs = peerDict["allowedIPs"] as? String else {
        throw WireGuardError.configurationInvalid("Invalid peer configuration")
      }
      
      let persistentKeepalive = peerDict["persistentKeepalive"] as? Int
      let presharedKey = peerDict["presharedKey"] as? String
      
      let peer = WireGuardPeer(
        publicKey: publicKey,
        endpoint: endpoint,
        allowedIPs: allowedIPs,
        persistentKeepalive: persistentKeepalive,
        presharedKey: presharedKey
      )
      peers.append(peer)
    }
    
    return WireGuardConfiguration(
      name: name,
      privateKey: privateKey,
      address: address,
      dns: dns,
      mtu: mtu,
      peers: peers
    )
  }
  
  // MARK: - WireGuardVPNManagerDelegate
  
  public func vpnManager(_ manager: WireGuardVPNManager, didChangeState state: VPNConnectionState) {
    sendEvent("onConnectionStateChange", [
      "state": state.rawValue,
      "configuration": manager.getCurrentConfigurationName() as Any,
      "timestamp": Date().timeIntervalSince1970 * 1000
    ])
  }
  
  public func vpnManager(_ manager: WireGuardVPNManager, didFailWithError error: WireGuardError) {
    sendEvent("onError", [
      "error": error.localizedDescription,
      "code": error.errorCode,
      "configuration": manager.getCurrentConfigurationName() as Any
    ])
  }
  
  public func vpnManager(_ manager: WireGuardVPNManager, didAddConfiguration name: String) {
    // Optional: Send event when configuration is added
  }
  
  public func vpnManager(_ manager: WireGuardVPNManager, didRemoveConfiguration name: String) {
    // Optional: Send event when configuration is removed
  }
}
