// This file configures the entry file for your plugin.
const { createRunOncePlugin } = require('expo/config-plugins');
const withWireGuardNetworkExtension = require('./plugin/build').default;

// Create a plugin that runs once per build
const withWireGuard = createRunOncePlugin(
  (config, props = {}) => {
    // Add wireGuard config section for our plugin to use
    config.wireGuard = {
      ...(config.wireGuard || {}),
      ...props
    };

    // Pass the development team ID to the plugin if provided
    return withWireGuardNetworkExtension(config, {
      developmentTeam: props.developmentTeam
    });
  },
  'expo-wireguard',
  '0.1.0' // The version of this plugin
);

module.exports = withWireGuard;
