import { ConfigPlugin, createRunOncePlugin } from 'expo/config-plugins';
import withWireGuardNetworkExtension from '../plugin/build';

// This creates a plugin that runs the setup once per build
const withWireGuard: ConfigPlugin = createRunOncePlugin(
  // Forward the config to our plugin
  (config) => withWireGuardNetworkExtension(config),
  'expo-wireguard',
  '0.1.0' // The version of this plugin
);

export default withWireGuard;