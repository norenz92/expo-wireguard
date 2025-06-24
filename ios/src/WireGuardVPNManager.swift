import Foundation
import NetworkExtension
import Security
import CryptoKit

// MARK: - Private Key Generation

/// Generates private keys for WireGuard (following official WireGuard approach)
public class PrivateKey {
    private let keyData: Data
    
    public init() {
        // Generate a random 32-byte private key
        self.keyData = Data((0..<32).map { _ in UInt8.random(in: 0...255) })
    }
    
    public init?(base64Key: String) {
        guard let data = Data(base64Encoded: base64Key), data.count == 32 else {
            return nil
        }
        self.keyData = data
    }
    
    public var base64Key: String {
        return keyData.base64EncodedString()
    }
    
    public var publicKey: PublicKey {
        return PublicKey(privateKey: self)
    }
    
    // Getter method to access keyData
    internal func getKeyData() -> Data {
        return keyData
    }
}

/// Public key derived from private key
public class PublicKey {
    private let keyData: Data
    
    internal init(privateKey: PrivateKey) {
        // For this example, we'll use a simple derivation
        // In a real implementation, you'd use Curve25519
        var hasher = SHA256()
        hasher.update(data: privateKey.getKeyData()) // Use getter method
        self.keyData = Data(hasher.finalize().prefix(32))
    }
    
    public init?(base64Key: String) {
        guard let data = Data(base64Encoded: base64Key), data.count == 32 else {
            return nil
        }
        self.keyData = data
    }
    
    public var base64Key: String {
        return keyData.base64EncodedString()
    }
}

public class WireGuardVPNManager: NSObject {
    public static let shared = WireGuardVPNManager()
    
    private var vpnManager: NEVPNManager?
    private let keychain = WireGuardKeychain(accessGroup: "group.expo.modules.wireguard.example")
    
    public weak var delegate: WireGuardVPNManagerDelegate?
    
    private override init() {
        super.init()
        setupVPNManager()
    }
    
    private func setupVPNManager() {
        Task {
            vpnManager = NEVPNManager.shared()
            
            // Try to load existing preferences, but don't fail if VPN permission isn't granted yet
            do {
                try await vpnManager?.loadFromPreferences()
                print("VPN preferences loaded successfully")
            } catch let error as NEVPNError {
                print("VPN preferences load failed (this is normal for first-time setup): \(error.localizedDescription)")
                // Don't throw here - this is expected on first run before permissions are granted
            } catch {
                print("VPN preferences load failed: \(error.localizedDescription)")
                // Don't throw here either - we'll handle permissions when needed
            }
            
            setupConnectionObserver()
        }
    }
    
    private func setupConnectionObserver() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(vpnStatusDidChange),
            name: .NEVPNStatusDidChange,
            object: nil
        )
    }
    
    @objc private func vpnStatusDidChange() {
        guard let vpnManager = vpnManager else { return }
        
        let state: VPNConnectionState
        switch vpnManager.connection.status {
        case .disconnected:
            state = .disconnected
        case .connecting:
            state = .connecting
        case .connected:
            state = .connected
        case .disconnecting:
            state = .disconnecting
        case .reasserting:
            state = .reconnecting
        case .invalid:
            state = .invalid
        @unknown default:
            state = .invalid
        }
        
        delegate?.vpnManager(self, didChangeState: state)
    }
    
    // MARK: - Configuration Management
    
    public func addConfiguration(_ config: WireGuardConfiguration) async throws {
        // Store configuration securely in keychain
        try keychain.storeConfiguration(config)
        
        // Configure VPN manager
        try await configureVPNManager(with: config)
        
        delegate?.vpnManager(self, didAddConfiguration: config.name)
    }
    
    public func removeConfiguration(_ name: String) async throws {
        try keychain.removeConfiguration(name)
        
        if getCurrentConfigurationName() == name {
            try await disconnect()
        }
        
        delegate?.vpnManager(self, didRemoveConfiguration: name)
    }
    
    public func listConfigurations() throws -> [String] {
        return try keychain.listConfigurations()
    }
    
    public func getConfiguration(_ name: String) throws -> WireGuardConfiguration? {
        return try keychain.getConfiguration(name)
    }
    
    // MARK: - Connection Management
    
    public func connect(configurationName: String) async throws {
        guard let config = try getConfiguration(configurationName) else {
            throw WireGuardError.configurationNotFound(configurationName)
        }
        
        // First, request VPN permissions by configuring the manager
        try await configureVPNManager(with: config)
        
        // Then start the VPN connection
        try await startVPN()
    }
    
    public func requestVPNPermission() async throws {
        // Ensure VPN manager is available
        if vpnManager == nil {
            vpnManager = NEVPNManager.shared()
        }
        
        guard let vpnManager = vpnManager else {
            throw WireGuardError.vpnManagerNotInitialized
        }
        
        print("Requesting VPN permission...")
        
        // DIFFERENT APPROACH: Try to load existing configurations first
        // This is how the official WireGuard app checks for VPN permissions
        do {
            try await vpnManager.loadFromPreferences()
            print("✅ VPN permission already granted - can load preferences")
            return
        } catch let error as NEVPNError {
            print("VPN preferences load failed (expected for first-time setup): \(error.localizedDescription)")
            // Continue with permission request
        } catch {
            print("VPN preferences load failed: \(error.localizedDescription)")
            // Continue with permission request
        }
        
        // Create a minimal, valid WireGuard configuration for permission request
        // Use a more realistic configuration that matches official WireGuard patterns
        let dummyConfig = WireGuardConfiguration(
            name: "Permission Request",
            privateKey: "YFubTNMYiVVQa+PO+VJSmMZn8kCDcfaAR//Rn8A8iVE=", // Fixed dummy key
            address: "10.0.0.1/32",
            dns: "1.1.1.1",
            peers: [
                WireGuardPeer(
                    publicKey: "xTXPWO73JhKOq5Y9zFPtQpJqITn+ILF6R4YsM5UHgA4=", // Fixed dummy peer key
                    endpoint: "198.51.100.1:51820", // Use reserved IP for testing
                    allowedIPs: "0.0.0.0/0"
                )
            ]
        )
        
        // Use the keychain-based approach like the official WireGuard app
        try await configureVPNManager(with: dummyConfig)
        
        print("✅ VPN permission granted successfully")
    }
    
    public func disconnect() async throws {
        guard let vpnManager = vpnManager else {
            throw WireGuardError.vpnManagerNotInitialized
        }
        
        vpnManager.connection.stopVPNTunnel()
    }
    
    public func getConnectionState() -> VPNConnectionState {
        guard let vpnManager = vpnManager else {
            print("VPN manager not initialized, returning invalid state")
            return .invalid
        }
        
        let status = vpnManager.connection.status
        print("Current VPN status: \(status)")
        
        switch status {
        case .disconnected:
            return .disconnected
        case .connecting:
            return .connecting
        case .connected:
            return .connected
        case .disconnecting:
            return .disconnecting
        case .reasserting:
            return .reconnecting
        case .invalid:
            return .invalid
        @unknown default:
            return .invalid
        }
    }
    
    public func getCurrentConfigurationName() -> String? {
        return vpnManager?.protocolConfiguration?.serverAddress
    }
    
    // MARK: - Private Methods
    
    private func configureVPNManager(with config: WireGuardConfiguration) async throws {
        guard let vpnManager = vpnManager else {
            throw WireGuardError.vpnManagerNotInitialized
        }
        
        // Get the app bundle identifier - this should be the main app's bundle ID
        guard let appBundleId = Bundle.main.bundleIdentifier else {
            throw WireGuardError.configurationFailed("Could not determine app bundle identifier")
        }
        
        // For now, hardcode the correct Network Extension bundle ID to avoid any issues
        // TODO: Make this dynamic once bundle ID detection is reliable
        let extensionBundleId = "expo.modules.wireguard.example.network-extension"
        
        // Debug logging
        print("🔍 DEBUG: Main app bundle ID: '\(appBundleId)'")
        print("🔍 DEBUG: Network Extension bundle ID (hardcoded): '\(extensionBundleId)'")
        print("🔍 DEBUG: WireGuard config: \(config.toWGConfig())")
        
        // ✅ CRITICAL FIX: Follow the exact official WireGuard pattern
        // Create protocol configuration using the EXACT official WireGuard approach
        guard let protocolConfiguration = createNETunnelProviderProtocol(for: config, bundleId: extensionBundleId) else {
            throw WireGuardError.configurationFailed("Failed to create valid NETunnelProviderProtocol - keychain reference creation failed")
        }
        
        print("✅ Successfully created NETunnelProviderProtocol with valid keychain reference")
        print("Protocol configuration created with bundle ID: \(extensionBundleId)")
        
        vpnManager.protocolConfiguration = protocolConfiguration
        vpnManager.localizedDescription = "WireGuard VPN - \(config.name)"
        vpnManager.isEnabled = true
        
        print("Saving VPN configuration using keychain approach...")
        
        // Add additional debugging before saving
        print("🔍 DETAILED DEBUG BEFORE SAVE:")
        print("- VPN Manager enabled: \(vpnManager.isEnabled)")
        print("- VPN Manager description: \(vpnManager.localizedDescription ?? "nil")")
        print("- Protocol bundle ID: \(protocolConfiguration.providerBundleIdentifier ?? "nil")")
        print("- Protocol server address: \(protocolConfiguration.serverAddress ?? "nil")")
        print("- Protocol password reference: \(protocolConfiguration.passwordReference?.count ?? 0) bytes")
        print("- Protocol provider config: \(protocolConfiguration.providerConfiguration?.description ?? "nil")")
        
        do {
            // Validate protocol configuration before saving
            if let protocolConfig = protocolConfiguration as? NETunnelProviderProtocol {
                print("🔍 PRE-SAVE VALIDATION:")
                print("- Bundle ID: \(protocolConfig.providerBundleIdentifier ?? "MISSING")")
                print("- Server Address: \(protocolConfig.serverAddress ?? "MISSING")")
                print("- Password Reference: \(protocolConfig.passwordReference != nil ? "Present (\(protocolConfig.passwordReference!.count) bytes)" : "MISSING")")
                print("- Provider Configuration: \(protocolConfig.providerConfiguration != nil ? "Present" : "nil (expected for iOS)")")
                
                // Critical validation checks
                if protocolConfig.providerBundleIdentifier == nil || protocolConfig.providerBundleIdentifier!.isEmpty {
                    throw WireGuardError.configurationFailed("VALIDATION FAILED: Missing provider bundle identifier")
                }
                
                if protocolConfig.passwordReference == nil {
                    throw WireGuardError.configurationFailed("VALIDATION FAILED: Missing password reference (keychain)")
                }
                
                if protocolConfig.serverAddress == nil || protocolConfig.serverAddress!.isEmpty {
                    throw WireGuardError.configurationFailed("VALIDATION FAILED: Missing server address")
                }
                
                print("✅ Protocol configuration validation passed")
            }
            
            try await vpnManager.saveToPreferences()
            print("✅ VPN configuration saved successfully")
            try await vpnManager.loadFromPreferences()
            print("✅ VPN configuration loaded successfully")
        } catch let error as NEVPNError {
            print("❌ NEVPNError saving configuration: \(error)")
            print("Error code: \(error.code.rawValue) (\(error.code))")
            print("Error description: \(error.localizedDescription)")
            print("Error userInfo: \(error.userInfo)")
            
            // Run Network Extension diagnosis for configurationInvalid errors
            if error.code == .configurationInvalid {
                print("🔍 CONFIGURATION INVALID - Running detailed diagnosis:")
                await diagnoseNetworkExtension()
                
                // Additional specific checks for configurationInvalid
                print("🔍 CONFIGURATION INVALID ANALYSIS:")
                if let protocolConfig = protocolConfiguration as? NETunnelProviderProtocol {
                    print("- Bundle ID format check: \(protocolConfig.providerBundleIdentifier ?? "nil")")
                    print("- Bundle ID length: \(protocolConfig.providerBundleIdentifier?.count ?? 0)")
                    print("- Contains network-extension: \(protocolConfig.providerBundleIdentifier?.contains("network-extension") ?? false)")
                    print("- Matches expected: \(protocolConfig.providerBundleIdentifier == extensionBundleId)")
                }
            }
            
            // Handle specific VPN permission errors
            switch error.code {
            case .configurationReadWriteFailed:
                throw WireGuardError.configurationFailed("VPN configuration permission denied. Please allow VPN access in Settings.")
            case .configurationStale:
                throw WireGuardError.configurationFailed("VPN configuration is stale. Please try again.")
            case .configurationInvalid:
                throw WireGuardError.configurationFailed("VPN configuration is invalid. Possible causes: 1) Network Extension not found in bundle, 2) Incorrect bundle ID (\(extensionBundleId)), 3) Missing entitlements, 4) Invalid protocol configuration")
            default:
                throw WireGuardError.configurationFailed("Failed to configure VPN manager: \(error.localizedDescription)")
            }
        } catch {
            print("❌ Failed to save/load VPN configuration: \(error)")
            print("Error details: \(error.localizedDescription)")
            throw WireGuardError.configurationFailed("Failed to configure VPN manager: \(error.localizedDescription)")
        }
    }
    
    /// Create NETunnelProviderProtocol following the EXACT official WireGuard pattern
    /// Returns nil if keychain reference creation fails (like official WireGuard)
    private func createNETunnelProviderProtocol(for config: WireGuardConfiguration, bundleId: String) -> NETunnelProviderProtocol? {
        let protocolConfiguration = NETunnelProviderProtocol()
        
        // Set bundle identifier
        protocolConfiguration.providerBundleIdentifier = bundleId
        
        // Set server address based on endpoints (following official WireGuard pattern)
        let endpoints = config.peers.compactMap { $0.endpoint }
        if endpoints.count == 1 {
            protocolConfiguration.serverAddress = endpoints[0]
        } else if endpoints.isEmpty {
            protocolConfiguration.serverAddress = "Unspecified"
        } else {
            protocolConfiguration.serverAddress = "Multiple endpoints"
        }
        
        // Store WireGuard configuration in keychain (EXACTLY like official WireGuard)
        let configText = config.toWGConfig()
        
        // ✅ CRITICAL: Use the EXACT pattern from official WireGuard
        // If keychain reference creation fails, return nil (invalidates the entire protocol configuration)
        guard let keychainReference = try? createKeychainReference(containing: configText, called: config.name) else {
            print("❌ Failed to create keychain reference - returning nil protocol configuration")
            return nil
        }
        
        protocolConfiguration.passwordReference = keychainReference
        
        // CRITICAL: For iOS, providerConfiguration must be nil (official WireGuard pattern)
        // Only macOS uses providerConfiguration = ["UID": getuid()]
        #if os(iOS)
        protocolConfiguration.providerConfiguration = nil
        #elseif os(macOS)
        protocolConfiguration.providerConfiguration = ["UID": getuid()]
        #endif
        
        print("✅ Created valid NETunnelProviderProtocol with keychain reference")
        return protocolConfiguration
    }
    
    private func startVPN() async throws {
        guard let vpnManager = vpnManager else {
            throw WireGuardError.vpnManagerNotInitialized
        }
        
        print("Starting VPN tunnel...")
        print("Protocol configuration: \(String(describing: vpnManager.protocolConfiguration))")
        
        do {
            try vpnManager.connection.startVPNTunnel()
        } catch let error as NEVPNError {
            let errorMessage: String
            switch error.code {
            case .configurationInvalid:
                errorMessage = "VPN configuration is invalid"
            case .configurationDisabled:
                errorMessage = "VPN configuration is disabled"
            case .connectionFailed:
                errorMessage = "VPN connection failed"
            case .configurationStale:
                errorMessage = "VPN configuration is stale"
            case .configurationReadWriteFailed:
                errorMessage = "Failed to read/write VPN configuration"
            case .configurationUnknown:
                errorMessage = "Unknown VPN configuration error"
            @unknown default:
                errorMessage = "Unknown VPN error: \(error.localizedDescription)"
            }
            print("VPN Error: \(errorMessage)")
            throw WireGuardError.connectionFailed(errorMessage)
        } catch {
            print("General error starting VPN: \(error.localizedDescription)")
            throw WireGuardError.connectionFailed(error.localizedDescription)
        }
    }
    
    // MARK: - Keychain Management (following official WireGuard pattern)
    
    private func createKeychainReference(containing value: String, called name: String, previouslyReferencedBy oldReference: Data? = nil) throws -> Data {
        // EXACT official WireGuard keychain implementation
        var ret: OSStatus
        guard var bundleIdentifier = Bundle.main.bundleIdentifier else {
            throw WireGuardError.keychainError("Unable to determine bundle identifier")
        }
        
        // Remove .network-extension suffix if present (official WireGuard pattern)
        if bundleIdentifier.hasSuffix(".network-extension") {
            bundleIdentifier.removeLast(".network-extension".count)
        }
        
        let itemLabel = "WireGuard Tunnel: \(name)"
        var items: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrLabel: itemLabel,
            kSecAttrAccount: name + ": " + UUID().uuidString,
            kSecAttrDescription: "wg-quick(8) config",
            kSecAttrService: bundleIdentifier,
            kSecValueData: value.data(using: .utf8) as Any,
            kSecReturnPersistentRef: true
        ]
        
        // iOS-specific settings (from official WireGuard)
        #if os(iOS)
        items[kSecAttrAccessGroup] = "group.expo.modules.wireguard.example"
        items[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlock
        #elseif os(macOS)
        items[kSecAttrSynchronizable] = false
        items[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        #endif
        
        var ref: CFTypeRef?
        ret = SecItemAdd(items as CFDictionary, &ref)
        if ret != errSecSuccess || ref == nil {
            print("❌ Failed to add keychain item: \(ret)")
            throw WireGuardError.keychainError("Unable to add config to keychain: \(ret)")
        }
        
        // Delete old reference if it exists (official WireGuard pattern)
        if let oldRef = oldReference {
            deleteKeychainReference(oldRef)
        }
        
        guard let persistentRef = ref as? Data else {
            throw WireGuardError.keychainError("Failed to get persistent reference from keychain")
        }
        
        print("✅ Created keychain reference with \(persistentRef.count) bytes")
        return persistentRef
    }
    
    private func deleteKeychainReference(_ reference: Data) {
        let query: [CFString: Any] = [
            kSecValuePersistentRef: reference
        ]
        
        let status = SecItemDelete(query as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            print("⚠️ Warning: Failed to delete keychain reference: \(status)")
        }
    }
    
    private func diagnoseNetworkExtension() async {
        print("🔍 Network Extension Diagnosis:")
        
        // Check if Network Extension exists in bundle
        let extensionsURL = Bundle.main.bundleURL.appendingPathComponent("PlugIns")
        do {
            let extensions = try FileManager.default.contentsOfDirectory(at: extensionsURL, includingPropertiesForKeys: nil)
            print("- Extensions found: \(extensions.map { $0.lastPathComponent })")
            
            let wireGuardExtension = extensions.first { $0.lastPathComponent.contains("WireGuard") }
            if let extensionURL = wireGuardExtension {
                print("- WireGuard extension path: \(extensionURL.path)")
                
                // Check Info.plist
                let infoPlistURL = extensionURL.appendingPathComponent("Info.plist")
                if let plistData = try? Data(contentsOf: infoPlistURL),
                   let plist = try? PropertyListSerialization.propertyList(from: plistData, options: [], format: nil) as? [String: Any] {
                    print("- Bundle ID from plist: \(plist["CFBundleIdentifier"] as? String ?? "nil")")
                    print("- Bundle executable: \(plist["CFBundleExecutable"] as? String ?? "nil")")
                    print("- Bundle version: \(plist["CFBundleShortVersionString"] as? String ?? "nil")")
                    print("- NSExtension: \(plist["NSExtension"] != nil ? "present" : "missing")")
                    
                    if let nsExtension = plist["NSExtension"] as? [String: Any] {
                        print("- NSExtensionPointIdentifier: \(nsExtension["NSExtensionPointIdentifier"] as? String ?? "nil")")
                        print("- NSExtensionPrincipalClass: \(nsExtension["NSExtensionPrincipalClass"] as? String ?? "nil")")
                        
                        // Check if principal class is correctly configured
                        let expectedPrincipalClass = "$(PRODUCT_MODULE_NAME).PacketTunnelProvider"
                        let actualPrincipalClass = nsExtension["NSExtensionPrincipalClass"] as? String
                        print("- Principal class matches expected: \(actualPrincipalClass == expectedPrincipalClass)")
                    }
                    
                    // Validate bundle ID against what we're trying to use
                    let plistBundleId = plist["CFBundleIdentifier"] as? String
                    let expectedBundleId = "expo.modules.wireguard.example.network-extension"
                    print("- Bundle ID validation:")
                    print("  - From plist: \(plistBundleId ?? "nil")")
                    print("  - Expected: \(expectedBundleId)")
                    print("  - Match: \(plistBundleId == expectedBundleId)")
                    
                } else {
                    print("- ERROR: Could not read Info.plist")
                }
                
                // Check entitlements file
                let entitlementsURL = extensionURL.appendingPathComponent("WireGuardNetworkExtension.entitlements")
                let entitlementsExists = FileManager.default.fileExists(atPath: entitlementsURL.path)
                print("- Entitlements file exists: \(entitlementsExists)")
                
                // Check executable file
                if let executableName = try? PropertyListSerialization.propertyList(from: Data(contentsOf: infoPlistURL), options: [], format: nil) as? [String: Any],
                   let executable = executableName["CFBundleExecutable"] as? String {
                    let executableURL = extensionURL.appendingPathComponent(executable)
                    let executableExists = FileManager.default.fileExists(atPath: executableURL.path)
                    print("- Executable exists: \(executableExists)")
                    
                    if executableExists {
                        // Check if executable has proper code signing
                        print("- Executable path: \(executableURL.path)")
                    }
                }
            } else {
                print("- ERROR: WireGuard Network Extension not found!")
                print("- Available extensions: \(extensions.map { $0.lastPathComponent })")
            }
        } catch {
            print("- ERROR: Could not read PlugIns directory: \(error)")
        }
        
        // Check app entitlements
        print("- Main app bundle ID: \(Bundle.main.bundleIdentifier ?? "nil")")
        print("- Main app path: \(Bundle.main.bundlePath)")
        
        // Additional bundle validation
        print("🔍 Bundle Structure Validation:")
        let mainBundleURL = Bundle.main.bundleURL
        print("- Main bundle URL: \(mainBundleURL)")
        
        // Check if PlugIns directory exists
        let plugInsExists = FileManager.default.fileExists(atPath: extensionsURL.path)
        print("- PlugIns directory exists: \(plugInsExists)")
        
        if !plugInsExists {
            print("- ERROR: PlugIns directory is missing - Network Extensions cannot work")
        }
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
    }
}

// MARK: - Delegate Protocol

public protocol WireGuardVPNManagerDelegate: AnyObject {
    func vpnManager(_ manager: WireGuardVPNManager, didChangeState state: VPNConnectionState)
    func vpnManager(_ manager: WireGuardVPNManager, didFailWithError error: WireGuardError)
    func vpnManager(_ manager: WireGuardVPNManager, didAddConfiguration name: String)
    func vpnManager(_ manager: WireGuardVPNManager, didRemoveConfiguration name: String)
}

// MARK: - Error Types

public enum WireGuardError: Error, LocalizedError {
    case vpnManagerNotInitialized
    case vpnManagerSetupFailed(String)
    case configurationNotFound(String)
    case configurationInvalid(String)
    case configurationFailed(String)
    case connectionFailed(String)
    case keychainError(String)
    case networkExtensionNotFound
    
    public var errorDescription: String? {
        switch self {
        case .vpnManagerNotInitialized:
            return "VPN manager is not initialized"
        case .vpnManagerSetupFailed(let reason):
            return "VPN manager setup failed: \(reason)"
        case .configurationNotFound(let name):
            return "Configuration '\(name)' not found"
        case .configurationInvalid(let reason):
            return "Configuration is invalid: \(reason)"
        case .configurationFailed(let reason):
            return "Configuration failed: \(reason)"
        case .connectionFailed(let reason):
            return "VPN connection failed: \(reason)"
        case .keychainError(let reason):
            return "Keychain error: \(reason)"
        case .networkExtensionNotFound:
            return "Network extension not found"
        }
    }
    
    public var errorCode: String {
        switch self {
        case .vpnManagerNotInitialized:
            return "VPN_MANAGER_NOT_INITIALIZED"
        case .vpnManagerSetupFailed:
            return "VPN_MANAGER_SETUP_FAILED"
        case .configurationNotFound:
            return "CONFIGURATION_NOT_FOUND"
        case .configurationInvalid:
            return "CONFIGURATION_INVALID"
        case .configurationFailed:
            return "CONFIGURATION_FAILED"
        case .connectionFailed:
            return "CONNECTION_FAILED"
        case .keychainError:
            return "KEYCHAIN_ERROR"
        case .networkExtensionNotFound:
            return "NETWORK_EXTENSION_NOT_FOUND"
        }
    }
}
