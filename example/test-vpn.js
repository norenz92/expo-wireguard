// Test script to verify VPN configuration
// Run this in Metro's console to test VPN functionality

console.log("🔧 Testing VPN configuration...");

import ExpoWireguard from '../src/ExpoWireguardModule';

async function testVPNConfiguration() {
  try {
    console.log("1. Requesting VPN permission...");
    await ExpoWireguard.requestVPNPermission();
    console.log("✅ VPN permission granted!");

    console.log("2. Testing configuration addition...");
    const testConfig = {
      name: "Test Config",
      privateKey: "YFubTNMYiVVQa+PO+VJSmMZn8kCDcfaAR//Rn8A8iVE=",
      address: "10.0.0.1/32",
      dns: "1.1.1.1",
      peers: [{
        publicKey: "xTXPWO73JhKOq5Y9zFPtQpJqITn+ILF6R4YsM5UHgA4=",
        endpoint: "198.51.100.1:51820",
        allowedIPs: "0.0.0.0/0"
      }]
    };

    await ExpoWireguard.addConfiguration(testConfig);
    console.log("✅ Configuration added successfully!");

    console.log("3. Listing configurations...");
    const configs = await ExpoWireguard.listConfigurations();
    console.log("📋 Available configurations:", configs);

    console.log("🎉 All tests passed! Bundle ID fix worked!");

  } catch (error) {
    console.error("❌ Test failed:", error);
    console.error("Error details:", error.message);
  }
}

// Auto-run the test
testVPNConfiguration();
