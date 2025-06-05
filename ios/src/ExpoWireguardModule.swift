import ExpoModulesCore
import NetworkExtension

public class ExpoWireguardModule: Module {
  // Events constants
  private let EVENT_TYPE_SYSTEM = "EV_TYPE_SYSTEM"
  private let EVENT_TYPE_EXCEPTION = "EV_TYPE_EXCEPTION"
  private let EVENT_TYPE_REGULAR = "EV_TYPE_REGULAR"
  private let EVENT_STARTED = "EV_STARTED"
  private let EVENT_STOPPED = "EV_STOPPED"
  private let EVENT_STARTED_BY_SYSTEM = "EV_STARTED_BY_SYSTEM"

  // Private properties
  private var tunnelProvider: NETunnelProviderManager?
  private var sessionName: String?
  private var isConnected: Bool = false
  private var sessionObserver: NSObjectProtocol?

  // Define the module
  public func definition() -> ModuleDefinition {
    // Expose constants to JavaScript
    Name("ExpoWireguard")

    Constants([
      "EV_TYPE_SYSTEM": self.EVENT_TYPE_SYSTEM,
      "EV_TYPE_EXCEPTION": self.EVENT_TYPE_EXCEPTION,
      "EV_TYPE_REGULAR": self.EVENT_TYPE_REGULAR,
      "EV_STARTED": self.EVENT_STARTED,
      "EV_STOPPED": self.EVENT_STOPPED,
      "EV_STARTED_BY_SYSTEM": self.EVENT_STARTED_BY_SYSTEM,
    ])

    // Events emitter
    Events(self.EVENT_TYPE_SYSTEM, self.EVENT_TYPE_EXCEPTION, self.EVENT_TYPE_REGULAR)

    // Return the wireguard-go version
    AsyncFunction("Version") { () -> String in
      return self.getWgVersion()
    }

    // Connect to WireGuard VPN
    AsyncFunction("Connect") { (config: String, session: String, notif: [String: Any]?) in
      self.sessionName = session
      print("🔄 Starting VPN connection process...")
      print("📝 Session name: \(session)")
      print("📄 Config length: \(config.count) characters")

      // First, check if we already have a VPN configuration
      NETunnelProviderManager.loadAllFromPreferences { [weak self] (managers, error) in
        guard let self = self else { return }
        
        if let error = error {
          print("❌ Error loading existing VPN configurations: \(error.localizedDescription)")
          self.sendEvent(
            self.EVENT_TYPE_EXCEPTION,
            ["message": "Error loading VPN configurations: \(error.localizedDescription)"])
          return
        }
        
        let bundleIdentifier = "\(Bundle.main.bundleIdentifier!).WireGuardNetworkExtension"
        print("🔍 Looking for existing VPN config with bundle ID: \(bundleIdentifier)")
        
        // Look for existing VPN configuration for our app
        var existingManager: NETunnelProviderManager?
        if let managers = managers {
          print("📱 Found \(managers.count) existing VPN configurations")
          for manager in managers {
            if let tunnelProtocol = manager.protocolConfiguration as? NETunnelProviderProtocol,
               tunnelProtocol.providerBundleIdentifier == bundleIdentifier {
              print("✅ Found existing VPN configuration: \(manager.localizedDescription ?? "Unknown")")
              existingManager = manager
              break
            }
          }
        }
        
        if let manager = existingManager {
          // Update existing configuration with new config
          print("🔄 Updating existing VPN configuration...")
          self.updateAndConnectVPN(manager: manager, config: config, session: session)
        } else {
          // Create new configuration
          print("🆕 Creating new VPN configuration...")
          self.createAndConnectVPN(config: config, session: session)
        }
      }
    }

    // Check connection status
    AsyncFunction("Status") { () -> Bool in
      print("🔍 Checking VPN connection status...")
      
      // Load all VPN configurations to find the current status
      let semaphore = DispatchSemaphore(value: 0)
      var actualStatus = false
      
      NETunnelProviderManager.loadAllFromPreferences { (managers, error) in
        defer { semaphore.signal() }
        
        if let error = error {
          print("❌ Error loading VPN configurations: \(error.localizedDescription)")
          return
        }
        
        print("📱 Found \(managers?.count ?? 0) VPN configurations")
        
        if let managers = managers {
          for manager in managers {
            let connectionStatus = manager.connection.status
            print("📱 VPN Config: \(manager.localizedDescription ?? "Unknown") - Status: \(connectionStatus)")
            
            // Check if any VPN is connected
            if connectionStatus == .connected {
              actualStatus = true
              self.tunnelProvider = manager
              print("✅ Found connected VPN: \(manager.localizedDescription ?? "Unknown")")
              break
            }
          }
        }
        
        if !actualStatus {
          print("❌ No connected VPN configurations found")
        }
      }
      
      // Wait for the async operation to complete
      semaphore.wait()
      
      // Update our local tracking variable
      self.isConnected = actualStatus
      
      print("📱 Final VPN status: \(actualStatus ? "✅ Connected" : "❌ Disconnected")")
      return actualStatus
    }

    // Disconnect from WireGuard VPN
    AsyncFunction("Disconnect") { () in
      print("🔌 Disconnecting from VPN...")
      
      // First try to use our stored tunnel provider
      if let tunnelProvider = self.tunnelProvider {
        print("📱 Using stored tunnel provider")
        tunnelProvider.connection.stopVPNTunnel()
        return
      }
      
      // If no stored provider, find any connected VPN and disconnect it
      print("🔍 Looking for active VPN connections to disconnect...")
      NETunnelProviderManager.loadAllFromPreferences { (managers, error) in
        if let error = error {
          print("❌ Error loading VPN configurations: \(error.localizedDescription)")
          return
        }
        
        let bundleIdentifier = "\(Bundle.main.bundleIdentifier!).WireGuardNetworkExtension"
        
        if let managers = managers {
          for manager in managers {
            if let tunnelProtocol = manager.protocolConfiguration as? NETunnelProviderProtocol,
               tunnelProtocol.providerBundleIdentifier == bundleIdentifier {
              
              let status = manager.connection.status
              print("📱 VPN Config: \(manager.localizedDescription ?? "Unknown") - Status: \(status)")
              
              if status == .connected || status == .connecting {
                print("🔌 Disconnecting VPN: \(manager.localizedDescription ?? "Unknown")")
                manager.connection.stopVPNTunnel()
                self.tunnelProvider = manager
              }
            }
          }
        }
      }
    }
  }

  // Set up observer for tunnel status changes
  private func setupTunnelObserver() {
    print("🔔 Setting up VPN status observer...")
    self.sessionObserver = NotificationCenter.default.addObserver(
      forName: NSNotification.Name.NEVPNStatusDidChange,
      object: nil,
      queue: nil
    ) { [weak self] notification in
      guard let self = self else { return }
      
      print("🔔 VPN status change notification received")
      print("📱 Notification object: \(String(describing: notification.object))")
      
      if let connection = notification.object as? NETunnelProviderSession {
        print("📱 TunnelProviderSession status: \(connection.status)")
        
        switch connection.status {
        case .disconnected:
          print("📱 ❌ VPN Disconnected")
          self.isConnected = false
          self.sendEvent(self.EVENT_TYPE_REGULAR, ["event": self.EVENT_STOPPED])
        case .invalid:
          print("📱 ❌ VPN Invalid")
          self.isConnected = false
          self.sendEvent(self.EVENT_TYPE_REGULAR, ["event": self.EVENT_STOPPED])
        case .connected:
          print("📱 ✅ VPN Connected")
          self.isConnected = true
          self.sendEvent(self.EVENT_TYPE_REGULAR, ["event": self.EVENT_STARTED])
        case .connecting:
          print("📱 🔄 VPN Connecting...")
        case .disconnecting:
          print("📱 🔄 VPN Disconnecting...")
        case .reasserting:
          print("📱 🔄 VPN Reasserting...")
        @unknown default:
          print("📱 ❓ Unknown VPN status: \(connection.status)")
        }
      } else if let connection = notification.object as? NEVPNConnection {
        print("📱 NEVPNConnection status: \(connection.status)")
        
        switch connection.status {
        case .disconnected:
          print("📱 ❌ VPN Disconnected")
          self.isConnected = false
          self.sendEvent(self.EVENT_TYPE_REGULAR, ["event": self.EVENT_STOPPED])
        case .invalid:
          print("📱 ❌ VPN Invalid") 
          self.isConnected = false
          self.sendEvent(self.EVENT_TYPE_REGULAR, ["event": self.EVENT_STOPPED])
        case .connected:
          print("📱 ✅ VPN Connected")
          self.isConnected = true
          self.sendEvent(self.EVENT_TYPE_REGULAR, ["event": self.EVENT_STARTED])
        case .connecting:
          print("📱 🔄 VPN Connecting...")
        case .disconnecting:
          print("📱 🔄 VPN Disconnecting...")
        case .reasserting:
          print("📱 🔄 VPN Reasserting...")
        @unknown default:
          print("📱 ❓ Unknown VPN status: \(connection.status)")
        }
      } else {
        print("📱 ❓ Unknown notification object type: \(type(of: notification.object))")
      }
    }
  }

  // Get the WireGuard version
  private func getWgVersion() -> String {
    // Return a static version for the JS interface
    // The actual wgVersion() from wg-go is tested in the NetworkExtension
    return "1.0.20220627"
  }

  // Clean up when module is destroyed
  public func cleanup() {
    if let observer = sessionObserver {
      NotificationCenter.default.removeObserver(observer)
      sessionObserver = nil
    }
  }

  // Update existing VPN configuration and connect
  private func updateAndConnectVPN(manager: NETunnelProviderManager, config: String, session: String) {
    print("🔄 Updating existing VPN configuration...")
    
    // Update the session name
    manager.localizedDescription = session
    
    // Update the configuration data
    guard let configData = config.data(using: .utf8) else {
      print("❌ Failed to encode config data")
      self.sendEvent(
        self.EVENT_TYPE_EXCEPTION,
        ["message": "Failed to encode WireGuard configuration"])
      return
    }
    
    print("✅ Config data encoded: \(configData.count) bytes")
    
    if let tunnelProtocol = manager.protocolConfiguration as? NETunnelProviderProtocol {
      tunnelProtocol.providerConfiguration = [
        "config": configData
      ]
    }
    
    // Save the updated configuration
    manager.saveToPreferences { [weak self] error in
      guard let self = self else { return }
      
      if let error = error {
        print("❌ Error updating VPN configuration: \(error.localizedDescription)")
        self.sendEvent(
          self.EVENT_TYPE_EXCEPTION,
          ["message": "Error updating VPN configuration: \(error.localizedDescription)"])
        return
      }
      
      print("✅ VPN configuration updated successfully")
      self.connectToVPN(manager: manager)
    }
  }
  
  // Create new VPN configuration and connect
  private func createAndConnectVPN(config: String, session: String) {
    print("🆕 Creating new VPN configuration...")
    
    let providerManager = NETunnelProviderManager()
    let tunnelProtocol = NETunnelProviderProtocol()

    tunnelProtocol.providerBundleIdentifier =
      "\(Bundle.main.bundleIdentifier!).WireGuardNetworkExtension"
    tunnelProtocol.serverAddress = "WireGuard"

    // Store the WireGuard config in the protocol configuration
    guard let configData = config.data(using: .utf8) else {
      print("❌ Failed to encode config data")
      self.sendEvent(
        self.EVENT_TYPE_EXCEPTION,
        ["message": "Failed to encode WireGuard configuration"])
      return
    }
    
    print("✅ Config data encoded: \(configData.count) bytes")
    
    tunnelProtocol.providerConfiguration = [
      "config": configData
    ]

    providerManager.protocolConfiguration = tunnelProtocol
    providerManager.localizedDescription = session

    // Save the new configuration
    print("💾 Saving new VPN configuration to system preferences...")
    providerManager.saveToPreferences { [weak self] error in
      guard let self = self else { return }

      if let error = error {
        print("❌ Error saving VPN configuration: \(error.localizedDescription)")
        print("❌ Error details: \(error)")
        
        // Check if this is a permission error
        if error.localizedDescription.contains("permission") || 
           error.localizedDescription.contains("denied") ||
           error.localizedDescription.contains("authorization") {
          print("🚫 This appears to be a VPN permission error")
          print("💡 User needs to grant VPN configuration permission in iOS Settings")
        }
        
        self.sendEvent(
          self.EVENT_TYPE_EXCEPTION,
          ["message": "Error saving VPN configuration: \(error.localizedDescription)"])
        return
      }

      print("✅ VPN configuration saved successfully to system preferences")
      print("🔄 Proceeding to connect to VPN...")
      self.connectToVPN(manager: providerManager)
    }
  }
  
  // Connect to VPN using the provided manager
  private func connectToVPN(manager: NETunnelProviderManager) {
    print("🔌 Connecting to VPN...")
    
    // Load the configuration to ensure it's up to date
    manager.loadFromPreferences { [weak self] error in
      guard let self = self else { return }

      if let error = error {
        print("❌ Error loading VPN configuration: \(error.localizedDescription)")
        self.sendEvent(
          self.EVENT_TYPE_EXCEPTION,
          ["message": "Error loading VPN configuration: \(error.localizedDescription)"])
        return
      }

      print("✅ VPN configuration loaded successfully")
      
      // Check current connection status
      let currentStatus = manager.connection.status
      print("📱 Current connection status: \(currentStatus)")
      
      if currentStatus == .connected {
        print("✅ VPN is already connected!")
        self.tunnelProvider = manager
        self.isConnected = true
        self.sendEvent(self.EVENT_TYPE_REGULAR, ["event": self.EVENT_STARTED])
        return
      }
      
      if currentStatus == .connecting {
        print("🔄 VPN is already connecting...")
        self.tunnelProvider = manager
        return
      }

      // Start the VPN tunnel
      do {
        print("🚀 Attempting to start VPN tunnel...")
        try manager.connection.startVPNTunnel()
        self.tunnelProvider = manager
        print("✅ VPN tunnel start initiated successfully")
        print("📱 Connection status after start: \(manager.connection.status)")
        
        // Set up status change observer if not already set up
        if self.sessionObserver == nil {
          self.setupTunnelObserver()
        }
        
        // Wait a moment and check if permission dialog appeared
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
          print("🔍 Checking VPN status 2 seconds after start attempt...")
          print("📱 Current status: \(manager.connection.status)")
          
          if manager.connection.status == .disconnected {
            print("⚠️ VPN still disconnected - this may indicate missing VPN permission")
            print("💡 User should see a permission dialog when first installing VPN profile")
          }
        }
        
        // Note: We don't send the EVENT_STARTED here as it will be sent by the observer
        // when the actual connection is established
        
      } catch {
        print("❌ Error starting VPN tunnel: \(error.localizedDescription)")
        print("❌ Error details: \(error)")
        self.sendEvent(
          self.EVENT_TYPE_EXCEPTION,
          ["message": "Error starting VPN tunnel: \(error.localizedDescription)"])
      }
    }
  }
}
