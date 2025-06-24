import React, { useEffect, useState } from "react";
import ExpoWireguard from "expo-wireguard";
import {
  Button,
  SafeAreaView,
  ScrollView,
  Text,
  View,
  Alert,
  StyleSheet,
} from "react-native";

export default function App() {
  const [eventLogs, setEventLogs] = useState<string[]>([]);

  useEffect(() => {
    addLog("WireGuard module loaded");
  }, []);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setEventLogs((prev) => [`[${timestamp}] ${message}`, ...prev.slice(0, 19)]);
  };

  const testHello = () => {
    try {
      const result = ExpoWireguard.hello();
      addLog(`Hello result: ${result}`);
    } catch (error) {
      addLog(`Error calling hello: ${error}`);
    }
  };

  const testPI = () => {
    try {
      const pi = ExpoWireguard.PI;
      addLog(`PI value: ${pi}`);
    } catch (error) {
      addLog(`Error getting PI: ${error}`);
    }
  };

  const testSetValue = async () => {
    try {
      await ExpoWireguard.setValueAsync("Test value from React Native");
      addLog("Set value successfully");
    } catch (error) {
      addLog(`Error setting value: ${error}`);
    }
  };

  const testGenerateKeys = async () => {
    try {
      const keyPair = await ExpoWireguard.generateKeyPair();
      addLog(
        `Generated keys - Private: ${keyPair.privateKey.substring(0, 20)}...`
      );
      addLog(`Public: ${keyPair.publicKey.substring(0, 20)}...`);
    } catch (error) {
      addLog(`Error generating keys: ${error}`);
    }
  };

  const testGetConnectionState = async () => {
    try {
      const state = await ExpoWireguard.getConnectionState();
      addLog(`Connection state: ${state}`);
    } catch (error) {
      addLog(`Error getting connection state: ${error}`);
    }
  };

  const testListConfigurations = async () => {
    try {
      const configs = await ExpoWireguard.listConfigurations();
      addLog(`Configurations: ${configs.length} found`);
      configs.forEach((config) => addLog(`- ${config}`));
    } catch (error) {
      addLog(`Error listing configurations: ${error}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content}>
        <Text style={styles.header}>Expo WireGuard Test</Text>

        <View style={styles.group}>
          <Text style={styles.groupHeader}>Basic Tests</Text>
          <Button title="Test Hello" onPress={testHello} />
          <View style={styles.buttonSpacer} />
          <Button title="Test PI Constant" onPress={testPI} />
          <View style={styles.buttonSpacer} />
          <Button title="Test Set Value" onPress={testSetValue} />
        </View>

        <View style={styles.group}>
          <Text style={styles.groupHeader}>WireGuard Functions</Text>
          <Button title="Generate Key Pair" onPress={testGenerateKeys} />
          <View style={styles.buttonSpacer} />
          <Button
            title="Get Connection State"
            onPress={testGetConnectionState}
          />
          <View style={styles.buttonSpacer} />
          <Button
            title="List Configurations"
            onPress={testListConfigurations}
          />
        </View>

        <View style={styles.group}>
          <Text style={styles.groupHeader}>Event Log</Text>
          <ScrollView style={styles.logContainer} nestedScrollEnabled>
            {eventLogs.map((log, index) => (
              <Text key={index} style={styles.logText}>
                {log}
              </Text>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  content: {
    flex: 1,
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
  buttonSpacer: {
    height: 10,
  },
  logContainer: {
    maxHeight: 200,
    backgroundColor: "#000",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  logText: {
    fontSize: 12,
    fontFamily: "monospace",
    color: "#00ff00",
    marginVertical: 1,
  },
});
