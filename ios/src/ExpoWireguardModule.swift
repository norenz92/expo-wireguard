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

      // Create and configure the VPN tunnel
      let providerManager = NETunnelProviderManager()
      let tunnelProtocol = NETunnelProviderProtocol()

      tunnelProtocol.providerBundleIdentifier =
        "\(Bundle.main.bundleIdentifier!).WireGuardNetworkExtension"
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

            // Set up status change observer
            if self.sessionObserver == nil {
              self.setupTunnelObserver()
            }
          } catch {
            self.sendEvent(
              self.EVENT_TYPE_EXCEPTION,
              ["message": "Error starting VPN tunnel: \(error.localizedDescription)"])
          }
        }
      }
    }

    // Check connection status
    AsyncFunction("Status") { () -> Bool in
      return self.isConnected
    }

    // Disconnect from WireGuard VPN
    AsyncFunction("Disconnect") { () in
      guard let tunnelProvider = self.tunnelProvider else {
        return
      }

      // Stop the VPN tunnel
      tunnelProvider.connection.stopVPNTunnel()
    }
  }

  // Set up observer for tunnel status changes
  private func setupTunnelObserver() {
    self.sessionObserver = NotificationCenter.default.addObserver(
      forName: NSNotification.Name.NEVPNStatusDidChange,
      object: nil,
      queue: nil
    ) { [weak self] notification in
      guard let self = self,
        let connection = notification.object as? NETunnelProviderSession
      else {
        return
      }

      switch connection.status {
      case .disconnected, .invalid:
        self.isConnected = false
        self.sendEvent(self.EVENT_TYPE_REGULAR, ["event": self.EVENT_STOPPED])
      case .connected:
        self.isConnected = true
        self.sendEvent(self.EVENT_TYPE_REGULAR, ["event": self.EVENT_STARTED])
      default:
        // Other states (connecting, disconnecting, reasserting) - do nothing
        break
      }
    }
  }

  // Get the WireGuard version
  private func getWgVersion() -> String {
    // This function comes from the WireGuard framework
    // through the bridging header
    return String(cString: wgVersion())
  }

  // Clean up when module is destroyed
  public func cleanup() {
    if let observer = sessionObserver {
      NotificationCenter.default.removeObserver(observer)
      sessionObserver = nil
    }
  }
}
