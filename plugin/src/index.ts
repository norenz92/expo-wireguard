import {
  ConfigPlugin,
  withXcodeProject,
  withEntitlementsPlist,
  XcodeProject,
} from 'expo/config-plugins';

const withWireGuardNetworkExtension: ConfigPlugin = (config) => {
  // Add the Network Extension entitlements
  config = withEntitlementsPlist(config, (config) => {
    // Set network extension entitlement - proper array syntax for plist
    config.modResults['com.apple.developer.networking.networkextension'] = ['packet-tunnel-provider'];

    // Add app groups entitlement
    const bundleId = config.ios?.bundleIdentifier || 'com.example.app';
    config.modResults['com.apple.security.application-groups'] = [`group.${bundleId}`];

    return config;
  });

  // Add NetworkExtension.framework to the main app
  config = withXcodeProject(config, (config) => {
    console.log("WireGuard plugin: Adding Network Extension capability");

    try {
      const xcodeProject = config.modResults;

      // Find the main app target
      const mainTarget = getMainTarget(xcodeProject);
      if (mainTarget) {
        // Add the NetworkExtension framework to the main app target
        const frameworkPath = 'System/Library/Frameworks/NetworkExtension.framework';
        const fileOptions = {
          weak: true,
          target: mainTarget.uuid,
          link: true
        };

        try {
          if (hasFrameworksBuildPhase(xcodeProject, mainTarget.uuid)) {
            xcodeProject.addFramework(frameworkPath, fileOptions);
            console.log("Successfully added NetworkExtension.framework to the main app target");
          }
        } catch (error) {
          console.warn(`Failed to add NetworkExtension.framework: ${error}`);
        }
      }
    } catch (error) {
      console.warn("Error configuring WireGuard capability:", error);
    }

    return config;
  });

  return config;
};

/**
 * Get the main target from the Xcode project
 */
function getMainTarget(xcodeProject: XcodeProject): { uuid: string; name: string } | null {
  try {
    const targets = xcodeProject.getFirstProject().firstProject.targets;
    const mainTarget = targets.find((target: any) =>
      target.comment &&
      !target.comment.includes('WireGuardNetworkExtension') &&
      !target.comment.includes('Tests') &&
      !target.comment.includes('Watch')
    );

    if (mainTarget) {
      return {
        uuid: mainTarget.value,
        name: mainTarget.comment
      };
    }
  } catch (error) {
    console.warn("Error finding main target:", error);
  }

  return null;
}

/**
 * Check if the target has a frameworks build phase
 */
function hasFrameworksBuildPhase(xcodeProject: XcodeProject, targetUuid: string): boolean {
  try {
    // Get the target
    const pbxTargetSection = xcodeProject.pbxNativeTargetSection();
    const target = pbxTargetSection[targetUuid];

    if (target && target.buildPhases) {
      // Check each build phase to find PBXFrameworksBuildPhase
      for (const phaseEntry of target.buildPhases) {
        const phaseUuid = phaseEntry.value;
        const allBuildPhases = xcodeProject.hash.project.objects['PBXFrameworksBuildPhase'];

        if (allBuildPhases && allBuildPhases[phaseUuid]) {
          return true;
        }
      }
    }
  } catch (error) {
    console.warn("Error checking for frameworks build phase:", error);
  }

  return false;
}

export default withWireGuardNetworkExtension;
