import ExpoModulesCore
import NetworkExtension

// Import C functions from wireguard.h
// These functions will be available due to our bridging header
public class ExpoWireguardModule: Module {
  private var tunnelProvider: NETunnelProviderManager?
  private var connectionHandle: Int = -1
  private var isConnected: Bool = false
  private var sessionName: String = "ExpoWireguard"

  // Events constants
  private let EVENT_TYPE_SYSTEM = "system"
  private let EVENT_TYPE_EXCEPTION = "exception"
  private let EVENT_TYPE_REGULAR = "regular"
  private let EVENT_STARTED = "started"
  private let EVENT_STOPPED = "stopped"
  private let EVENT_STARTED_BY_SYSTEM = "startedBySystem"

  // Reference to the C functions from wireguard.h
  private func getWgVersion() -> String {
    return String(cString: wgVersion())
  }

  public func definition() -> ModuleDefinition {
    Name("ExpoWireguard")

    // Constants accessible from JavaScript
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

      // Create and configure the VPN tunnel
      let providerManager = NETunnelProviderManager()
      let tunnelProtocol = NETunnelProviderProtocol()

      tunnelProtocol.providerBundleIdentifier = "\(Bundle.main.bundleIdentifier!).NetworkExtension"
      tunnelProtocol.serverAddress = "WireGuard"

      // Store the WireGuard config in the protocol configuration
      tunnelProtocol.providerConfiguration = [
        "wgQuickConfig": config
      ]

      providerManager.protocolConfiguration = tunnelProtocol
      providerManager.localizedDescription = session

      // Save the configuration
      providerManager.saveToPreferences { [weak self] error in
        guard let self = self else { return }

        if let error = error {
          self.sendEvent(
            self.EVENT_TYPE_EXCEPTION,
            ["message": "Error saving VPN configuration: \(error.localizedDescription)"])
          return
        }

        // Load the saved configuration
        providerManager.loadFromPreferences { [weak self] error in
          guard let self = self else { return }

          if let error = error {
            self.sendEvent(
              self.EVENT_TYPE_EXCEPTION,
              ["message": "Error loading VPN configuration: \(error.localizedDescription)"])
            return
          }

          // Start the VPN tunnel
          do {
            try providerManager.connection.startVPNTunnel()
            self.tunnelProvider = providerManager
            self.isConnected = true
            self.sendEvent(self.EVENT_TYPE_REGULAR, ["event": self.EVENT_STARTED])
          } catch {
            self.sendEvent(
              self.EVENT_TYPE_EXCEPTION,
              ["message": "Error starting VPN tunnel: \(error.localizedDescription)"])
          }
        }
      }
    }

    // Disconnect from WireGuard VPN
    AsyncFunction("Disconnect") { () -> Void in
      guard let tunnelProvider = self.tunnelProvider else {
        self.sendEvent(self.EVENT_TYPE_EXCEPTION, ["message": "No active VPN connection"])
        return
      }

      tunnelProvider.connection.stopVPNTunnel()
      self.isConnected = false
      self.sendEvent(self.EVENT_TYPE_REGULAR, ["event": self.EVENT_STOPPED])
    }

    // Check if VPN is connected
    AsyncFunction("Status") { () -> Bool in
      return self.isConnected
    }

    // When the module is initialized
    OnCreate {
      // Monitor system VPN status changes
      NotificationCenter.default.addObserver(
        forName: NSNotification.Name.NEVPNStatusDidChange,
        object: nil,
        queue: nil
      ) { [weak self] notification in
        guard let self = self,
          let connection = notification.object as? NEVPNConnection
        else {
          return
        }

        switch connection.status {
        case .connected:
          self.isConnected = true
          self.sendEvent(self.EVENT_TYPE_REGULAR, ["event": self.EVENT_STARTED])
        case .disconnected:
          self.isConnected = false
          self.sendEvent(self.EVENT_TYPE_REGULAR, ["event": self.EVENT_STOPPED])
        case .reasserting:
          // VPN is reconnecting
          break
        default:
          // Other states like connecting, disconnecting
          break
        }
      }

      // Check if system tried to start VPN
      NETunnelProviderManager.loadAllFromPreferences { [weak self] (managers, error) in
        guard let self = self,
          let managers = managers,
          let manager = managers.first,
          manager.connection.status == .connected
        else {
          return
        }

        // VPN was started by the system
        self.tunnelProvider = manager
        self.isConnected = true
        self.sendEvent(self.EVENT_TYPE_SYSTEM, ["event": self.EVENT_STARTED_BY_SYSTEM])
      }
    }
  }
}
