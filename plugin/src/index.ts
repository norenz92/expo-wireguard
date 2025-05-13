import {
  ConfigPlugin,
  withXcodeProject,
  withEntitlementsPlist,
  XcodeProject,
  IOSConfig,
} from 'expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

const NSE_TARGET_NAME = 'WireGuardNetworkExtension';

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

        // Also add Network Extension capability to the main app
        addNetworkExtensionCapability(xcodeProject, mainTarget.uuid);
      }
    } catch (error) {
      console.warn("Error configuring WireGuard capability:", error);
    }

    return config;
  });

  // Add the WireGuardNetworkExtension target
  config = withXcodeProject(config, (config) => {
    console.log("WireGuard plugin: Adding WireGuardNetworkExtension target");

    try {
      const xcodeProject = config.modResults;
      const bundleId = config.ios?.bundleIdentifier || 'com.example.app';
      const projectPath = config.modRequest.projectRoot;

      // Find the main app target
      const mainTarget = getMainTarget(xcodeProject);
      if (mainTarget) {
        // Create necessary files for the extension
        createNetworkExtensionFiles(projectPath, bundleId);

        // Add the WireGuardNetworkExtension target
        const wireGuardTarget = xcodeProject.addTarget(
          NSE_TARGET_NAME,
          'app_extension',
          'com.apple.networkextension.packet-tunnel', // Changed this to the correct extension point identifier
          `${bundleId}.${NSE_TARGET_NAME}`
        );

        // Configure the extension target
        xcodeProject.addBuildProperty('ENABLE_BITCODE', 'NO', wireGuardTarget.uuid);

        // Use the correct path to the entitlements file
        const entitlementsPath = `WireGuardNetworkExtension/${NSE_TARGET_NAME}.entitlements`;
        xcodeProject.addBuildProperty('CODE_SIGN_ENTITLEMENTS', entitlementsPath, wireGuardTarget.uuid);

        // Set the Info.plist path correctly
        xcodeProject.addBuildProperty('INFOPLIST_FILE', 'WireGuardNetworkExtension/Info.plist', wireGuardTarget.uuid);

        xcodeProject.addBuildProperty('CODE_SIGN_IDENTITY', 'iPhone Developer', wireGuardTarget.uuid);
        xcodeProject.addBuildProperty('CODE_SIGNING_REQUIRED', 'YES', wireGuardTarget.uuid);

        // Add NetworkExtension framework to the extension target
        const frameworkPath = 'System/Library/Frameworks/NetworkExtension.framework';
        const fileOptions = {
          weak: false, // Not weak for the extension target
          target: wireGuardTarget.uuid,
          link: true
        };

        try {
          // Add build phase if it doesn't exist
          addBuildPhaseIfNeeded(xcodeProject, wireGuardTarget.uuid);

          // Add the framework
          xcodeProject.addFramework(frameworkPath, fileOptions);
          console.log("Successfully added NetworkExtension.framework to the WireGuardNetworkExtension target");

          // Add explicit Network Extension capability to the extension target
          addNetworkExtensionCapability(xcodeProject, wireGuardTarget.uuid);

          console.log("Successfully added WireGuardNetworkExtension target");
        } catch (error) {
          console.warn(`Failed to add NetworkExtension.framework to extension: ${error}`);
        }
      }
    } catch (error) {
      console.warn("Error adding WireGuardNetworkExtension target:", error);
    }

    return config;
  });

  return config;
};

/**
 * Create necessary files for the network extension
 */
function createNetworkExtensionFiles(projectPath: string, bundleId: string): void {
  try {
    // Create paths for the extension files - use the correct directory structure
    // The path should be in the iOS project directory
    const iosDir = path.join(projectPath, 'ios');
    const extensionEntitlementsDir = path.join(iosDir, 'WireGuardNetworkExtension');
    const entitlementsPath = path.join(extensionEntitlementsDir, `${NSE_TARGET_NAME}.entitlements`);
    const infoPlistPath = path.join(extensionEntitlementsDir, 'Info.plist');

    // Always create directories and files during config plugin execution
    console.log(`Creating extension directory at: ${extensionEntitlementsDir}`);

    // Create extension directory if it doesn't exist
    if (!fs.existsSync(extensionEntitlementsDir)) {
      fs.mkdirSync(extensionEntitlementsDir, { recursive: true });
      console.log(`Created extension directory: ${extensionEntitlementsDir}`);
    }

    // Create entitlements file if it doesn't exist
    if (!fs.existsSync(entitlementsPath)) {
      const entitlementsContent = createEntitlementsContent(bundleId);
      fs.writeFileSync(entitlementsPath, entitlementsContent);
      console.log(`Created entitlements file for ${NSE_TARGET_NAME} at ${entitlementsPath}`);
    } else {
      console.log(`Entitlements file already exists at ${entitlementsPath}`);
    }

    // Create Info.plist if it doesn't exist
    if (!fs.existsSync(infoPlistPath)) {
      const infoPlistContent = createInfoPlistContent(bundleId);
      fs.writeFileSync(infoPlistPath, infoPlistContent);
      console.log(`Created Info.plist for ${NSE_TARGET_NAME} at ${infoPlistPath}`);
    } else {
      console.log(`Info.plist already exists at ${infoPlistPath}`);
    }
  } catch (error) {
    console.warn(`Error creating files for WireGuardNetworkExtension: ${error}`);
  }
}

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
 * Add NetworkExtension capability to the target
 */
function addNetworkExtensionCapability(xcodeProject: XcodeProject, targetUuid: string): void {
  try {
    console.log(`Adding NetworkExtension capability to target: ${targetUuid}`);

    // Find the target attributes section
    const pbxProjectSection = xcodeProject.pbxProjectSection();
    const pbxProjectKey = Object.keys(pbxProjectSection).find(key => !key.includes('_comment'));

    if (!pbxProjectKey) {
      console.warn("Could not find project section");
      return;
    }

    const pbxProject = pbxProjectSection[pbxProjectKey];

    // Create required attribute structure if it doesn't exist
    if (!pbxProject.attributes) {
      pbxProject.attributes = {};
    }

    if (!pbxProject.attributes.TargetAttributes) {
      pbxProject.attributes.TargetAttributes = {};
    }

    if (!pbxProject.attributes.TargetAttributes[targetUuid]) {
      pbxProject.attributes.TargetAttributes[targetUuid] = {};
    }

    const targetAttributes = pbxProject.attributes.TargetAttributes[targetUuid];

    // Add SystemCapabilities if it doesn't exist
    if (!targetAttributes.SystemCapabilities) {
      targetAttributes.SystemCapabilities = {};
    }

    // These are the correct keys for Network Extension capability
    // Both key formats should be added for compatibility
    targetAttributes.SystemCapabilities['com.apple.NetworkExtensions.iOS'] = { enabled: 1 };
    targetAttributes.SystemCapabilities['com.apple.NetworkExtension'] = { enabled: 1 };

    // Add Development Team if not already present (important for capabilities)
    if (!targetAttributes.DevelopmentTeam) {
      // Use a placeholder that will need to be updated by the user
      targetAttributes.DevelopmentTeam = "DEVELOPMENT_TEAM";
      console.log("Added placeholder DevelopmentTeam. User will need to update this.");
    }

    // Manually add project settings for NetworkExtension capability
    enableNetworkExtensionBuildSettings(xcodeProject, targetUuid);

    console.log(`Successfully added NetworkExtension capability to target: ${targetUuid}`);
  } catch (error) {
    console.warn("Error adding NetworkExtension capability:", error);
  }
}

/**
 * Enable Network Extension in build settings 
 */
function enableNetworkExtensionBuildSettings(xcodeProject: XcodeProject, targetUuid: string): void {
  try {
    // Get all configurations for the target
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();

    // Find all build configurations that belong to the target
    for (const configKey in configurations) {
      if (configKey.endsWith('_comment')) continue;

      const config = configurations[configKey];

      // Check if this configuration belongs to the target
      if (config.buildSettings && config.buildSettings.PRODUCT_NAME &&
        config.buildSettings.PRODUCT_NAME.includes(NSE_TARGET_NAME)) {

        // Add/update the build settings for Network Extension
        const buildSettings = config.buildSettings;

        // Enable network extension entitlement with the correct path
        buildSettings.CODE_SIGN_ENTITLEMENTS = `WireGuardNetworkExtension/${NSE_TARGET_NAME}.entitlements`;

        // Set the Info.plist path correctly
        buildSettings.INFOPLIST_FILE = 'WireGuardNetworkExtension/Info.plist';

        // Add any other needed build settings for Network Extension
        buildSettings.ENABLE_BITCODE = "NO"; // Often required for extensions

        console.log(`Updated build settings for configuration: ${configKey}`);
      }
    }
  } catch (error) {
    console.warn("Error updating build settings for Network Extension:", error);
  }
}

/**
 * Add frameworks build phase to target if needed
 */
function addBuildPhaseIfNeeded(xcodeProject: XcodeProject, targetUuid: string): void {
  try {
    if (!hasFrameworksBuildPhase(xcodeProject, targetUuid)) {
      // Get the target
      const pbxTargetSection = xcodeProject.pbxNativeTargetSection();
      const target = pbxTargetSection[targetUuid];

      if (target) {
        // Create a new frameworks build phase
        xcodeProject.addBuildPhase(
          [], // files
          'PBXFrameworksBuildPhase',
          'Frameworks',
          targetUuid
        );

        console.log("Added Frameworks build phase to the WireGuardNetworkExtension target");
      }
    }
  } catch (error) {
    console.warn("Error adding frameworks build phase:", error);
  }
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

/**
 * Create the content for the network extension entitlements file
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

/**
 * Create Info.plist content for the network extension
 */
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

export default withWireGuardNetworkExtension;
