import {
  ConfigPlugin,
  withXcodeProject,
  withEntitlementsPlist,
  withInfoPlist,
  XcodeProject,
} from "expo/config-plugins";
import * as fs from "fs";
import * as path from "path";

// Interface for the plugin configuration
export interface WireGuardPluginProps {
  /**
   * Optional: Development team ID for iOS code signing
   * If not provided, the plugin will try to inherit from the main target
   */
  developmentTeam?: string;
}

const NSE_TARGET_NAME = "WireGuardNetworkExtension";

const withWireGuardNetworkExtension: ConfigPlugin<
  WireGuardPluginProps | undefined
> = (config, props = {}) => {
  // Step 1: Add the Network Extension entitlements
  config = withEntitlementsPlist(config, (config) => {
    const bundleId = config.ios?.bundleIdentifier || "com.example.app";
    config.modResults["com.apple.developer.networking.networkextension"] = [
      "packet-tunnel-provider",
    ];
    config.modResults["com.apple.security.application-groups"] = [
      `group.${bundleId}`,
    ];
    return config;
  });

  // Step 1.5: Add VPN usage description to main app Info.plist
  config = withInfoPlist(config, (config) => {
    config.modResults.NEVPNUsageDescription =
      "This app uses VPN to provide secure network connectivity through WireGuard.";
    return config;
  });

  // Step 2: Copy the wg-go.xcframework to the iOS project
  config = withXcodeProject(config, (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const iosProjectRoot = config.modRequest.platformProjectRoot;

    // Copy the wg-go.xcframework to the iOS project
    copyWgGoFramework(projectRoot, iosProjectRoot);

    return config;
  });

  // Step 3: All Xcode project modifications in a single operation
  config = withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const projectRoot = config.modRequest.projectRoot;
    const bundleId = config.ios?.bundleIdentifier || "com.example.app";

    try {
      console.log(
        "WireGuard plugin: Setting up WireGuard targets and capabilities"
      );

      // Get main target and configure it
      const mainTarget = getMainTarget(xcodeProject);
      if (mainTarget) {
        console.log(
          `Found main target: ${mainTarget.name} (${mainTarget.uuid})`
        );
        ensureFrameworksBuildPhase(xcodeProject, mainTarget.uuid);
        addFrameworkDirectly(
          xcodeProject,
          mainTarget.uuid,
          "System/Library/Frameworks/NetworkExtension.framework",
          true
        );
        addNetworkExtensionCapability(xcodeProject, mainTarget.uuid);

        // Get development team ID from main target if not provided in props
        const mainTargetTeamId = getTargetDevelopmentTeam(
          xcodeProject,
          mainTarget.uuid
        );
        const developmentTeam = props?.developmentTeam || mainTargetTeamId;

        // Log which team ID we're using
        if (props?.developmentTeam) {
          console.log(`Using provided development team ID: ${developmentTeam}`);
        } else if (mainTargetTeamId) {
          console.log(
            `Inheriting development team ID from main target: ${developmentTeam}`
          );
        } else {
          console.warn(
            "No development team ID found. User will need to set this manually."
          );
        }
      } else {
        console.warn("Could not find main app target");
        return config;
      }

      // Add the network extension target
      console.log("Adding WireGuardNetworkExtension target");
      createNetworkExtensionFiles(projectRoot, bundleId);

      // Check if the WireGuardNetworkExtension target already exists
      const targets = xcodeProject.getFirstProject().firstProject.targets;
      const existingWireGuardTarget = targets.find(
        (target: any) => target.comment && target.comment === NSE_TARGET_NAME
      );

      let wireGuardTarget;
      if (existingWireGuardTarget) {
        console.log(
          `Found existing ${NSE_TARGET_NAME} target: ${existingWireGuardTarget.value}`
        );
        wireGuardTarget = { uuid: existingWireGuardTarget.value };
      } else {
        console.log(`Creating new ${NSE_TARGET_NAME} target`);
        wireGuardTarget = xcodeProject.addTarget(
          NSE_TARGET_NAME,
          "app_extension",
          "com.apple.networkextension.packet-tunnel",
          `${bundleId}.${NSE_TARGET_NAME}`
        );
      }

      // Configure target properties
      const entitlementsPath = `WireGuardNetworkExtension/${NSE_TARGET_NAME}.entitlements`;
      const targetProps = {
        ENABLE_BITCODE: "NO",
        CODE_SIGN_ENTITLEMENTS: entitlementsPath,
        INFOPLIST_FILE: "WireGuardNetworkExtension/Info.plist",
        CODE_SIGN_IDENTITY: "iPhone Developer",
        CODE_SIGNING_REQUIRED: "YES",
        SWIFT_VERSION: "5.0",
        FRAMEWORK_SEARCH_PATHS: ["$(inherited)", "$(PROJECT_DIR)/Frameworks"],
        HEADER_SEARCH_PATHS: [
          "$(inherited)",
          "$(PROJECT_DIR)/Frameworks/wg-go.xcframework/ios-arm64/Headers",
          "$(PROJECT_DIR)/Frameworks/wg-go.xcframework/ios-arm64-simulator/Headers",
        ],
      };

      Object.entries(targetProps).forEach(([key, value]) => {
        xcodeProject.addBuildProperty(key, value, wireGuardTarget.uuid);
      });

      // Add framework and capability
      addNetworkExtensionFramework(xcodeProject, wireGuardTarget.uuid);
      addNetworkExtensionCapability(
        xcodeProject,
        wireGuardTarget.uuid,
        props?.developmentTeam
      );

      // Link wg-go.xcframework with the network extension target
      console.log(`Adding wg-go.xcframework to ${NSE_TARGET_NAME} target`);
      addWgGoFrameworkToTarget(xcodeProject, wireGuardTarget.uuid);

      // Configure bridging headers and search paths for both targets
      configureBridgingHeaders(
        xcodeProject,
        mainTarget.uuid,
        wireGuardTarget.uuid
      );

      // Add PacketTunnelProvider.swift to the Sources build phase
      console.log(
        `Adding PacketTunnelProvider.swift to ${NSE_TARGET_NAME} target sources`
      );
      addSourceFileToTarget(
        xcodeProject,
        wireGuardTarget.uuid,
        "WireGuardNetworkExtension/PacketTunnelProvider.swift"
      );

      console.log("Successfully added WireGuardNetworkExtension target");

      // 3. Add the WireGuardNetworkExtension as a dependency to the main app target
      console.log(
        `Adding dependency from ${mainTarget.name} to ${NSE_TARGET_NAME}`
      );

      // Check if dependency already exists
      if (
        !hasTargetDependency(
          xcodeProject,
          mainTarget.uuid,
          wireGuardTarget.uuid
        )
      ) {
        addTargetDependencyByUuid(
          xcodeProject,
          mainTarget.uuid,
          wireGuardTarget.uuid,
          NSE_TARGET_NAME
        );
        console.log(
          `Successfully added ${NSE_TARGET_NAME} as a dependency to main target`
        );
      } else {
        console.log(
          `Dependency from ${mainTarget.name} to ${NSE_TARGET_NAME} already exists`
        );
      }
    } catch (error) {
      console.warn("Error configuring WireGuard targets:", error);
    }

    return config;
  });

  return config;
};

/**
 * Get the development team ID from a target
 * Returns undefined if no team ID is set
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
 * Check if a target dependency already exists
 */
function hasTargetDependency(
  xcodeProject: XcodeProject,
  targetUuid: string,
  dependencyTargetUuid: string
): boolean {
  try {
    const nativeTargets = xcodeProject.pbxNativeTargetSection();
    const target = nativeTargets[targetUuid];

    if (!target?.dependencies) return false;

    // Check if any of the existing dependencies point to the dependency target
    for (const dependency of target.dependencies) {
      const targetDependency =
        xcodeProject.hash.project.objects.PBXTargetDependency[dependency.value];
      if (
        targetDependency &&
        targetDependency.target === dependencyTargetUuid
      ) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.warn(`Error checking target dependency: ${error}`);
    return false;
  }
}

/**
 * Add a dependency between targets using UUIDs
 */
function addTargetDependencyByUuid(
  xcodeProject: XcodeProject,
  targetUuid: string,
  dependencyTargetUuid: string,
  dependencyTargetName: string
): void {
  try {
    console.log(
      `Adding dependency from ${targetUuid} to ${dependencyTargetUuid}`
    );

    // Create a container item proxy for the dependency target
    const containerItemProxyUuid = xcodeProject.generateUuid();
    const containerItemProxyComment = `PBXContainerItemProxy ${dependencyTargetName}`;

    xcodeProject.hash.project.objects.PBXContainerItemProxy =
      xcodeProject.hash.project.objects.PBXContainerItemProxy || {};
    xcodeProject.hash.project.objects.PBXContainerItemProxy[
      containerItemProxyUuid
    ] = {
      isa: "PBXContainerItemProxy",
      containerPortal: xcodeProject.hash.project.rootObject,
      proxyType: 1,
      remoteGlobalIDString: dependencyTargetUuid,
      remoteInfo: dependencyTargetName,
    };
    xcodeProject.hash.project.objects.PBXContainerItemProxy[
      `${containerItemProxyUuid}_comment`
    ] = containerItemProxyComment;

    // Create a target dependency using the container proxy
    const targetDependencyUuid = xcodeProject.generateUuid();
    const targetDependencyComment = dependencyTargetName;

    xcodeProject.hash.project.objects.PBXTargetDependency =
      xcodeProject.hash.project.objects.PBXTargetDependency || {};
    xcodeProject.hash.project.objects.PBXTargetDependency[
      targetDependencyUuid
    ] = {
      isa: "PBXTargetDependency",
      target: dependencyTargetUuid,
      targetProxy: containerItemProxyUuid,
    };
    xcodeProject.hash.project.objects.PBXTargetDependency[
      `${targetDependencyUuid}_comment`
    ] = targetDependencyComment;

    // Add the target dependency to the dependent target
    const nativeTargets = xcodeProject.pbxNativeTargetSection();
    const target = nativeTargets[targetUuid];

    if (!target) {
      console.warn(`Target ${targetUuid} not found`);
      return;
    }

    target.dependencies = target.dependencies || [];
    target.dependencies.push({
      value: targetDependencyUuid,
      comment: targetDependencyComment,
    });

    console.log(
      `Successfully added dependency on ${dependencyTargetUuid} to target ${targetUuid}`
    );
  } catch (error) {
    console.warn(`Error adding target dependency: ${error}`);
  }
}

/**
 * Add a dependency between targets by finding the dependency target UUID
 */
function addTargetDependency(
  xcodeProject: XcodeProject,
  targetUuid: string,
  dependencyTargetName: string
): void {
  try {
    console.log(
      `Adding dependency on ${dependencyTargetName} to target ${targetUuid}`
    );

    // Find the target UUID for the dependency target by name
    const targets = xcodeProject.getFirstProject().firstProject.targets;
    const dependencyTarget = targets.find(
      (target: any) => target.comment && target.comment === dependencyTargetName
    );

    if (!dependencyTarget) {
      console.warn(`Dependency target ${dependencyTargetName} not found`);
      return;
    }

    const dependencyTargetUuid = dependencyTarget.value;
    addTargetDependencyByUuid(
      xcodeProject,
      targetUuid,
      dependencyTargetUuid,
      dependencyTargetName
    );
  } catch (error) {
    console.warn(`Error adding target dependency: ${error}`);
  }
}

/**
 * Add NetworkExtension.framework to a target with proper configuration
 */
function addNetworkExtensionFramework(
  xcodeProject: XcodeProject,
  targetUuid: string
): void {
  try {
    console.log(`Adding NetworkExtension.framework to target: ${targetUuid}`);
    ensureFrameworksBuildPhase(xcodeProject, targetUuid);
    const isWeak = !isTargetExtension(xcodeProject, targetUuid);
    addFrameworkDirectly(
      xcodeProject,
      targetUuid,
      "System/Library/Frameworks/NetworkExtension.framework",
      isWeak
    );
  } catch (error) {
    console.warn(`Failed to add NetworkExtension.framework: ${error}`);
  }
}

/**
 * Ensure the Frameworks build phase exists for a target
 */
function ensureFrameworksBuildPhase(
  xcodeProject: XcodeProject,
  targetUuid: string
): void {
  if (!hasFrameworksBuildPhase(xcodeProject, targetUuid)) {
    console.log(`Adding Frameworks build phase to target: ${targetUuid}`);
    xcodeProject.addBuildPhase(
      [],
      "PBXFrameworksBuildPhase",
      "Frameworks",
      targetUuid
    );
  }
}

/**
 * Add framework directly to a target
 */
function addFrameworkDirectly(
  xcodeProject: XcodeProject,
  targetUuid: string,
  frameworkPath: string,
  weak: boolean
): void {
  try {
    const frameworkName = path.basename(frameworkPath);

    if (hasFramework(xcodeProject, targetUuid, frameworkName)) {
      console.log(
        `Framework ${frameworkName} already exists for target ${targetUuid}`
      );
      return;
    }

    const buildPhaseUuid = getBuildPhaseUuid(
      xcodeProject,
      targetUuid,
      "PBXFrameworksBuildPhase"
    );
    if (!buildPhaseUuid) {
      throw new Error(
        `Could not find frameworks build phase for target: ${targetUuid}`
      );
    }

    // Create or get file reference
    let fileRef: string | undefined;
    const fileReferences = xcodeProject.hash.project.objects.PBXFileReference;

    // Look for existing file reference
    for (const ref in fileReferences) {
      if (ref.includes("_comment")) continue;
      const fileReference = fileReferences[ref];
      if (
        fileReference.path === frameworkPath ||
        fileReference.name === frameworkName
      ) {
        fileRef = ref;
        break;
      }
    }

    // Create new file reference if needed
    if (!fileRef) {
      fileRef = xcodeProject.generateUuid();
      xcodeProject.hash.project.objects.PBXFileReference[fileRef] = {
        isa: "PBXFileReference",
        lastKnownFileType: "wrapper.framework",
        name: frameworkName,
        path: frameworkPath,
        sourceTree: "SDKROOT",
      };
      xcodeProject.hash.project.objects.PBXFileReference[`${fileRef}_comment`] =
        frameworkName;
    }

    // Create build file
    const buildFileUuid = xcodeProject.generateUuid();
    const settings: any = weak ? { ATTRIBUTES: ["Weak"] } : {};

    xcodeProject.hash.project.objects.PBXBuildFile[buildFileUuid] = {
      isa: "PBXBuildFile",
      fileRef: fileRef,
      settings: settings,
    };
    xcodeProject.hash.project.objects.PBXBuildFile[`${buildFileUuid}_comment`] =
      `${frameworkName} in Frameworks`;

    // Add to build phase
    xcodeProject.hash.project.objects.PBXFrameworksBuildPhase[
      buildPhaseUuid
    ].files.push({
      value: buildFileUuid,
      comment: `${frameworkName} in Frameworks`,
    });

    console.log(`Successfully added ${frameworkName} to target ${targetUuid}`);
  } catch (error) {
    console.warn(`Failed to add framework directly: ${error}`);
  }
}

/**
 * Add WireGuardKit library to the target
 */
function addWireGuardKitToTarget(
  xcodeProject: XcodeProject,
  targetUuid: string
): void {
  try {
    console.log(`Adding WireGuardKit library to target: ${targetUuid}`);

    // Ensure the target has a Frameworks build phase
    ensureFrameworksBuildPhase(xcodeProject, targetUuid);

    // Create or get the file reference for WireGuardKit
    const frameworkName = "WireGuardKit.framework";

    // Check if it already exists in this target
    if (hasFramework(xcodeProject, targetUuid, frameworkName)) {
      console.log(`WireGuardKit already linked to target ${targetUuid}`);
      return;
    }

    // Find the build phase UUID for linking frameworks
    const buildPhaseUuid = getBuildPhaseUuid(
      xcodeProject,
      targetUuid,
      "PBXFrameworksBuildPhase"
    );
    if (!buildPhaseUuid) {
      throw new Error(
        `Could not find frameworks build phase for target: ${targetUuid}`
      );
    }

    // Create or get file reference
    let fileRef: string | undefined;
    const fileReferences = xcodeProject.hash.project.objects.PBXFileReference;

    // Look for existing file reference
    for (const ref in fileReferences) {
      if (ref.includes("_comment")) continue;
      const fileReference = fileReferences[ref];
      if (
        fileReference.name === frameworkName ||
        fileReference.path?.includes(frameworkName)
      ) {
        fileRef = ref;
        break;
      }
    }

    // Create new file reference if needed
    if (!fileRef) {
      fileRef = xcodeProject.generateUuid();
      xcodeProject.hash.project.objects.PBXFileReference[fileRef] = {
        isa: "PBXFileReference",
        lastKnownFileType: "wrapper.framework",
        name: frameworkName,
        path: frameworkName,
        sourceTree: "BUILT_PRODUCTS_DIR", // This refers to the framework built by Xcode
      };
      xcodeProject.hash.project.objects.PBXFileReference[`${fileRef}_comment`] =
        frameworkName;
    }

    // Create build file entry
    const buildFileUuid = xcodeProject.generateUuid();

    xcodeProject.hash.project.objects.PBXBuildFile[buildFileUuid] = {
      isa: "PBXBuildFile",
      fileRef: fileRef,
    };
    xcodeProject.hash.project.objects.PBXBuildFile[`${buildFileUuid}_comment`] =
      `${frameworkName} in Frameworks`;

    // Add to build phase
    xcodeProject.hash.project.objects.PBXFrameworksBuildPhase[
      buildPhaseUuid
    ].files.push({
      value: buildFileUuid,
      comment: `${frameworkName} in Frameworks`,
    });

    console.log(`Successfully added WireGuardKit to target ${targetUuid}`);
  } catch (error) {
    console.warn(`Failed to add WireGuardKit to target: ${error}`);
  }
}

/**
 * Add a source file to the target's Sources build phase
 */
function addSourceFileToTarget(
  xcodeProject: XcodeProject,
  targetUuid: string,
  sourceFilePath: string
): void {
  try {
    console.log(
      `Adding source file ${sourceFilePath} to target: ${targetUuid}`
    );

    // Ensure the target has a Sources build phase
    ensureSourcesBuildPhase(xcodeProject, targetUuid);

    // Check if the file is already added
    if (hasSourceFile(xcodeProject, targetUuid, sourceFilePath)) {
      console.log(
        `Source file ${sourceFilePath} already exists for target ${targetUuid}`
      );
      return;
    }

    // Find the build phase UUID for source files
    const buildPhaseUuid = getBuildPhaseUuid(
      xcodeProject,
      targetUuid,
      "PBXSourcesBuildPhase"
    );
    if (!buildPhaseUuid) {
      throw new Error(
        `Could not find sources build phase for target: ${targetUuid}`
      );
    }

    // Create or get file reference
    let fileRef: string | undefined;
    const fileReferences = xcodeProject.hash.project.objects.PBXFileReference;
    const fileName = path.basename(sourceFilePath);

    // Look for existing file reference
    for (const ref in fileReferences) {
      if (ref.includes("_comment")) continue;
      const fileReference = fileReferences[ref];
      if (
        fileReference.path === sourceFilePath ||
        fileReference.name === fileName
      ) {
        fileRef = ref;
        break;
      }
    }

    // Create new file reference if needed
    if (!fileRef) {
      fileRef = xcodeProject.generateUuid();
      xcodeProject.hash.project.objects.PBXFileReference[fileRef] = {
        isa: "PBXFileReference",
        lastKnownFileType: "sourcecode.swift",
        name: fileName,
        path: sourceFilePath,
        sourceTree: "SOURCE_ROOT",
      };
      xcodeProject.hash.project.objects.PBXFileReference[`${fileRef}_comment`] =
        fileName;
    }

    // Create build file entry
    const buildFileUuid = xcodeProject.generateUuid();

    xcodeProject.hash.project.objects.PBXBuildFile[buildFileUuid] = {
      isa: "PBXBuildFile",
      fileRef: fileRef,
    };
    xcodeProject.hash.project.objects.PBXBuildFile[`${buildFileUuid}_comment`] =
      `${fileName} in Sources`;

    // Add to build phase
    xcodeProject.hash.project.objects.PBXSourcesBuildPhase[
      buildPhaseUuid
    ].files.push({
      value: buildFileUuid,
      comment: `${fileName} in Sources`,
    });

    console.log(
      `Successfully added ${fileName} to target ${targetUuid} sources`
    );
  } catch (error) {
    console.warn(`Failed to add source file to target: ${error}`);
  }
}

/**
 * Ensure the Sources build phase exists for a target
 */
function ensureSourcesBuildPhase(
  xcodeProject: XcodeProject,
  targetUuid: string
): void {
  if (!hasSourcesBuildPhase(xcodeProject, targetUuid)) {
    console.log(`Adding Sources build phase to target: ${targetUuid}`);
    xcodeProject.addBuildPhase(
      [],
      "PBXSourcesBuildPhase",
      "Sources",
      targetUuid
    );
  }
}

/**
 * Check if a target has a Sources build phase
 */
function hasSourcesBuildPhase(
  xcodeProject: XcodeProject,
  targetUuid: string
): boolean {
  return (
    getBuildPhaseUuid(xcodeProject, targetUuid, "PBXSourcesBuildPhase") !== null
  );
}

/**
 * Check if a source file is already added to a target
 */
function hasSourceFile(
  xcodeProject: XcodeProject,
  targetUuid: string,
  sourceFilePath: string
): boolean {
  try {
    const buildPhaseUuid = getBuildPhaseUuid(
      xcodeProject,
      targetUuid,
      "PBXSourcesBuildPhase"
    );
    if (buildPhaseUuid) {
      const buildPhase =
        xcodeProject.hash.project.objects.PBXSourcesBuildPhase[buildPhaseUuid];
      if (buildPhase && buildPhase.files) {
        const fileName = path.basename(sourceFilePath);
        for (const fileRef of buildPhase.files) {
          const buildFile =
            xcodeProject.hash.project.objects.PBXBuildFile[fileRef.value];
          if (buildFile && buildFile.fileRef) {
            const pbxFileRef =
              xcodeProject.hash.project.objects.PBXFileReference[
                buildFile.fileRef
              ];
            if (
              pbxFileRef &&
              (pbxFileRef.name === fileName ||
                pbxFileRef.path === sourceFilePath)
            ) {
              return true;
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn(`Error checking for source file: ${error}`);
  }
  return false;
}

/**
 * Add wg-go.xcframework to the target
 */
function addWgGoFrameworkToTarget(
  xcodeProject: XcodeProject,
  targetUuid: string
): void {
  try {
    console.log(`Adding wg-go.xcframework to target: ${targetUuid}`);

    // Ensure the target has a Frameworks build phase
    ensureFrameworksBuildPhase(xcodeProject, targetUuid);

    // The framework name and path
    const frameworkName = "wg-go.xcframework";
    // Use path to the framework in the iOS project's Frameworks directory
    const frameworkPath = "Frameworks/wg-go.xcframework";

    // Check if it already exists in this target
    if (hasFramework(xcodeProject, targetUuid, frameworkName)) {
      console.log(`wg-go.xcframework already linked to target ${targetUuid}`);
      return;
    }

    // Find the build phase UUID for linking frameworks
    const buildPhaseUuid = getBuildPhaseUuid(
      xcodeProject,
      targetUuid,
      "PBXFrameworksBuildPhase"
    );
    if (!buildPhaseUuid) {
      throw new Error(
        `Could not find frameworks build phase for target: ${targetUuid}`
      );
    }

    // Create or get file reference
    let fileRef: string | undefined;
    const fileReferences = xcodeProject.hash.project.objects.PBXFileReference;

    // Look for existing file reference
    for (const ref in fileReferences) {
      if (ref.includes("_comment")) continue;
      const fileReference = fileReferences[ref];
      if (
        fileReference.name === frameworkName ||
        fileReference.path?.includes(frameworkName)
      ) {
        fileRef = ref;
        break;
      }
    }

    // Create new file reference if needed
    if (!fileRef) {
      fileRef = xcodeProject.generateUuid();
      xcodeProject.hash.project.objects.PBXFileReference[fileRef] = {
        isa: "PBXFileReference",
        lastKnownFileType: "wrapper.xcframework",
        name: frameworkName,
        path: frameworkPath,
        sourceTree: "SOURCE_ROOT", // Relative to the project root
      };
      xcodeProject.hash.project.objects.PBXFileReference[`${fileRef}_comment`] =
        frameworkName;
    }

    // Create build file entry
    const buildFileUuid = xcodeProject.generateUuid();

    xcodeProject.hash.project.objects.PBXBuildFile[buildFileUuid] = {
      isa: "PBXBuildFile",
      fileRef: fileRef,
    };
    xcodeProject.hash.project.objects.PBXBuildFile[`${buildFileUuid}_comment`] =
      `${frameworkName} in Frameworks`;

    // Add to build phase
    xcodeProject.hash.project.objects.PBXFrameworksBuildPhase[
      buildPhaseUuid
    ].files.push({
      value: buildFileUuid,
      comment: `${frameworkName} in Frameworks`,
    });

    console.log(`Successfully added wg-go.xcframework to target ${targetUuid}`);
  } catch (error) {
    console.warn(`Failed to add wg-go.xcframework to target: ${error}`);
  }
}

/**
 * Helper functions for target and framework management
 */
function hasFramework(
  xcodeProject: XcodeProject,
  targetUuid: string,
  frameworkName: string
): boolean {
  try {
    const buildPhaseUuid = getBuildPhaseUuid(
      xcodeProject,
      targetUuid,
      "PBXFrameworksBuildPhase"
    );
    if (buildPhaseUuid) {
      const buildPhase =
        xcodeProject.hash.project.objects.PBXFrameworksBuildPhase[
          buildPhaseUuid
        ];
      if (buildPhase && buildPhase.files) {
        for (const fileRef of buildPhase.files) {
          const buildFile =
            xcodeProject.hash.project.objects.PBXBuildFile[fileRef.value];
          if (buildFile && buildFile.fileRef) {
            const pbxFileRef =
              xcodeProject.hash.project.objects.PBXFileReference[
                buildFile.fileRef
              ];
            if (pbxFileRef && pbxFileRef.name === frameworkName) {
              return true;
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn(`Error checking for framework: ${error}`);
  }
  return false;
}

function getBuildPhaseUuid(
  xcodeProject: XcodeProject,
  targetUuid: string,
  buildPhaseType: string
): string | null {
  try {
    const target = xcodeProject.pbxNativeTargetSection()[targetUuid];
    if (target && target.buildPhases) {
      for (const phaseEntry of target.buildPhases) {
        const allBuildPhases =
          xcodeProject.hash.project.objects[buildPhaseType];
        if (allBuildPhases && allBuildPhases[phaseEntry.value]) {
          return phaseEntry.value;
        }
      }
    }
  } catch (error) {
    console.warn(`Error getting build phase UUID: ${error}`);
  }
  return null;
}

function hasFrameworksBuildPhase(
  xcodeProject: XcodeProject,
  targetUuid: string
): boolean {
  return (
    getBuildPhaseUuid(xcodeProject, targetUuid, "PBXFrameworksBuildPhase") !==
    null
  );
}

function isTargetExtension(
  xcodeProject: XcodeProject,
  targetUuid: string
): boolean {
  try {
    const target = xcodeProject.pbxNativeTargetSection()[targetUuid];
    return !!(
      target &&
      target.comment &&
      target.comment.includes(NSE_TARGET_NAME)
    );
  } catch (error) {
    console.warn(`Error determining if target is extension: ${error}`);
    return false;
  }
}

function getMainTarget(
  xcodeProject: XcodeProject
): { uuid: string; name: string } | null {
  try {
    const targets = xcodeProject.getFirstProject().firstProject.targets;
    const mainTarget = targets.find(
      (target: any) =>
        target.comment &&
        !target.comment.includes("WireGuardNetworkExtension") &&
        !target.comment.includes("Tests") &&
        !target.comment.includes("Watch")
    );

    return mainTarget
      ? { uuid: mainTarget.value, name: mainTarget.comment }
      : null;
  } catch (error) {
    console.warn("Error getting main target:", error);
    return null;
  }
}

function createNetworkExtensionFiles(
  projectPath: string,
  bundleId: string
): void {
  try {
    const iosDir = path.join(projectPath, "ios");
    const extensionDir = path.join(iosDir, "WireGuardNetworkExtension");
    const entitlementsPath = path.join(
      extensionDir,
      `${NSE_TARGET_NAME}.entitlements`
    );
    const infoPlistPath = path.join(extensionDir, "Info.plist");
    const packetTunnelProviderPath = path.join(
      extensionDir,
      "PacketTunnelProvider.swift"
    );

    // Create directory if needed
    if (!fs.existsSync(extensionDir)) {
      fs.mkdirSync(extensionDir, { recursive: true });
      console.log(`Created extension directory: ${extensionDir}`);
    }

    // Create files if needed
    if (!fs.existsSync(entitlementsPath)) {
      fs.writeFileSync(entitlementsPath, createEntitlementsContent(bundleId));
      console.log(`Created entitlements file at ${entitlementsPath}`);
    }

    if (!fs.existsSync(infoPlistPath)) {
      fs.writeFileSync(infoPlistPath, createInfoPlistContent(bundleId));
      console.log(`Created Info.plist at ${infoPlistPath}`);
    }

    // Copy files from the plugin template
    copyPluginFiles(projectPath, iosDir, extensionDir);
  } catch (error) {
    console.warn(`Error creating extension files: ${error}`);
  }
}

/**
 * Create template files content
 */
function createEntitlementsContent(bundleId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.developer.networking.networkextension</key>
    <array>
        <string>packet-tunnel-provider</string>
    </array>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>group.${bundleId}</string>
    </array>
</dict>
</plist>`;
}

function createInfoPlistContent(bundleId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>$(DEVELOPMENT_LANGUAGE)</string>
    <key>CFBundleDisplayName</key>
    <string>WireGuardNetworkExtension</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>${bundleId}.WireGuardNetworkExtension</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>$(PRODUCT_NAME)</string>
    <key>CFBundlePackageType</key>
    <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>NSExtension</key>
    <dict>
        <key>NSExtensionPointIdentifier</key>
        <string>com.apple.networkextension.packet-tunnel</string>
        <key>NSExtensionPrincipalClass</key>
        <string>$(PRODUCT_MODULE_NAME).PacketTunnelProvider</string>
    </dict>
</dict>
</plist>`;
}

function createPacketTunnelProviderContent(): string {
  return `import NetworkExtension
import os.log

class PacketTunnelProvider: NEPacketTunnelProvider {
    private var tunnelHandle: Int32 = -1
    private let tunnelQueue = DispatchQueue(label: "WireGuardTunnelQueue")
    
    override func startTunnel(options: [String : NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        wg_log(.info, message: "Starting WireGuard tunnel")
        
        guard let tunnelProviderProtocol = self.protocolConfiguration as? NETunnelProviderProtocol else {
            wg_log(.error, message: "Invalid protocol configuration")
            completionHandler(NSError(domain: "WireGuardNetworkExtension", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid protocol configuration"]))
            return
        }
        
        guard let configData = tunnelProviderProtocol.providerConfiguration?["config"] as? Data else {
            wg_log(.error, message: "No configuration found in provider configuration")
            wg_log(.info, message: "Available keys: \\(tunnelProviderProtocol.providerConfiguration?.keys.joined(separator: ", ") ?? "none")")
            completionHandler(NSError(domain: "WireGuardNetworkExtension", code: 2, userInfo: [NSLocalizedDescriptionKey: "No configuration found"]))
            return
        }
        
        guard let configString = String(data: configData, encoding: .utf8) else {
            wg_log(.error, message: "Invalid configuration format")
            completionHandler(NSError(domain: "WireGuardNetworkExtension", code: 3, userInfo: [NSLocalizedDescriptionKey: "Invalid configuration format"]))
            return
        }
        
        wg_log(.info, message: "WireGuard configuration loaded successfully")
        wg_log(.info, message: "Config preview: \\(String(configString.prefix(100)))")
        
        // For now, just call completion handler with nil to indicate successful startup
        // TODO: Implement actual WireGuard tunnel startup when wg-go integration is complete
        completionHandler(nil)
    }
    
    override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        wg_log(.info, message: "Stopping WireGuard tunnel")
        
        // For now, just call completion handler
        // TODO: Implement actual WireGuard tunnel shutdown when wg-go integration is complete
        completionHandler()
    }
    
    override func handleAppMessage(_ messageData: Data, completionHandler: ((Data?) -> Void)?) {
        // Handle app messages if needed
        completionHandler?(nil)
    }
    
    override func sleep(completionHandler: @escaping () -> Void) {
        // Put the tunnel to sleep
        completionHandler()
    }
    
    override func wake() {
        // Wake up the tunnel
    }
    
    private func wg_log(_ level: OSLogType, message: String) {
        os_log("%{public}s", log: OSLog(subsystem: "WireGuardNetworkExtension", category: "Tunnel"), type: level, message)
    }
}
`;
}

/**
 * Extension capability and supporting files management
 */
function addNetworkExtensionCapability(
  xcodeProject: XcodeProject,
  targetUuid: string,
  developmentTeam?: string
): void {
  try {
    const pbxProjectSection = xcodeProject.pbxProjectSection();
    const pbxProjectKey = Object.keys(pbxProjectSection).find(
      (key) => !key.includes("_comment")
    );
    if (!pbxProjectKey) {
      console.warn("Could not find project section");
      return;
    }

    const pbxProject = pbxProjectSection[pbxProjectKey];

    // Ensure target attributes exist
    pbxProject.attributes = pbxProject.attributes || {};
    pbxProject.attributes.TargetAttributes =
      pbxProject.attributes.TargetAttributes || {};
    pbxProject.attributes.TargetAttributes[targetUuid] =
      pbxProject.attributes.TargetAttributes[targetUuid] || {};

    const targetAttributes = pbxProject.attributes.TargetAttributes[targetUuid];
    targetAttributes.SystemCapabilities =
      targetAttributes.SystemCapabilities || {};

    // Add Network Extension capability
    targetAttributes.SystemCapabilities["com.apple.NetworkExtensions.iOS"] = {
      enabled: 1,
    };
    targetAttributes.SystemCapabilities["com.apple.NetworkExtension"] = {
      enabled: 1,
    };

    // Add Development Team if provided or try to inherit from main target
    if (developmentTeam) {
      targetAttributes.DevelopmentTeam = developmentTeam;
      console.log(
        `Set DevelopmentTeam to ${developmentTeam} for target ${targetUuid}`
      );
    } else if (!targetAttributes.DevelopmentTeam) {
      // Try to find team ID from main target
      const mainTarget = getMainTarget(xcodeProject);
      if (mainTarget) {
        const mainAttributes =
          pbxProject.attributes.TargetAttributes[mainTarget.uuid];
        if (mainAttributes && mainAttributes.DevelopmentTeam) {
          targetAttributes.DevelopmentTeam = mainAttributes.DevelopmentTeam;
          console.log(
            `Inherited DevelopmentTeam ${mainAttributes.DevelopmentTeam} from main target for target ${targetUuid}`
          );
        } else {
          console.log(
            "No DevelopmentTeam found to inherit. User will need to set this manually."
          );
        }
      }
    }

    // Update build settings
    enableNetworkExtensionBuildSettings(
      xcodeProject,
      targetUuid,
      developmentTeam || targetAttributes.DevelopmentTeam
    );

    console.log(
      `Successfully added NetworkExtension capability to target: ${targetUuid}`
    );
  } catch (error) {
    console.warn("Error adding NetworkExtension capability:", error);
  }
}

/**
 * Enable Network Extension build settings
 */
function enableNetworkExtensionBuildSettings(
  xcodeProject: XcodeProject,
  targetUuid: string,
  developmentTeam?: string
): void {
  try {
    // Get target's build configurations
    const nativeTargets = xcodeProject.pbxNativeTargetSection();
    const target = nativeTargets[targetUuid];
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
      const isExtension =
        buildSettings.PRODUCT_NAME &&
        typeof buildSettings.PRODUCT_NAME === "string" &&
        buildSettings.PRODUCT_NAME.includes(NSE_TARGET_NAME);

      if (isExtension) {
        // Extension target settings
        buildSettings.CODE_SIGN_ENTITLEMENTS = `WireGuardNetworkExtension/${NSE_TARGET_NAME}.entitlements`;
        buildSettings.INFOPLIST_FILE = "WireGuardNetworkExtension/Info.plist";
        buildSettings.ENABLE_BITCODE = "NO";
        buildSettings.SWIFT_VERSION = "5.0";

        // Set development team if provided
        if (developmentTeam) {
          buildSettings.DEVELOPMENT_TEAM = developmentTeam;
          console.log(
            `Set DEVELOPMENT_TEAM build setting to ${developmentTeam} for config ${configId}`
          );
        }
      }
    });
  } catch (error) {
    console.warn("Error updating build settings:", error);
  }
}

/**
 * Configure bridging headers and build settings for both main and extension targets
 */
function configureBridgingHeaders(
  xcodeProject: XcodeProject,
  mainTargetUuid: string,
  extensionTargetUuid: string
): void {
  try {
    console.log("Configuring bridging headers and build settings...");

    // Main target build settings (no bridging header needed since we use wg_go module)
    const mainTargetProps = {
      FRAMEWORK_SEARCH_PATHS: ["$(inherited)", "$(PROJECT_DIR)/Frameworks"],
    };

    Object.entries(mainTargetProps).forEach(([key, value]) => {
      xcodeProject.addBuildProperty(key, value, mainTargetUuid);
    });

    // NetworkExtension target bridging header
    const extensionBridgingHeader =
      "WireGuardNetworkExtension/WireGuardNetworkExtension-Bridging-Header.h";
    xcodeProject.addBuildProperty(
      "SWIFT_OBJC_BRIDGING_HEADER",
      extensionBridgingHeader,
      extensionTargetUuid
    );

    console.log("Successfully configured bridging headers and build settings");
  } catch (error) {
    console.warn(`Failed to configure bridging headers: ${error}`);
  }
}

export default withWireGuardNetworkExtension;

/**
 * Copy wg-go.xcframework from the plugin to the iOS project
 */
function copyWgGoFramework(projectRoot: string, iosProjectRoot: string): void {
  try {
    console.log("WireGuard plugin: Copying wg-go.xcframework to iOS project");

    // Find the plugin directory - look for node_modules/expo-wireguard
    const pluginPath = findPluginPath(projectRoot);
    if (!pluginPath) {
      throw new Error("Could not find expo-wireguard plugin directory");
    }

    const sourceFrameworkPath = path.join(
      pluginPath,
      "ios",
      "Frameworks",
      "wg-go.xcframework"
    );
    const targetFrameworksDir = path.join(iosProjectRoot, "Frameworks");
    const targetFrameworkPath = path.join(
      targetFrameworksDir,
      "wg-go.xcframework"
    );

    // Check if source framework exists
    if (!fs.existsSync(sourceFrameworkPath)) {
      throw new Error(`Source framework not found at: ${sourceFrameworkPath}`);
    }

    // Create Frameworks directory if it doesn't exist
    if (!fs.existsSync(targetFrameworksDir)) {
      console.log(`Creating Frameworks directory: ${targetFrameworksDir}`);
      fs.mkdirSync(targetFrameworksDir, { recursive: true });
    }

    // Remove existing framework if it exists
    if (fs.existsSync(targetFrameworkPath)) {
      console.log(`Removing existing framework: ${targetFrameworkPath}`);
      fs.rmSync(targetFrameworkPath, { recursive: true, force: true });
    }

    // Copy the framework
    console.log(
      `Copying framework from ${sourceFrameworkPath} to ${targetFrameworkPath}`
    );
    copyDirectory(sourceFrameworkPath, targetFrameworkPath);

    // Also copy the headers to the Pods directory so the module can access them
    copyFrameworkHeadersToPods(iosProjectRoot, sourceFrameworkPath);

    console.log("Successfully copied wg-go.xcframework to iOS project");
  } catch (error) {
    console.warn(`Failed to copy wg-go.xcframework: ${error}`);
    throw error;
  }
}

/**
 * Find the plugin path in node_modules
 */
function findPluginPath(projectRoot: string): string | null {
  // Try different possible paths for the plugin
  const possiblePaths = [
    // In node_modules
    path.join(projectRoot, "node_modules", "expo-wireguard"),
    // In local development with autolinking (example app case)
    path.join(projectRoot, ".."),
    // In local development (if using file: protocol)
    path.join(projectRoot, "..", "expo-wireguard"),
    // Relative to current directory (for local development)
    path.resolve(__dirname, "..", "..", ".."),
    // Relative to build directory
    path.resolve(__dirname, "..", "..", "..", ".."),
  ];

  for (const possiblePath of possiblePaths) {
    const frameworkPath = path.join(
      possiblePath,
      "ios",
      "Frameworks",
      "wg-go.xcframework"
    );
    if (fs.existsSync(frameworkPath)) {
      console.log(`Found plugin at: ${possiblePath}`);
      return possiblePath;
    }
  }

  console.warn(
    `Plugin not found in any of these paths: ${possiblePaths.join(", ")}`
  );
  return null;
}

/**
 * Recursively copy a directory
 */
function copyDirectory(source: string, target: string): void {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const items = fs.readdirSync(source);

  for (const item of items) {
    const sourcePath = path.join(source, item);
    const targetPath = path.join(target, item);

    const stat = fs.statSync(sourcePath);

    if (stat.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

/**
 * Copy framework headers to the Pods directory so the module bridging header can access them
 */
function copyFrameworkHeadersToPods(
  iosProjectRoot: string,
  sourceFrameworkPath: string
): void {
  try {
    const podsDir = path.join(iosProjectRoot, "Pods");
    if (!fs.existsSync(podsDir)) {
      console.log("Pods directory not found, skipping header copy to Pods");
      return;
    }

    // Create a headers directory in Pods for our framework
    const podsHeadersDir = path.join(
      podsDir,
      "Headers",
      "Public",
      "ExpoWireguard"
    );
    if (!fs.existsSync(podsHeadersDir)) {
      fs.mkdirSync(podsHeadersDir, { recursive: true });
    }

    // Find the iOS arm64 headers directory in the XCFramework
    const iosArm64HeadersDir = path.join(
      sourceFrameworkPath,
      "ios-arm64",
      "Headers"
    );
    if (fs.existsSync(iosArm64HeadersDir)) {
      const headerFiles = fs.readdirSync(iosArm64HeadersDir);
      for (const headerFile of headerFiles) {
        const sourceHeader = path.join(iosArm64HeadersDir, headerFile);
        const targetHeader = path.join(podsHeadersDir, headerFile);

        console.log(`Copying header ${headerFile} to Pods`);
        fs.copyFileSync(sourceHeader, targetHeader);
      }
      console.log("Successfully copied framework headers to Pods directory");
    } else {
      console.warn("Could not find ios-arm64 headers in framework");
    }
  } catch (error) {
    console.warn(`Failed to copy framework headers to Pods: ${error}`);
  }
}

/**
 * Copy necessary files from the plugin source to the iOS project
 */
function copyPluginFiles(
  projectPath: string,
  iosDir: string,
  extensionDir: string
): void {
  try {
    console.log("Copying plugin files to iOS project...");

    // Find the plugin path
    const pluginPath = findPluginPath(projectPath);
    if (!pluginPath) {
      throw new Error("Could not find expo-wireguard plugin directory");
    }

    const pluginIosDir = path.join(pluginPath, "ios");

    // Files to copy with their source and destination paths
    const filesToCopy = [
      // PacketTunnelProvider.swift
      {
        source: path.join(
          pluginIosDir,
          "WireGuardNetworkExtension",
          "PacketTunnelProvider.swift"
        ),
        destination: path.join(extensionDir, "PacketTunnelProvider.swift"),
        required: true,
      },
      // NetworkExtension bridging header
      {
        source: path.join(
          pluginIosDir,
          "WireGuardNetworkExtension",
          "WireGuardNetworkExtension-Bridging-Header.h"
        ),
        destination: path.join(
          extensionDir,
          "WireGuardNetworkExtension-Bridging-Header.h"
        ),
        required: true,
      },
    ];

    // Copy each file
    for (const file of filesToCopy) {
      try {
        if (!fs.existsSync(file.destination)) {
          if (fs.existsSync(file.source)) {
            fs.copyFileSync(file.source, file.destination);
            console.log(
              `Copied ${path.basename(file.source)} to ${file.destination}`
            );
          } else if (file.required) {
            console.warn(`Required source file not found: ${file.source}`);

            // Create fallback content for missing files
            if (file.source.includes("PacketTunnelProvider.swift")) {
              fs.writeFileSync(
                file.destination,
                createPacketTunnelProviderContent()
              );
              console.log(
                `Created fallback PacketTunnelProvider.swift at ${file.destination}`
              );
            } else if (file.source.includes("Bridging-Header.h")) {
              fs.writeFileSync(file.destination, '#import "wireguard.h"\n');
              console.log(
                `Created fallback bridging header at ${file.destination}`
              );
            }
          }
        } else {
          console.log(`File already exists, skipping: ${file.destination}`);
        }
      } catch (error) {
        console.warn(
          `Error copying ${file.source} to ${file.destination}: ${error}`
        );

        // Create fallback for required files
        if (file.required && !fs.existsSync(file.destination)) {
          try {
            if (file.source.includes("PacketTunnelProvider.swift")) {
              fs.writeFileSync(
                file.destination,
                createPacketTunnelProviderContent()
              );
              console.log(
                `Created fallback PacketTunnelProvider.swift at ${file.destination}`
              );
            } else if (file.source.includes("Bridging-Header.h")) {
              fs.writeFileSync(file.destination, '#import "wireguard.h"\n');
              console.log(
                `Created fallback bridging header at ${file.destination}`
              );
            }
          } catch (fallbackError) {
            console.warn(
              `Failed to create fallback for ${file.destination}: ${fallbackError}`
            );
          }
        }
      }
    }

    console.log("Successfully copied plugin files to iOS project");
  } catch (error) {
    console.warn(`Failed to copy plugin files: ${error}`);
  }
}
