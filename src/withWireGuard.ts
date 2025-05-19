import { ConfigPlugin, withPlugins } from 'expo/config-plugins';
import withWireGuardNetworkExtension from '../plugin/src/ios/withWireGuardNetworkExtension';

export interface WireGuardPluginProps {
  /**
   * Optional: Development team ID for iOS code signing
   * If not provided, the plugin will try to inherit from the main target
   */
  developmentTeam?: string;
}

/**
 * Configure the project to include WireGuard support
 */
const withWireGuard: ConfigPlugin<WireGuardPluginProps | undefined> = (config, props = {}) => {
  return withPlugins(config, [
    [withWireGuardNetworkExtension, props]
  ]);
};

export default withWireGuard;