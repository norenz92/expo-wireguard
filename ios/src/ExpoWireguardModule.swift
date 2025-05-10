import ExpoModulesCore

public class ExpoWireguardModule: Module {
  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  public func definition() -> ModuleDefinition {
    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('ExpoWireguard')` in JavaScript.
    Name("ExpoWireguard")

    Function("getVersion") { () -> String in
      // Here you would implement the logic to get the status of the WireGuard module.
      // For now, we just return a dummy status message.
      return "WireGuard is running"
    }

    AsyncFunction("connect") { (config: [String: Any]) -> Void in
      // Here you would implement the logic to connect to a WireGuard server using the provided configuration.
      // For now, we just print the configuration to the console.
      print("Connecting to WireGuard with config: \(config)")
    }
    AsyncFunction("disconnect") { () -> Void in
      // Here you would implement the logic to disconnect from the WireGuard server.
      // For now, we just print a message to the console.
      print("Disconnecting from WireGuard")
    }
    AsyncFunction("getStatus") { () -> String in
      // Here you would implement the logic to get the status of the WireGuard connection.
      // For now, we just return a dummy status message.
      return "WireGuard is connected"
    }
  }
}
