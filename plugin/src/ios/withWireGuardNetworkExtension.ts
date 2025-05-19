// filepath: /Users/adamnoren/hemla/expo-wireguard/plugin/src/ios/withWireGuardNetworkExtension.ts
import { ConfigPlugin, withXcodeProject, XcodeProject } from 'expo/config-plugins';

// Define the interface locally to avoid import path issues
interface WireGuardPluginProps {
  /**
   * Optional: Development team ID for iOS code signing
   * If not provided, the plugin will try to inherit from the main target
   */
  developmentTeam?: string;
}

const NSE_TARGET_NAME = 'WireGuardNetworkExtension';

/**
 * Configure the WireGuardNetworkExtension target with proper signing settings
 */
const withWireGuardNetworkExtension: ConfigPlugin<WireGuardPluginProps | undefined> = (config, props = {}) => {
  return withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;

    try {
      console.log("Setting up WireGuard Network Extension signing...");

      // Find all targets in the project
      const targets = xcodeProject.getFirstProject().firstProject.targets;

      // Find the WireGuardNetworkExtension target
      const extensionTarget = targets.find((target: any) =>
        target.comment && target.comment.includes(NSE_TARGET_NAME)
      );

      if (!extensionTarget) {
        console.log("WireGuardNetworkExtension target not found. This could be normal if the target hasn't been created yet.");
        return config;
      }

      const extensionTargetUuid = extensionTarget.value;
      console.log(`Found WireGuardNetworkExtension target with UUID: ${extensionTargetUuid}`);

      // Find the main app target to get its development team if needed
      let developmentTeam = props?.developmentTeam;
      const mainTarget = findMainTarget(xcodeProject);

      if (!developmentTeam && mainTarget) {
        // Try to inherit development team from main target
        developmentTeam = getTargetDevelopmentTeam(xcodeProject, mainTarget.uuid);

        if (developmentTeam) {
          console.log(`Inheriting development team ID ${developmentTeam} from main target`);
        } else {
          console.warn("No development team found in main target");
        }
      }

      // Apply development team to the network extension target
      if (developmentTeam) {
        applyDevelopmentTeam(xcodeProject, extensionTargetUuid, developmentTeam);
        console.log(`Applied development team ${developmentTeam} to WireGuardNetworkExtension target`);
      } else {
        console.warn("No development team ID available to apply. User will need to set one manually.");
      }

    } catch (error) {
      console.warn("Error configuring WireGuard Network Extension signing:", error);
    }

    return config;
  });
};

/**
 * Find the main application target (excluding test targets, extensions, etc.)
 */
function findMainTarget(xcodeProject: XcodeProject): { uuid: string, name: string } | null {
  try {
    const targets = xcodeProject.getFirstProject().firstProject.targets;

    const mainTarget = targets.find((target: any) =>
      target.comment &&
      !target.comment.includes(NSE_TARGET_NAME) &&
      !target.comment.includes('Tests') &&
      !target.comment.includes('Watch')
    );

    return mainTarget ? { uuid: mainTarget.value, name: mainTarget.comment } : null;
  } catch (error) {
    console.warn("Error finding main target:", error);
    return null;
  }
}

/**
 * Get the development team ID from a target
 */
function getTargetDevelopmentTeam(xcodeProject: XcodeProject, targetUuid: string): string | undefined {
  try {
    const pbxProjectSection = xcodeProject.pbxProjectSection();
    const pbxProjectKey = Object.keys(pbxProjectSection).find(key => !key.includes('_comment'));

    if (!pbxProjectKey) return undefined;

    const pbxProject = pbxProjectSection[pbxProjectKey];

    if (
      pbxProject.attributes?.TargetAttributes &&
      pbxProject.attributes.TargetAttributes[targetUuid] &&
      pbxProject.attributes.TargetAttributes[targetUuid].DevelopmentTeam
    ) {
      return pbxProject.attributes.TargetAttributes[targetUuid].DevelopmentTeam;
    }

    return undefined;
  } catch (error) {
    console.warn(`Error getting development team for target ${targetUuid}:`, error);
    return undefined;
  }
}

/**
 * Apply a development team ID to a target in both TargetAttributes and build settings
 */
function applyDevelopmentTeam(xcodeProject: XcodeProject, targetUuid: string, developmentTeam: string): void {
  try {
    // 1. Update TargetAttributes
    const pbxProjectSection = xcodeProject.pbxProjectSection();
    const pbxProjectKey = Object.keys(pbxProjectSection).find(key => !key.includes('_comment'));

    if (pbxProjectKey) {
      const pbxProject = pbxProjectSection[pbxProjectKey];

      // Ensure target attributes exist
      pbxProject.attributes = pbxProject.attributes || {};
      pbxProject.attributes.TargetAttributes = pbxProject.attributes.TargetAttributes || {};
      pbxProject.attributes.TargetAttributes[targetUuid] = pbxProject.attributes.TargetAttributes[targetUuid] || {};

      // Set the development team
      pbxProject.attributes.TargetAttributes[targetUuid].DevelopmentTeam = developmentTeam;
      console.log(`Set DevelopmentTeam in TargetAttributes for ${targetUuid}`);
    }

    // 2. Update build configuration settings
    const target = xcodeProject.pbxNativeTargetSection()[targetUuid];
    if (!target?.buildConfigurationList) {
      console.warn(`Could not find build configuration list for target: ${targetUuid}`);
      return;
    }

    const configList = xcodeProject.pbxXCConfigurationList()[target.buildConfigurationList];
    if (!configList?.buildConfigurations) {
      console.warn(`Invalid build configuration list for target: ${targetUuid}`);
      return;
    }

    const buildConfigIds = configList.buildConfigurations.map((config: any) => config.value);
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();

    // Update each build configuration for this target
    buildConfigIds.forEach((configId: string) => {
      if (!configurations[configId]?.buildSettings) return;

      const buildSettings = configurations[configId].buildSettings;
      buildSettings.DEVELOPMENT_TEAM = developmentTeam;
      console.log(`Set DEVELOPMENT_TEAM build setting to ${developmentTeam} for config ${configId}`);
    });
  } catch (error) {
    console.warn(`Error applying development team to target: ${error}`);
  }
}

export default withWireGuardNetworkExtension;