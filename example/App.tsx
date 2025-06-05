import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Button,
  TextInput,
  ScrollView,
  Platform,
  DeviceEventEmitter,
} from "react-native";
import WireGuard from "expo-wireguard";

export default function App() {
  const [version, setVersion] = useState<string>("");
  const [status, setStatus] = useState<boolean>(false);
  const [config, setConfig] = useState<string>(`[Interface]
Address = 192.168.6.152/32
DNS = 1.1.1.1,8.8.8.8
PrivateKey = 2Lq1UQAhQ7TL928AW52qkHFNzufNL/SJ4XSCfJz1DW8=
[Peer]
PublicKey = /UfEhhMgTeIPWu96ODEMU9oO4/7UKA6G8b5b33vKLH4=
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = premiusa1.vpnjantit.com:1024`);
  const [sessionName, setSessionName] = useState<string>("Example VPN Session");
  const [events, setEvents] = useState<string[]>([]);

  // Get the WireGuard version on component mount
  useEffect(() => {
    console.log("📱 [App] Getting WireGuard version...");
    WireGuard.Version()
      .then((v) => {
        console.log("📱 [App] Version received:", v);
        setVersion(v);
        addEventLog(`Version: ${v}`);
      })
      .catch((error) => {
        console.log("📱 [App] Version error:", error);
        addEventLog(`Error getting version: ${error.message}`);
      });

    // Check the initial connection status
    console.log("📱 [App] Checking initial status...");
    checkStatus();

    // Set up event listeners
    const systemEventListener = DeviceEventEmitter.addListener(
      WireGuard.EV_TYPE_SYSTEM,
      (event) => {
        console.log("📱 [App] System event:", event);
        if (event === WireGuard.EV_STARTED_BY_SYSTEM) {
          addEventLog("VPN service started by system, connecting...");
          // You might want to automatically connect here
        }
      }
    );

    const exceptionEventListener = DeviceEventEmitter.addListener(
      WireGuard.EV_TYPE_EXCEPTION,
      (error) => {
        console.log("📱 [App] Exception event:", error);
        addEventLog(`Error: ${error.message || error}`);
      }
    );

    const regularEventListener = DeviceEventEmitter.addListener(
      WireGuard.EV_TYPE_REGULAR,
      (event) => {
        console.log("📱 [App] Regular event:", event);
        if (event.event === WireGuard.EV_STARTED) {
          addEventLog("VPN Connected");
          setStatus(true);
        } else if (event.event === WireGuard.EV_STOPPED) {
          addEventLog("VPN Disconnected");
          setStatus(false);
        }
      }
    );

    // Clean up event listeners on unmount
    return () => {
      systemEventListener.remove();
      exceptionEventListener.remove();
      regularEventListener.remove();
    };
  }, []);

  // Check VPN connection status
  const checkStatus = async () => {
    try {
      console.log("📱 [App] Calling Status()...");
      const isConnected = await WireGuard.Status();
      console.log("📱 [App] Status result:", isConnected);
      setStatus(isConnected);
      addEventLog(
        `Connection status: ${isConnected ? "Connected" : "Disconnected"}`
      );
    } catch (error) {
      console.log("📱 [App] Status error:", error);
      addEventLog(
        `Error checking status: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  // Connect to WireGuard VPN
  const connectVPN = async () => {
    try {
      console.log("📱 [App] Starting connection...", {
        sessionName,
        configLength: config.length,
      });
      addEventLog("Connecting to VPN...");

      // Create notification config for Android
      const notif =
        Platform.OS === "android"
          ? {
              icon: "ic_notification",
              title: "WireGuard VPN",
              text: `Connected to ${sessionName}`,
            }
          : undefined;

      console.log("📱 [App] Calling Connect()...");
      await WireGuard.Connect(config, sessionName, notif);
      console.log("📱 [App] Connect() completed successfully");
      addEventLog("Connect command sent, waiting for status update...");
    } catch (error) {
      console.log("📱 [App] Connect error:", error);
      addEventLog(
        `Error connecting: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  // Disconnect from WireGuard VPN
  const disconnectVPN = async () => {
    try {
      console.log("📱 [App] Starting disconnection...");
      addEventLog("Disconnecting from VPN...");
      await WireGuard.Disconnect();
      console.log("📱 [App] Disconnect() completed successfully");
      addEventLog("Disconnect command sent, waiting for status update...");
    } catch (error) {
      console.log("📱 [App] Disconnect error:", error);
      addEventLog(
        `Error disconnecting: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  // Test network connectivity to verify VPN is working
  const testConnectivity = async () => {
    try {
      addEventLog("🔗 Testing network connectivity...");
      console.log("📱 [App] Testing network connectivity...");

      // Test multiple endpoints to verify VPN routing
      const testUrls = [
        "https://api.ipify.org?format=json", // Gets current IP
        "https://httpbin.org/ip", // Alternative IP checker
      ];

      for (const url of testUrls) {
        try {
          console.log(`📱 [App] Testing: ${url}`);
          const response = await fetch(url, { method: "GET" });

          if (response.ok) {
            const data = await response.text();
            console.log(`📱 [App] Response from ${url}:`, data);
            addEventLog(`✅ ${url}: ${data.substring(0, 100)}`);
          } else {
            console.log(`📱 [App] HTTP ${response.status} from ${url}`);
            addEventLog(`❌ ${url}: HTTP ${response.status}`);
          }
        } catch (urlError) {
          console.log(`📱 [App] Error testing ${url}:`, urlError);
          addEventLog(
            `❌ ${url}: ${urlError instanceof Error ? urlError.message : String(urlError)}`
          );
        }
      }

      addEventLog("🔗 Network connectivity test completed");
    } catch (error) {
      console.log("📱 [App] Connectivity test error:", error);
      addEventLog(
        `❌ Connectivity test failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  // Helper to add events to the log
  const addEventLog = (message: string) => {
    setEvents((prevEvents) => {
      const timestamp = new Date().toLocaleTimeString();
      return [`[${timestamp}] ${message}`, ...prevEvents.slice(0, 99)];
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Expo WireGuard Example</Text>
      <Text style={styles.version}>
        WireGuard Version: {version || "Loading..."}
      </Text>

      <View style={styles.statusContainer}>
        <Text>Status: </Text>
        <Text style={status ? styles.connected : styles.disconnected}>
          {status ? "Connected" : "Disconnected"}
        </Text>
        <Button title="Check" onPress={checkStatus} />
      </View>

      <Text style={styles.label}>Session Name:</Text>
      <TextInput
        style={styles.input}
        value={sessionName}
        onChangeText={setSessionName}
        placeholder="Enter a session name"
      />

      <Text style={styles.label}>WireGuard Config:</Text>
      <TextInput
        style={styles.configInput}
        value={config}
        onChangeText={setConfig}
        placeholder="Enter WireGuard configuration"
        multiline={true}
        numberOfLines={10}
      />

      <View style={styles.buttonContainer}>
        <Button
          title="Connect"
          onPress={connectVPN}
          disabled={status}
          color="#4CAF50"
        />
        <View style={styles.buttonSpacer} />
        <Button
          title="Disconnect"
          onPress={disconnectVPN}
          disabled={!status}
          color="#F44336"
        />
      </View>

      <Button
        title="Test Connectivity"
        onPress={testConnectivity}
        disabled={!status}
        color="#2196F3"
      />

      <Text style={styles.label}>Event Log:</Text>
      <ScrollView style={styles.logContainer}>
        {events.map((event, index) => (
          <Text key={index} style={styles.logEntry}>
            {event}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    paddingTop: 60,
    backgroundColor: "#f5f5f5",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
  },
  version: {
    fontSize: 14,
    marginBottom: 20,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  connected: {
    color: "#4CAF50",
    fontWeight: "bold",
    flex: 1,
  },
  disconnected: {
    color: "#F44336",
    fontWeight: "bold",
    flex: 1,
  },
  label: {
    fontSize: 16,
    marginVertical: 5,
    fontWeight: "500",
  },
  input: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 5,
    padding: 10,
    marginBottom: 15,
  },
  configInput: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 5,
    padding: 10,
    marginBottom: 15,
    height: 150,
    textAlignVertical: "top",
  },
  buttonContainer: {
    flexDirection: "row",
    marginBottom: 20,
  },
  buttonSpacer: {
    width: 20,
  },
  logContainer: {
    flex: 1,
    backgroundColor: "#333",
    borderRadius: 5,
    padding: 10,
    marginTop: 5,
  },
  logEntry: {
    color: "#fff",
    fontSize: 12,
    marginBottom: 3,
  },
});
