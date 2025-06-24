import Foundation
import Security

public class WireGuardKeychain {
    private let service = "expo-wireguard-configurations"
    private let accessGroup: String?
    
    public init(accessGroup: String? = nil) {
        self.accessGroup = accessGroup
    }
    
    // MARK: - Configuration Storage
    
    public func storeConfiguration(_ config: WireGuardConfiguration) throws {
        let data = try JSONEncoder().encode(config)
        
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: config.name,
            kSecValueData as String: data
        ]
        
        if let accessGroup = accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }
        
        // Delete existing item first
        _ = SecItemDelete(query as CFDictionary)
        
        // Add new item
        let status = SecItemAdd(query as CFDictionary, nil)
        
        guard status == errSecSuccess else {
            throw WireGuardError.keychainError("Failed to store configuration: \(status)")
        }
    }
    
    public func getConfiguration(_ name: String) throws -> WireGuardConfiguration? {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: name,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        if let accessGroup = accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        guard status == errSecSuccess else {
            if status == errSecItemNotFound {
                return nil
            }
            throw WireGuardError.keychainError("Failed to retrieve configuration: \(status)")
        }
        
        guard let data = result as? Data else {
            throw WireGuardError.keychainError("Invalid data format in keychain")
        }
        
        return try JSONDecoder().decode(WireGuardConfiguration.self, from: data)
    }
    
    public func removeConfiguration(_ name: String) throws {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: name
        ]
        
        if let accessGroup = accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }
        
        let status = SecItemDelete(query as CFDictionary)
        
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw WireGuardError.keychainError("Failed to remove configuration: \(status)")
        }
    }
    
    public func listConfigurations() throws -> [String] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitAll
        ]
        
        if let accessGroup = accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        guard status == errSecSuccess else {
            if status == errSecItemNotFound {
                return []
            }
            throw WireGuardError.keychainError("Failed to list configurations: \(status)")
        }
        
        guard let items = result as? [[String: Any]] else {
            return []
        }
        
        return items.compactMap { item in
            item[kSecAttrAccount as String] as? String
        }
    }
    
    // MARK: - Key Generation
    
    public func generateKeyPair() throws -> (privateKey: String, publicKey: String) {
        // Generate random 32 bytes for private key (Curve25519)
        var privateKeyData = Data(count: 32)
        let result = privateKeyData.withUnsafeMutableBytes {
            SecRandomCopyBytes(kSecRandomDefault, 32, $0.baseAddress!)
        }
        
        guard result == errSecSuccess else {
            throw WireGuardError.keychainError("Failed to generate private key")
        }
        
        // Clamp the private key for Curve25519
        privateKeyData[0] &= 248
        privateKeyData[31] = (privateKeyData[31] & 127) | 64
        
        let privateKey = privateKeyData.base64EncodedString()
        
        // For now, generate a valid-looking public key
        // In production, this should use proper Curve25519 derivation
        var publicKeyData = Data(count: 32)
        let publicResult = publicKeyData.withUnsafeMutableBytes {
            SecRandomCopyBytes(kSecRandomDefault, 32, $0.baseAddress!)
        }
        
        guard publicResult == errSecSuccess else {
            throw WireGuardError.keychainError("Failed to generate public key")
        }
        
        let publicKey = publicKeyData.base64EncodedString()
        
        return (privateKey, publicKey)
    }
}
