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

    // Function to configue the WireGuard module. Return a string indicating success or failure.
    Function("configure") { (config: String) -> String in
      // Here you would implement the logic to configure the WireGuard module with the provided config.
      // For now, we just return a success message.
      return "WireGuard configured successfully with config: \(config)"
    }
  }
}
