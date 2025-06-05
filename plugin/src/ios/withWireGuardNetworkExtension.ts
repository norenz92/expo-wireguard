// filepath: /Users/adamnoren/hemla/expo-wireguard/plugin/src/ios/withWireGuardNetworkExtension.ts
import {
  ConfigPlugin,
  withXcodeProject,
  XcodeProject,
} from "expo/config-plugins";

// Define the interface locally to avoid import path issues
interface WireGuardPluginProps {
  /**
   * Optional: Development team ID for iOS code signing
   * If not provided, the plugin will try to inherit from the main target
   */
  developmentTeam?: string;
}

const NSE_TARGET_NAME = "WireGuardNetworkExtension";

/**
 * Configure the WireGuardNetworkExtension target with proper signing settings
 */
const withWireGuardNetworkExtension: ConfigPlugin<
  WireGuardPluginProps | undefined
> = (config, props = {}) => {
  return withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;

    try {
      console.log("Setting up WireGuard Network Extension signing...");

      // Find all targets in the project
      const targets = xcodeProject.getFirstProject().firstProject.targets;

      // Find the WireGuardNetworkExtension target
      const extensionTarget = targets.find(
        (target: any) =>
          target.comment && target.comment.includes(NSE_TARGET_NAME)
      );

      if (!extensionTarget) {
        console.log(
          "WireGuardNetworkExtension target not found. This could be normal if the target hasn't been created yet."
        );
        return config;
      }

      const extensionTargetUuid = extensionTarget.value;
      console.log(
        `Found WireGuardNetworkExtension target with UUID: ${extensionTargetUuid}`
      );

      // Find the main app target to get its development team if needed
      let developmentTeam = props?.developmentTeam;
      const mainTarget = findMainTarget(xcodeProject);

      if (!developmentTeam && mainTarget) {
        // Try to inherit development team from main target
        developmentTeam = getTargetDevelopmentTeam(
          xcodeProject,
          mainTarget.uuid
        );

        if (developmentTeam) {
          console.log(
            `Inheriting development team ID ${developmentTeam} from main target`
          );
        } else {
          console.warn("No development team found in main target");
        }
      }

      // Apply development team to the network extension target
      if (developmentTeam) {
        applyDevelopmentTeam(
          xcodeProject,
          extensionTargetUuid,
          developmentTeam
        );
        console.log(
          `Applied development team ${developmentTeam} to WireGuardNetworkExtension target`
        );
      } else {
        console.warn(
          "No development team ID available to apply. User will need to set one manually."
        );
      }

      // Add wg-go.xcframework to the NetworkExtension target
      addWgGoFramework(xcodeProject, extensionTargetUuid);
      console.log(
        "Added wg-go.xcframework to WireGuardNetworkExtension target"
      );
    } catch (error) {
      console.warn(
        "Error configuring WireGuard Network Extension signing:",
        error
      );
    }

    return config;
  });
};

/**
 * Find the main application target (excluding test targets, extensions, etc.)
 */
function findMainTarget(
  xcodeProject: XcodeProject
): { uuid: string; name: string } | null {
  try {
    const targets = xcodeProject.getFirstProject().firstProject.targets;

    const mainTarget = targets.find(
      (target: any) =>
        target.comment &&
        !target.comment.includes(NSE_TARGET_NAME) &&
        !target.comment.includes("Tests") &&
        !target.comment.includes("Watch")
    );

    return mainTarget
      ? { uuid: mainTarget.value, name: mainTarget.comment }
      : null;
  } catch (error) {
    console.warn("Error finding main target:", error);
    return null;
  }
}

/**
 * Get the development team ID from a target
 */
function getTargetDevelopmentTeam(
  xcodeProject: XcodeProject,
  targetUuid: string
): string | undefined {
  try {
    const pbxProjectSection = xcodeProject.pbxProjectSection();
    const pbxProjectKey = Object.keys(pbxProjectSection).find(
      (key) => !key.includes("_comment")
    );

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
    console.warn(
      `Error getting development team for target ${targetUuid}:`,
      error
    );
    return undefined;
  }
}

/**
 * Apply a development team ID to a target in both TargetAttributes and build settings
 */
function applyDevelopmentTeam(
  xcodeProject: XcodeProject,
  targetUuid: string,
  developmentTeam: string
): void {
  try {
    // 1. Update TargetAttributes
    const pbxProjectSection = xcodeProject.pbxProjectSection();
    const pbxProjectKey = Object.keys(pbxProjectSection).find(
      (key) => !key.includes("_comment")
    );

    if (pbxProjectKey) {
      const pbxProject = pbxProjectSection[pbxProjectKey];

      // Ensure target attributes exist
      pbxProject.attributes = pbxProject.attributes || {};
      pbxProject.attributes.TargetAttributes =
        pbxProject.attributes.TargetAttributes || {};
      pbxProject.attributes.TargetAttributes[targetUuid] =
        pbxProject.attributes.TargetAttributes[targetUuid] || {};

      // Set the development team
      pbxProject.attributes.TargetAttributes[targetUuid].DevelopmentTeam =
        developmentTeam;
      console.log(`Set DevelopmentTeam in TargetAttributes for ${targetUuid}`);
    }

    // 2. Update build configuration settings
    const target = xcodeProject.pbxNativeTargetSection()[targetUuid];
    if (!target?.buildConfigurationList) {
      console.warn(
        `Could not find build configuration list for target: ${targetUuid}`
      );
      return;
    }

    const configList =
      xcodeProject.pbxXCConfigurationList()[target.buildConfigurationList];
    if (!configList?.buildConfigurations) {
      console.warn(
        `Invalid build configuration list for target: ${targetUuid}`
      );
      return;
    }

    const buildConfigIds = configList.buildConfigurations.map(
      (config: any) => config.value
    );
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();

    // Update each build configuration for this target
    buildConfigIds.forEach((configId: string) => {
      if (!configurations[configId]?.buildSettings) return;

      const buildSettings = configurations[configId].buildSettings;
      buildSettings.DEVELOPMENT_TEAM = developmentTeam;
      console.log(
        `Set DEVELOPMENT_TEAM build setting to ${developmentTeam} for config ${configId}`
      );
    });
  } catch (error) {
    console.warn(`Error applying development team to target: ${error}`);
  }
}

/**
 * Add wg-go.xcframework to a target
 */
function addWgGoFramework(
  xcodeProject: XcodeProject,
  targetUuid: string
): void {
  try {
    const frameworkPath = "wg-go.xcframework";

    // Check if the framework reference already exists
    const pbxFileRefSection = xcodeProject.pbxFileReferenceSection();
    let frameworkRef = Object.keys(pbxFileRefSection).find(
      (key) =>
        pbxFileRefSection[key].name === frameworkPath ||
        pbxFileRefSection[key].path === frameworkPath
    );

    if (!frameworkRef) {
      // Add framework file reference
      frameworkRef = xcodeProject.generateUuid();
      pbxFileRefSection[frameworkRef] = {
        isa: "PBXFileReference",
        lastKnownFileType: "wrapper.xcframework",
        name: frameworkPath,
        path: frameworkPath,
        sourceTree: "<group>",
      };
      pbxFileRefSection[`${frameworkRef}_comment`] = frameworkPath;
      console.log(`Added framework file reference: ${frameworkRef}`);
    } else {
      console.log(`Framework file reference already exists: ${frameworkRef}`);
    }

    // Add to build file (PBXBuildFile)
    const pbxBuildFileSection = xcodeProject.pbxBuildFileSection();
    let buildFileUuid = Object.keys(pbxBuildFileSection).find(
      (key) => pbxBuildFileSection[key].fileRef === frameworkRef
    );

    if (!buildFileUuid) {
      buildFileUuid = xcodeProject.generateUuid();
      pbxBuildFileSection[buildFileUuid] = {
        isa: "PBXBuildFile",
        fileRef: frameworkRef,
        settings: {
          ATTRIBUTES: ["CodeSignOnCopy", "RemoveHeadersOnCopy"],
        },
      };
      pbxBuildFileSection[`${buildFileUuid}_comment`] =
        `${frameworkPath} in Frameworks`;
      console.log(`Added build file: ${buildFileUuid}`);
    } else {
      console.log(`Build file already exists: ${buildFileUuid}`);
    }

    // Add to target's frameworks build phase
    const target = xcodeProject.pbxNativeTargetSection()[targetUuid];
    if (!target?.buildPhases) {
      console.warn(`Target ${targetUuid} has no build phases`);
      return;
    }

    // Find the frameworks build phase
    const pbxFrameworksBuildPhaseSection =
      xcodeProject.pbxFrameworksBuildPhaseSection();
    let frameworksBuildPhase = null;

    for (const phase of target.buildPhases) {
      const phaseUuid = phase.value;
      if (pbxFrameworksBuildPhaseSection[phaseUuid]) {
        frameworksBuildPhase = pbxFrameworksBuildPhaseSection[phaseUuid];
        break;
      }
    }

    if (!frameworksBuildPhase) {
      console.warn(`No frameworks build phase found for target ${targetUuid}`);
      return;
    }

    // Add build file to frameworks build phase if not already there
    if (
      !frameworksBuildPhase.files.some(
        (file: any) => file.value === buildFileUuid
      )
    ) {
      frameworksBuildPhase.files.push({
        value: buildFileUuid,
        comment: `${frameworkPath} in Frameworks`,
      });
      console.log(`Added framework to build phase`);
    } else {
      console.log(`Framework already in build phase`);
    }

    // Add framework search path
    const target_config = xcodeProject.pbxNativeTargetSection()[targetUuid];
    if (target_config?.buildConfigurationList) {
      const configList =
        xcodeProject.pbxXCConfigurationList()[
          target_config.buildConfigurationList
        ];
      if (configList?.buildConfigurations) {
        const buildConfigIds = configList.buildConfigurations.map(
          (config: any) => config.value
        );
        const configurations = xcodeProject.pbxXCBuildConfigurationSection();

        buildConfigIds.forEach((configId: string) => {
          const buildSettings = configurations[configId]?.buildSettings;
          if (!buildSettings) return;

          // Add framework search path
          buildSettings.FRAMEWORK_SEARCH_PATHS =
            buildSettings.FRAMEWORK_SEARCH_PATHS || "$(inherited)";
          const searchPaths = Array.isArray(
            buildSettings.FRAMEWORK_SEARCH_PATHS
          )
            ? buildSettings.FRAMEWORK_SEARCH_PATHS
            : [buildSettings.FRAMEWORK_SEARCH_PATHS];

          const newPath = '"$(SRCROOT)/../../../ios/Frameworks"';
          if (!searchPaths.includes(newPath)) {
            searchPaths.push(newPath);
            buildSettings.FRAMEWORK_SEARCH_PATHS = searchPaths;
            console.log(`Added framework search path to config ${configId}`);
          }
        });
      }
    }
  } catch (error) {
    console.warn(`Error adding wg-go framework to target: ${error}`);
  }
}

export default withWireGuardNetworkExtension;
