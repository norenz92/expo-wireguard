import { ConfigPlugin, withPlugins } from "expo/config-plugins";
import withWireGuardNetworkExtension from "./ios/withWireGuardNetworkExtension";

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
const withWireGuard: ConfigPlugin<WireGuardPluginProps | undefined> = (
  config,
  props = {}
) => {
  console.log("🔧 WireGuard plugin applied with props:", props);
  console.log("🔧 About to call withWireGuardNetworkExtension...");

  return withPlugins(config, [
    // Configure the Network Extension target (files are referenced directly from node_modules)
    [withWireGuardNetworkExtension, props],
  ]);
};

export default withWireGuard;
