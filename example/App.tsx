import React, { useEffect, useState } from "react";
import { useEvent } from "expo";
import ExpoWireguard from "expo-wireguard";
import {
  Button,
  SafeAreaView,
  ScrollView,
  Text,
  View,
  TextInput,
  Alert,
  StyleSheet,
  Switch,
  Modal,
  TouchableOpacity,
} from "react-native";

export default function App() {
  const [version, setVersion] = useState<string>("");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [currentConfig, setCurrentConfig] = useState<string | null>(null);
  const [eventLogs, setEventLogs] = useState<string[]>([]);
  const [configName, setConfigName] = useState<string>("norenz-se2janti");

  // Configuration input state
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [customConfigName, setCustomConfigName] = useState<string>(
    "My WireGuard Config"
  );
  const [configText, setConfigText] = useState<string>(`[Interface]
PrivateKey = KDKj2gDKyBRnwKtUaynl4wa2++t+1g7uOcVnug7OpUo=
Address = 192.168.6.33/32
DNS = 1.1.1.1,8.8.8.8

[Peer]
PublicKey = WHDJ0JEVhQAzzzyEYZ7igs1MW2ypjwJ7YmjbEdjutiY=
Endpoint = se2.vpnjantit.com:1024
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25`);

  // Example WireGuard configuration
  const [privateKey, setPrivateKey] = useState<string>("");
  const [publicKey, setPublicKey] = useState<string>("");

  // Listen to VPN state changes
  const connectionStateChange = useEvent(
    ExpoWireguard,
    "onConnectionStateChange"
  );
  const errorEvent = useEvent(ExpoWireguard, "onError");

  useEffect(() => {
    // Get WireGuard version
    getVersion();

    // Check initial connection state
    checkConnectionState();

    // Auto-test the bundle ID fix after a short delay
    setTimeout(() => {
      console.log("🔧 Auto-testing bundle ID fix...");
      testBundleIdFix();
    }, 2000);

    // Get current configuration
    getCurrentConfig();
  }, []);

  useEffect(() => {
    if (connectionStateChange) {
      addLog(`Connection state changed: ${connectionStateChange.state}`);
      setIsConnected(connectionStateChange.state === "connected");
    }
  }, [connectionStateChange]);

  useEffect(() => {
    if (errorEvent) {
      addLog(`Error: ${errorEvent.error}`);
      Alert.alert("VPN Error", errorEvent.error);
    }
  }, [errorEvent]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setEventLogs((prev) => [`[${timestamp}] ${message}`, ...prev.slice(0, 19)]);
  };

  const getVersion = async () => {
    try {
      // For backward compatibility, this might not exist in the new API
      if (ExpoWireguard.hello) {
        setVersion(ExpoWireguard.hello());
      } else {
        setVersion("WireGuard Module");
      }
    } catch (error) {
      addLog(`Error getting version: ${error}`);
    }
  };

  const checkConnectionState = async () => {
    try {
      const state = await ExpoWireguard.getConnectionState();
      setIsConnected(state === "connected");
      addLog(`Current connection state: ${state}`);
    } catch (error) {
      addLog(`Error checking connection state: ${error}`);
    }
  };

  const getCurrentConfig = async () => {
    try {
      const config = await ExpoWireguard.getCurrentConfiguration();
      setCurrentConfig(config);
      if (config) {
        addLog(`Current configuration: ${config}`);
      }
    } catch (error) {
      addLog(`Error getting current configuration: ${error}`);
    }
  };

  const generateKeyPair = async () => {
    try {
      const keyPair = await ExpoWireguard.generateKeyPair();
      setPrivateKey(keyPair.privateKey);
      setPublicKey(keyPair.publicKey);
      addLog("Generated new key pair");
    } catch (error) {
      addLog(`Error generating key pair: ${error}`);
      Alert.alert("Error", "Failed to generate key pair");
    }
  };

  const addConfiguration = async () => {
    try {
      // Use the real configuration from norenz-se2janti.conf
      const realConfig = {
        name: configName,
        privateKey: "KDKj2gDKyBRnwKtUaynl4wa2++t+1g7uOcVnug7OpUo=",
        address: "192.168.6.33/32",
        dns: "1.1.1.1,8.8.8.8",
        peers: [
          {
            publicKey: "WHDJ0JEVhQAzzzyEYZ7igs1MW2ypjwJ7YmjbEdjutiY=",
            endpoint: "se2.vpnjantit.com:1024",
            allowedIPs: "0.0.0.0/0, ::/0",
            persistentKeepalive: 25,
          },
        ],
      };

      await ExpoWireguard.addConfiguration(realConfig);
      addLog(`Added configuration: ${configName}`);
      Alert.alert(
        "Success",
        "Real WireGuard configuration added successfully!"
      );
    } catch (error) {
      addLog(`Error adding configuration: ${error}`);
      Alert.alert("Error", `Failed to add configuration: ${error}`);
    }
  };

  const parseWireGuardConfig = (configText: string) => {
    const lines = configText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line);
    const config: any = {
      name: customConfigName,
      peers: [],
    };

    let currentSection = "";
    let currentPeer: any = {};

    for (const line of lines) {
      if (line.startsWith("[") && line.endsWith("]")) {
        if (currentSection === "Peer" && Object.keys(currentPeer).length > 0) {
          config.peers.push(currentPeer);
          currentPeer = {};
        }
        currentSection = line.slice(1, -1);
        continue;
      }

      if (line.includes("=")) {
        const [key, ...valueParts] = line.split("=");
        const value = valueParts.join("=").trim();
        const cleanKey = key.trim();

        if (currentSection === "Interface") {
          // Make field names case-insensitive
          const lowerKey = cleanKey.toLowerCase();
          switch (lowerKey) {
            case "privatekey":
              config.privateKey = value;
              break;
            case "address":
              config.address = value;
              break;
            case "dns":
              config.dns = value;
              break;
            case "mtu":
              config.mtu = parseInt(value);
              break;
          }
        } else if (currentSection === "Peer") {
          // Make field names case-insensitive
          const lowerKey = cleanKey.toLowerCase();
          switch (lowerKey) {
            case "publickey":
              currentPeer.publicKey = value;
              break;
            case "endpoint":
              currentPeer.endpoint = value;
              break;
            case "allowedips":
              currentPeer.allowedIPs = value;
              break;
            case "persistentkeepalive":
              currentPeer.persistentKeepalive = parseInt(value);
              break;
            case "presharedkey":
              currentPeer.presharedKey = value;
              break;
          }
        }
      }
    }

    // Add the last peer if any
    if (currentSection === "Peer" && Object.keys(currentPeer).length > 0) {
      config.peers.push(currentPeer);
    }

    return config;
  };

  const addCustomConfiguration = async () => {
    try {
      const config = parseWireGuardConfig(configText);

      // Validate required fields
      if (!config.privateKey) {
        throw new Error("Private key is required");
      }
      if (!config.address) {
        throw new Error("Address is required");
      }
      if (!config.peers || config.peers.length === 0) {
        throw new Error("At least one peer is required");
      }

      // Validate each peer
      for (const peer of config.peers) {
        if (!peer.publicKey) {
          throw new Error("Peer public key is required");
        }
        if (!peer.endpoint) {
          throw new Error("Peer endpoint is required");
        }
        if (!peer.allowedIPs) {
          throw new Error("Peer allowed IPs is required");
        }
      }

      addLog(`Parsed config: ${JSON.stringify(config, null, 2)}`);

      await ExpoWireguard.addConfiguration(config);
      addLog(`Added custom configuration: ${customConfigName}`);
      setShowConfigModal(false);
      Alert.alert(
        "Success",
        "Custom WireGuard configuration added successfully!"
      );
    } catch (error) {
      addLog(`Error adding custom configuration: ${error}`);
      Alert.alert("Error", `Failed to add configuration: ${error}`);
    }
  };

  const connect = async () => {
    try {
      await ExpoWireguard.connect(configName);
      addLog(`Connecting to: ${configName}`);
    } catch (error) {
      addLog(`Error connecting: ${error}`);
      Alert.alert("Error", `Failed to connect: ${error}`);
    }
  };

  const requestVPNPermission = async () => {
    try {
      await ExpoWireguard.requestVPNPermission();
      addLog("VPN permission granted");
      Alert.alert(
        "Success",
        "VPN permission granted. You can now connect to VPN."
      );
    } catch (error) {
      addLog(`Error requesting VPN permission: ${error}`);
      Alert.alert(
        "Permission Required",
        `Please allow VPN access when prompted: ${error}`
      );
    }
  };

  const disconnect = async () => {
    try {
      await ExpoWireguard.disconnect();
      addLog("Disconnecting...");
    } catch (error) {
      addLog(`Error disconnecting: ${error}`);
      Alert.alert("Error", `Failed to disconnect: ${error}`);
    }
  };

  const listConfigurations = async () => {
    try {
      const configs = await ExpoWireguard.listConfigurations();
      addLog(`Configurations: ${configs.join(", ")}`);
      Alert.alert(
        "Configurations",
        configs.length > 0 ? configs.join("\n") : "No configurations found"
      );
    } catch (error) {
      addLog(`Error listing configurations: ${error}`);
      Alert.alert("Error", `Failed to list configurations: ${error}`);
    }
  };

  // Auto-test function to verify bundle ID fix
  const testBundleIdFix = async () => {
    try {
      addLog("🧪 Starting bundle ID fix test...");

      // Test 1: Request VPN permission
      addLog("1️⃣ Testing VPN permission request...");
      await ExpoWireguard.requestVPNPermission();
      addLog("✅ VPN permission request succeeded!");

      // Test 2: Add a simple test configuration
      addLog("2️⃣ Testing configuration addition...");
      const testConfig = {
        name: "Bundle ID Test",
        privateKey: "YFubTNMYiVVQa+PO+VJSmMZn8kCDcfaAR//Rn8A8iVE=",
        address: "10.0.0.1/32",
        dns: "1.1.1.1",
        peers: [
          {
            publicKey: "xTXPWO73JhKOq5Y9zFPtQpJqITn+ILF6R4YsM5UHgA4=",
            endpoint: "198.51.100.1:51820",
            allowedIPs: "0.0.0.0/0",
          },
        ],
      };

      await ExpoWireguard.addConfiguration(testConfig);
      addLog("✅ Configuration addition succeeded!");

      addLog("🎉 BUNDLE ID FIX VERIFIED! All tests passed!");
    } catch (error) {
      addLog(`❌ Bundle ID fix test failed: ${error}`);
      console.error("Bundle ID fix test failed:", error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.container}>
        <Text style={styles.header}>Expo WireGuard Example</Text>

        <Group name="Module Info">
          <Text style={styles.text}>Version: {version}</Text>
          <Text style={styles.text}>
            Status: {isConnected ? "Connected" : "Disconnected"}
          </Text>
          <Text style={styles.text}>
            Current Config: {currentConfig || "None"}
          </Text>
        </Group>

        <Group name="Key Management">
          <Button title="Generate Key Pair" onPress={generateKeyPair} />
          {privateKey && (
            <View style={styles.keyContainer}>
              <Text style={styles.keyLabel}>Private Key:</Text>
              <Text style={styles.keyText} numberOfLines={1}>
                {privateKey}
              </Text>
              <Text style={styles.keyLabel}>Public Key:</Text>
              <Text style={styles.keyText} numberOfLines={1}>
                {publicKey}
              </Text>
            </View>
          )}
        </Group>

        <Group name="Configuration">
          <TextInput
            style={styles.input}
            placeholder="Configuration name"
            value={configName}
            onChangeText={setConfigName}
          />
          <Button
            title="Add Default Configuration"
            onPress={addConfiguration}
          />
          <Button
            title="Add Custom Configuration"
            onPress={() => setShowConfigModal(true)}
            color="#4ecdc4"
          />
          <Button title="List Configurations" onPress={listConfigurations} />
        </Group>

        <Group name="Connection">
          <Button
            title="Request VPN Permission"
            onPress={requestVPNPermission}
            color="#ff9500"
          />
          <Button
            title={isConnected ? "Disconnect" : "Connect"}
            onPress={isConnected ? disconnect : connect}
            color={isConnected ? "#ff6b6b" : "#4ecdc4"}
          />
          <Button title="Check Status" onPress={checkConnectionState} />
        </Group>

        <Group name="Event Log">
          <ScrollView style={styles.logContainer} nestedScrollEnabled>
            {eventLogs.map((log, index) => (
              <Text key={index} style={styles.logText}>
                {log}
              </Text>
            ))}
          </ScrollView>
        </Group>
      </ScrollView>

      {/* Custom Configuration Modal */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={showConfigModal}
        onRequestClose={() => setShowConfigModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add WireGuard Configuration</Text>
            <TouchableOpacity onPress={() => setShowConfigModal(false)}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Configuration Name:</Text>
              <TextInput
                style={styles.input}
                placeholder="My WireGuard Config"
                value={customConfigName}
                onChangeText={setCustomConfigName}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>WireGuard Configuration:</Text>
              <Text style={styles.inputDescription}>
                Paste your WireGuard configuration below. You can get this from
                your VPN provider or WireGuard server.
              </Text>
              <TextInput
                style={styles.configTextInput}
                multiline
                numberOfLines={15}
                value={configText}
                onChangeText={setConfigText}
                placeholder="[Interface]
PrivateKey = ...
Address = ...

[Peer]
PublicKey = ...
Endpoint = ...
AllowedIPs = ..."
                textAlignVertical="top"
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.addButton}
                onPress={addCustomConfiguration}
              >
                <Text style={styles.addButtonText}>Add Configuration</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowConfigModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function Group(props: { name: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupHeader}>{props.name}</Text>
      {props.children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginVertical: 20,
    color: "#333",
  },
  group: {
    margin: 16,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  groupHeader: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    color: "#333",
  },
  text: {
    fontSize: 16,
    marginVertical: 4,
    color: "#666",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  keyContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
  },
  keyLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
    marginTop: 8,
  },
  keyText: {
    fontSize: 12,
    fontFamily: "monospace",
    color: "#666",
    backgroundColor: "#e9ecef",
    padding: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  logContainer: {
    maxHeight: 200,
    backgroundColor: "#000",
    borderRadius: 8,
    padding: 12,
  },
  logText: {
    fontSize: 12,
    fontFamily: "monospace",
    color: "#00ff00",
    marginVertical: 1,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  closeButton: {
    fontSize: 24,
    color: "#666",
    padding: 5,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  inputDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 10,
    lineHeight: 20,
  },
  configTextInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    fontFamily: "monospace",
    backgroundColor: "#fff",
    minHeight: 200,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },
  addButton: {
    flex: 1,
    backgroundColor: "#4ecdc4",
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginRight: 10,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#ff6b6b",
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginLeft: 10,
  },
  cancelButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
});
