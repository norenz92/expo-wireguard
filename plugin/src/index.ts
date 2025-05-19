import {
  ConfigPlugin,
  withXcodeProject,
  withEntitlementsPlist,
  XcodeProject,
} from 'expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

// Interface for the plugin configuration
export interface WireGuardPluginProps {
  /**
   * Optional: Development team ID for iOS code signing
   * If not provided, the plugin will try to inherit from the main target
   */
  developmentTeam?: string;
}

const NSE_TARGET_NAME = 'WireGuardNetworkExtension';
const WIREGUARD_GO_BRIDGE_TARGET = 'WireguardGoBridge';

const withWireGuardNetworkExtension: ConfigPlugin<WireGuardPluginProps | undefined> = (config, props = {}) => {
  // Step 1: Add the Network Extension entitlements
  config = withEntitlementsPlist(config, (config) => {
    const bundleId = config.ios?.bundleIdentifier || 'com.example.app';
    config.modResults['com.apple.developer.networking.networkextension'] = ['packet-tunnel-provider'];
    config.modResults['com.apple.security.application-groups'] = [`group.${bundleId}`];
    return config;
  });

  // Step 2: All Xcode project modifications in a single operation
  config = withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const projectRoot = config.modRequest.projectRoot;
    const bundleId = config.ios?.bundleIdentifier || 'com.example.app';

    try {
      console.log("WireGuard plugin: Setting up WireGuard targets and capabilities");

      // Get main target and configure it
      const mainTarget = getMainTarget(xcodeProject);
      if (mainTarget) {
        console.log(`Found main target: ${mainTarget.name} (${mainTarget.uuid})`);
        ensureFrameworksBuildPhase(xcodeProject, mainTarget.uuid);
        addFrameworkDirectly(xcodeProject, mainTarget.uuid, 'System/Library/Frameworks/NetworkExtension.framework', true);
        addNetworkExtensionCapability(xcodeProject, mainTarget.uuid);

        // Get development team ID from main target if not provided in props
        const mainTargetTeamId = getTargetDevelopmentTeam(xcodeProject, mainTarget.uuid);
        const developmentTeam = props?.developmentTeam || mainTargetTeamId;

        // Log which team ID we're using
        if (props?.developmentTeam) {
          console.log(`Using provided development team ID: ${developmentTeam}`);
        } else if (mainTargetTeamId) {
          console.log(`Inheriting development team ID from main target: ${developmentTeam}`);
        } else {
          console.warn("No development team ID found. User will need to set this manually.");
        }

      } else {
        console.warn("Could not find main app target");
        return config;
      }

      // 1. First, add the WireguardGoBridge External Build System target
      console.log(`Adding ${WIREGUARD_GO_BRIDGE_TARGET} External Build System target...`);
      const goBridgeTargetUuid = addExternalBuildSystemTarget(xcodeProject, projectRoot);
      console.log(`Successfully added ${WIREGUARD_GO_BRIDGE_TARGET} target with UUID: ${goBridgeTargetUuid}`);

      // 2. Then add the network extension target and set dependency
      console.log("Adding WireGuardNetworkExtension target");
      createNetworkExtensionFiles(projectRoot, bundleId);

      const wireGuardTarget = xcodeProject.addTarget(
        NSE_TARGET_NAME,
        'app_extension',
        'com.apple.networkextension.packet-tunnel',
        `${bundleId}.${NSE_TARGET_NAME}`
      );

      // Configure target properties
      const entitlementsPath = `WireGuardNetworkExtension/${NSE_TARGET_NAME}.entitlements`;
      const targetProps = {
        'ENABLE_BITCODE': 'NO',
        'CODE_SIGN_ENTITLEMENTS': entitlementsPath,
        'INFOPLIST_FILE': 'WireGuardNetworkExtension/Info.plist',
        'CODE_SIGN_IDENTITY': 'iPhone Developer',
        'CODE_SIGNING_REQUIRED': 'YES'
      };

      Object.entries(targetProps).forEach(([key, value]) => {
        xcodeProject.addBuildProperty(key, value, wireGuardTarget.uuid);
      });

      // Add framework and capability
      addNetworkExtensionFramework(xcodeProject, wireGuardTarget.uuid);
      addNetworkExtensionCapability(xcodeProject, wireGuardTarget.uuid, props?.developmentTeam);

      // Link WireGuardKit with the network extension target
      console.log(`Adding WireGuardKit library to ${NSE_TARGET_NAME} target`);
      addWireGuardKitToTarget(xcodeProject, wireGuardTarget.uuid);

      // Add dependency using the target UUID directly (not the name)
      console.log(`Adding dependency from ${NSE_TARGET_NAME} to ${WIREGUARD_GO_BRIDGE_TARGET}`);
      addTargetDependencyByUuid(xcodeProject, wireGuardTarget.uuid, goBridgeTargetUuid, WIREGUARD_GO_BRIDGE_TARGET);

      console.log("Successfully added WireGuardNetworkExtension target");

      // 3. Add the WireGuardNetworkExtension as a dependency to the main app target
      console.log(`Adding dependency from ${mainTarget.name} to ${NSE_TARGET_NAME}`);
      addTargetDependencyByUuid(xcodeProject, mainTarget.uuid, wireGuardTarget.uuid, NSE_TARGET_NAME);
      console.log(`Successfully added ${NSE_TARGET_NAME} as a dependency to main target`);

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
 * Add the WireguardGoBridge External Build System target to the Xcode project
 * @returns The UUID of the new target
 */
function addExternalBuildSystemTarget(xcodeProject: XcodeProject, projectRoot: string): string {
  // Generate a UUID for the new target
  const targetUuid = xcodeProject.generateUuid();
  const targetComment = `${WIREGUARD_GO_BRIDGE_TARGET}`;

  // Calculate working directory - this should point to the WireGuard Go code
  // We're using the path where WireGuardKit would typically be located as an SPM dependency
  const workingDirectory = "\"${BUILD_DIR%Build/*}SourcePackages/checkouts/wireguard-apple/Sources/WireGuardKitGo\"";

  // Create the External Build System target (PBXLegacyTarget)
  xcodeProject.hash.project.objects.PBXLegacyTarget = xcodeProject.hash.project.objects.PBXLegacyTarget || {};
  xcodeProject.hash.project.objects.PBXLegacyTarget[targetUuid] = {
    isa: 'PBXLegacyTarget',
    buildArgumentsString: '"${ACTION}"',  // Pass the Xcode action (build, clean, etc.) to make
    buildConfigurationList: addBuildConfigurationForTarget(xcodeProject, targetUuid),
    buildPhases: [],
    buildToolPath: '/usr/bin/make',  // Use make as the build tool
    buildWorkingDirectory: workingDirectory,
    dependencies: [],
    name: WIREGUARD_GO_BRIDGE_TARGET,
    productName: WIREGUARD_GO_BRIDGE_TARGET
  };
  xcodeProject.hash.project.objects.PBXLegacyTarget[`${targetUuid}_comment`] = targetComment;

  // Add the target to the project's targets list
  const projectSection = xcodeProject.pbxProjectSection();
  const projectKey = Object.keys(projectSection).find(key => !key.includes('_comment'));
  if (projectKey) {
    const targets = projectSection[projectKey].targets || [];
    targets.push({ value: targetUuid, comment: targetComment });
    projectSection[projectKey].targets = targets;
  }

  return targetUuid;
}

/**
 * Add build configurations (Debug and Release) for the external build target
 */
function addBuildConfigurationForTarget(xcodeProject: XcodeProject, targetUuid: string): string {
  // Create build configuration list
  const configListUuid = xcodeProject.generateUuid();
  const configListComment = `Build configuration list for PBXLegacyTarget "${WIREGUARD_GO_BRIDGE_TARGET}"`;

  // Create Debug configuration
  const debugConfigUuid = xcodeProject.generateUuid();
  const debugConfigComment = "Debug";

  // Create Release configuration
  const releaseConfigUuid = xcodeProject.generateUuid();
  const releaseConfigComment = "Release";

  // Add configurations to the project
  xcodeProject.hash.project.objects.XCBuildConfiguration = xcodeProject.hash.project.objects.XCBuildConfiguration || {};
  xcodeProject.hash.project.objects.XCBuildConfiguration[debugConfigUuid] = {
    isa: 'XCBuildConfiguration',
    buildSettings: {
      PRODUCT_NAME: WIREGUARD_GO_BRIDGE_TARGET,
      // Fix: Properly quote values that contain spaces
      SUPPORTED_PLATFORMS: "\"iphoneos iphonesimulator\"",
      SDKROOT: "iphoneos"
    },
    name: 'Debug'
  };
  xcodeProject.hash.project.objects.XCBuildConfiguration[`${debugConfigUuid}_comment`] = debugConfigComment;

  xcodeProject.hash.project.objects.XCBuildConfiguration[releaseConfigUuid] = {
    isa: 'XCBuildConfiguration',
    buildSettings: {
      PRODUCT_NAME: WIREGUARD_GO_BRIDGE_TARGET,
      // Fix: Properly quote values that contain spaces
      SUPPORTED_PLATFORMS: "\"iphoneos iphonesimulator\"",
      SDKROOT: "iphoneos"
    },
    name: 'Release'
  };
  xcodeProject.hash.project.objects.XCBuildConfiguration[`${releaseConfigUuid}_comment`] = releaseConfigComment;

  // Create configuration list that references these configurations
  xcodeProject.hash.project.objects.XCConfigurationList = xcodeProject.hash.project.objects.XCConfigurationList || {};
  xcodeProject.hash.project.objects.XCConfigurationList[configListUuid] = {
    isa: 'XCConfigurationList',
    buildConfigurations: [
      { value: debugConfigUuid, comment: debugConfigComment },
      { value: releaseConfigUuid, comment: releaseConfigComment }
    ],
    defaultConfigurationIsVisible: 0,
    defaultConfigurationName: 'Release'
  };
  xcodeProject.hash.project.objects.XCConfigurationList[`${configListUuid}_comment`] = configListComment;

  return configListUuid;
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
    console.log(`Adding dependency from ${targetUuid} to ${dependencyTargetUuid}`);

    // Create a container item proxy for the dependency target
    const containerItemProxyUuid = xcodeProject.generateUuid();
    const containerItemProxyComment = `PBXContainerItemProxy ${dependencyTargetName}`;

    xcodeProject.hash.project.objects.PBXContainerItemProxy = xcodeProject.hash.project.objects.PBXContainerItemProxy || {};
    xcodeProject.hash.project.objects.PBXContainerItemProxy[containerItemProxyUuid] = {
      isa: 'PBXContainerItemProxy',
      containerPortal: xcodeProject.hash.project.rootObject,
      proxyType: 1,
      remoteGlobalIDString: dependencyTargetUuid,
      remoteInfo: dependencyTargetName
    };
    xcodeProject.hash.project.objects.PBXContainerItemProxy[`${containerItemProxyUuid}_comment`] = containerItemProxyComment;

    // Create a target dependency using the container proxy
    const targetDependencyUuid = xcodeProject.generateUuid();
    const targetDependencyComment = dependencyTargetName;

    xcodeProject.hash.project.objects.PBXTargetDependency = xcodeProject.hash.project.objects.PBXTargetDependency || {};
    xcodeProject.hash.project.objects.PBXTargetDependency[targetDependencyUuid] = {
      isa: 'PBXTargetDependency',
      target: dependencyTargetUuid,
      targetProxy: containerItemProxyUuid
    };
    xcodeProject.hash.project.objects.PBXTargetDependency[`${targetDependencyUuid}_comment`] = targetDependencyComment;

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
      comment: targetDependencyComment
    });

    console.log(`Successfully added dependency on ${dependencyTargetUuid} to target ${targetUuid}`);
  } catch (error) {
    console.warn(`Error adding target dependency: ${error}`);
  }
}

/**
 * Add a dependency between targets by finding the dependency target UUID
 */
function addTargetDependency(xcodeProject: XcodeProject, targetUuid: string, dependencyTargetName: string): void {
  try {
    console.log(`Adding dependency on ${dependencyTargetName} to target ${targetUuid}`);

    // Find the target UUID for the dependency target by name
    const targets = xcodeProject.getFirstProject().firstProject.targets;
    const dependencyTarget = targets.find((target: any) =>
      target.comment && target.comment === dependencyTargetName
    );

    if (!dependencyTarget) {
      console.warn(`Dependency target ${dependencyTargetName} not found`);
      return;
    }

    const dependencyTargetUuid = dependencyTarget.value;
    addTargetDependencyByUuid(xcodeProject, targetUuid, dependencyTargetUuid, dependencyTargetName);
  } catch (error) {
    console.warn(`Error adding target dependency: ${error}`);
  }
}

/**
 * Add NetworkExtension.framework to a target with proper configuration
 */
function addNetworkExtensionFramework(xcodeProject: XcodeProject, targetUuid: string): void {
  try {
    console.log(`Adding NetworkExtension.framework to target: ${targetUuid}`);
    ensureFrameworksBuildPhase(xcodeProject, targetUuid);
    const isWeak = !isTargetExtension(xcodeProject, targetUuid);
    addFrameworkDirectly(
      xcodeProject, targetUuid,
      'System/Library/Frameworks/NetworkExtension.framework',
      isWeak
    );
  } catch (error) {
    console.warn(`Failed to add NetworkExtension.framework: ${error}`);
  }
}

/**
 * Ensure the Frameworks build phase exists for a target
 */
function ensureFrameworksBuildPhase(xcodeProject: XcodeProject, targetUuid: string): void {
  if (!hasFrameworksBuildPhase(xcodeProject, targetUuid)) {
    console.log(`Adding Frameworks build phase to target: ${targetUuid}`);
    xcodeProject.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', targetUuid);
  }
}

/**
 * Add framework directly to a target
 */
function addFrameworkDirectly(xcodeProject: XcodeProject, targetUuid: string, frameworkPath: string, weak: boolean): void {
  try {
    const frameworkName = path.basename(frameworkPath);

    if (hasFramework(xcodeProject, targetUuid, frameworkName)) {
      console.log(`Framework ${frameworkName} already exists for target ${targetUuid}`);
      return;
    }

    const buildPhaseUuid = getBuildPhaseUuid(xcodeProject, targetUuid, 'PBXFrameworksBuildPhase');
    if (!buildPhaseUuid) {
      throw new Error(`Could not find frameworks build phase for target: ${targetUuid}`);
    }

    // Create or get file reference
    let fileRef: string | undefined;
    const fileReferences = xcodeProject.hash.project.objects.PBXFileReference;

    // Look for existing file reference
    for (const ref in fileReferences) {
      if (ref.includes('_comment')) continue;
      const fileReference = fileReferences[ref];
      if (fileReference.path === frameworkPath || fileReference.name === frameworkName) {
        fileRef = ref;
        break;
      }
    }

    // Create new file reference if needed
    if (!fileRef) {
      fileRef = xcodeProject.generateUuid();
      xcodeProject.hash.project.objects.PBXFileReference[fileRef] = {
        isa: 'PBXFileReference',
        lastKnownFileType: 'wrapper.framework',
        name: frameworkName,
        path: frameworkPath,
        sourceTree: 'SDKROOT'
      };
      xcodeProject.hash.project.objects.PBXFileReference[`${fileRef}_comment`] = frameworkName;
    }

    // Create build file
    const buildFileUuid = xcodeProject.generateUuid();
    const settings: any = weak ? { ATTRIBUTES: ['Weak'] } : {};

    xcodeProject.hash.project.objects.PBXBuildFile[buildFileUuid] = {
      isa: 'PBXBuildFile',
      fileRef: fileRef,
      settings: settings
    };
    xcodeProject.hash.project.objects.PBXBuildFile[`${buildFileUuid}_comment`] = `${frameworkName} in Frameworks`;

    // Add to build phase
    xcodeProject.hash.project.objects.PBXFrameworksBuildPhase[buildPhaseUuid].files.push({
      value: buildFileUuid,
      comment: `${frameworkName} in Frameworks`
    });

    console.log(`Successfully added ${frameworkName} to target ${targetUuid}`);
  } catch (error) {
    console.warn(`Failed to add framework directly: ${error}`);
  }
}

/**
 * Add WireGuardKit library to the target
 */
function addWireGuardKitToTarget(xcodeProject: XcodeProject, targetUuid: string): void {
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
    const buildPhaseUuid = getBuildPhaseUuid(xcodeProject, targetUuid, 'PBXFrameworksBuildPhase');
    if (!buildPhaseUuid) {
      throw new Error(`Could not find frameworks build phase for target: ${targetUuid}`);
    }

    // Create or get file reference
    let fileRef: string | undefined;
    const fileReferences = xcodeProject.hash.project.objects.PBXFileReference;

    // Look for existing file reference
    for (const ref in fileReferences) {
      if (ref.includes('_comment')) continue;
      const fileReference = fileReferences[ref];
      if (fileReference.name === frameworkName || fileReference.path?.includes(frameworkName)) {
        fileRef = ref;
        break;
      }
    }

    // Create new file reference if needed
    if (!fileRef) {
      fileRef = xcodeProject.generateUuid();
      xcodeProject.hash.project.objects.PBXFileReference[fileRef] = {
        isa: 'PBXFileReference',
        lastKnownFileType: 'wrapper.framework',
        name: frameworkName,
        path: frameworkName,
        sourceTree: 'BUILT_PRODUCTS_DIR'  // This refers to the framework built by Xcode
      };
      xcodeProject.hash.project.objects.PBXFileReference[`${fileRef}_comment`] = frameworkName;
    }

    // Create build file entry
    const buildFileUuid = xcodeProject.generateUuid();

    xcodeProject.hash.project.objects.PBXBuildFile[buildFileUuid] = {
      isa: 'PBXBuildFile',
      fileRef: fileRef
    };
    xcodeProject.hash.project.objects.PBXBuildFile[`${buildFileUuid}_comment`] = `${frameworkName} in Frameworks`;

    // Add to build phase
    xcodeProject.hash.project.objects.PBXFrameworksBuildPhase[buildPhaseUuid].files.push({
      value: buildFileUuid,
      comment: `${frameworkName} in Frameworks`
    });

    console.log(`Successfully added WireGuardKit to target ${targetUuid}`);
  } catch (error) {
    console.warn(`Failed to add WireGuardKit to target: ${error}`);
  }
}

/**
 * Helper functions for target and framework management
 */
function hasFramework(xcodeProject: XcodeProject, targetUuid: string, frameworkName: string): boolean {
  try {
    const buildPhaseUuid = getBuildPhaseUuid(xcodeProject, targetUuid, 'PBXFrameworksBuildPhase');
    if (buildPhaseUuid) {
      const buildPhase = xcodeProject.hash.project.objects.PBXFrameworksBuildPhase[buildPhaseUuid];
      if (buildPhase && buildPhase.files) {
        for (const fileRef of buildPhase.files) {
          const buildFile = xcodeProject.hash.project.objects.PBXBuildFile[fileRef.value];
          if (buildFile && buildFile.fileRef) {
            const pbxFileRef = xcodeProject.hash.project.objects.PBXFileReference[buildFile.fileRef];
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

function getBuildPhaseUuid(xcodeProject: XcodeProject, targetUuid: string, buildPhaseType: string): string | null {
  try {
    const target = xcodeProject.pbxNativeTargetSection()[targetUuid];
    if (target && target.buildPhases) {
      for (const phaseEntry of target.buildPhases) {
        const allBuildPhases = xcodeProject.hash.project.objects[buildPhaseType];
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

function hasFrameworksBuildPhase(xcodeProject: XcodeProject, targetUuid: string): boolean {
  return getBuildPhaseUuid(xcodeProject, targetUuid, 'PBXFrameworksBuildPhase') !== null;
}

function isTargetExtension(xcodeProject: XcodeProject, targetUuid: string): boolean {
  try {
    const target = xcodeProject.pbxNativeTargetSection()[targetUuid];
    return !!(target && target.comment && target.comment.includes(NSE_TARGET_NAME));
  } catch (error) {
    console.warn(`Error determining if target is extension: ${error}`);
    return false;
  }
}

function getMainTarget(xcodeProject: XcodeProject): { uuid: string; name: string } | null {
  try {
    const targets = xcodeProject.getFirstProject().firstProject.targets;
    const mainTarget = targets.find((target: any) =>
      target.comment &&
      !target.comment.includes('WireGuardNetworkExtension') &&
      !target.comment.includes('Tests') &&
      !target.comment.includes('Watch')
    );

    return mainTarget ? { uuid: mainTarget.value, name: mainTarget.comment } : null;
  } catch (error) {
    console.warn("Error getting main target:", error);
    return null;
  }
}

function createNetworkExtensionFiles(projectPath: string, bundleId: string): void {
  try {
    const iosDir = path.join(projectPath, 'ios');
    const extensionDir = path.join(iosDir, 'WireGuardNetworkExtension');
    const entitlementsPath = path.join(extensionDir, `${NSE_TARGET_NAME}.entitlements`);
    const infoPlistPath = path.join(extensionDir, 'Info.plist');

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
    <string>1.0</string>
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
    const pbxProjectKey = Object.keys(pbxProjectSection).find(key => !key.includes('_comment'));
    if (!pbxProjectKey) {
      console.warn("Could not find project section");
      return;
    }

    const pbxProject = pbxProjectSection[pbxProjectKey];

    // Ensure target attributes exist
    pbxProject.attributes = pbxProject.attributes || {};
    pbxProject.attributes.TargetAttributes = pbxProject.attributes.TargetAttributes || {};
    pbxProject.attributes.TargetAttributes[targetUuid] = pbxProject.attributes.TargetAttributes[targetUuid] || {};

    const targetAttributes = pbxProject.attributes.TargetAttributes[targetUuid];
    targetAttributes.SystemCapabilities = targetAttributes.SystemCapabilities || {};

    // Add Network Extension capability
    targetAttributes.SystemCapabilities['com.apple.NetworkExtensions.iOS'] = { enabled: 1 };
    targetAttributes.SystemCapabilities['com.apple.NetworkExtension'] = { enabled: 1 };

    // Add Development Team if provided or try to inherit from main target
    if (developmentTeam) {
      targetAttributes.DevelopmentTeam = developmentTeam;
      console.log(`Set DevelopmentTeam to ${developmentTeam} for target ${targetUuid}`);
    } else if (!targetAttributes.DevelopmentTeam) {
      // Try to find team ID from main target
      const mainTarget = getMainTarget(xcodeProject);
      if (mainTarget) {
        const mainAttributes = pbxProject.attributes.TargetAttributes[mainTarget.uuid];
        if (mainAttributes && mainAttributes.DevelopmentTeam) {
          targetAttributes.DevelopmentTeam = mainAttributes.DevelopmentTeam;
          console.log(`Inherited DevelopmentTeam ${mainAttributes.DevelopmentTeam} from main target for target ${targetUuid}`);
        } else {
          console.log("No DevelopmentTeam found to inherit. User will need to set this manually.");
        }
      }
    }

    // Update build settings
    enableNetworkExtensionBuildSettings(xcodeProject, targetUuid, developmentTeam || targetAttributes.DevelopmentTeam);

    console.log(`Successfully added NetworkExtension capability to target: ${targetUuid}`);
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
      const isExtension = buildSettings.PRODUCT_NAME &&
        typeof buildSettings.PRODUCT_NAME === 'string' &&
        buildSettings.PRODUCT_NAME.includes(NSE_TARGET_NAME);

      if (isExtension) {
        // Extension target settings
        buildSettings.CODE_SIGN_ENTITLEMENTS = `WireGuardNetworkExtension/${NSE_TARGET_NAME}.entitlements`;
        buildSettings.INFOPLIST_FILE = 'WireGuardNetworkExtension/Info.plist';
        buildSettings.ENABLE_BITCODE = "NO";

        // Set development team if provided
        if (developmentTeam) {
          buildSettings.DEVELOPMENT_TEAM = developmentTeam;
          console.log(`Set DEVELOPMENT_TEAM build setting to ${developmentTeam} for config ${configId}`);
        }
      }
    });
  } catch (error) {
    console.warn("Error updating build settings:", error);
  }
}

export default withWireGuardNetworkExtension;
