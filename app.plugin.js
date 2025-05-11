// This file configures the entry file for your plugin.
const { createRunOncePlugin } = require('expo/config-plugins');
const withWireGuardNetworkExtension = require('./plugin/build').default;

// Create a plugin that runs once per build
const withWireGuard = createRunOncePlugin(
  (config) => withWireGuardNetworkExtension(config),
  'expo-wireguard',
  '0.1.0' // The version of this plugin
);

module.exports = withWireGuard;
