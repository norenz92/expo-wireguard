import {
  ConfigPlugin,
  withXcodeProject,
  withEntitlementsPlist,
  XcodeProject,
} from 'expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';
import withWireGuardGoBridge from './ios/withWireGuardGoBridge';

const NSE_TARGET_NAME = 'WireGuardNetworkExtension';

const withWireGuardNetworkExtension: ConfigPlugin = (config) => {
  // Add the External Build System target for WireguardGoBridge
  config = withWireGuardGoBridge(config);

  // Add the Network Extension entitlements
  config = withEntitlementsPlist(config, (config) => {
    // Set network extension entitlement and app groups
    const bundleId = config.ios?.bundleIdentifier || 'com.example.app';
    config.modResults['com.apple.developer.networking.networkextension'] = ['packet-tunnel-provider'];
    config.modResults['com.apple.security.application-groups'] = [`group.${bundleId}`];
    return config;
  });

  // Add NetworkExtension.framework to the main app and configure capabilities
  config = withXcodeProject(config, (config) => {
    console.log("WireGuard plugin: Adding Network Extension capability and framework to main app");
    try {
      const xcodeProject = config.modResults;
      const mainTarget = getMainTarget(xcodeProject);
      
      if (mainTarget) {
        console.log(`Found main target: ${mainTarget.name} (${mainTarget.uuid})`);
        ensureFrameworksBuildPhase(xcodeProject, mainTarget.uuid);
        addFrameworkDirectly(xcodeProject, mainTarget.uuid, 'System/Library/Frameworks/NetworkExtension.framework', true);
        addNetworkExtensionCapability(xcodeProject, mainTarget.uuid);
      } else {
        console.warn("Could not find main app target");
      }
    } catch (error) {
      console.warn("Error configuring WireGuard capability for main app:", error);
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
      const mainTarget = getMainTarget(xcodeProject);
      
      if (mainTarget) {
        // Create necessary files for the extension
        createNetworkExtensionFiles(projectPath, bundleId);

        // Add and configure the extension target
        const wireGuardTarget = xcodeProject.addTarget(
          NSE_TARGET_NAME,
          'app_extension',
          'com.apple.networkextension.packet-tunnel',
          `${bundleId}.${NSE_TARGET_NAME}`
        );

        // Configure the target properties
        const entitlementsPath = `WireGuardNetworkExtension/${NSE_TARGET_NAME}.entitlements`;
        const targetProps = {
          'ENABLE_BITCODE': 'NO',
          'CODE_SIGN_ENTITLEMENTS': entitlementsPath,
          'INFOPLIST_FILE': 'WireGuardNetworkExtension/Info.plist',
          'CODE_SIGN_IDENTITY': 'iPhone Developer',
          'CODE_SIGNING_REQUIRED': 'YES'
        };
        
        // Add all properties at once
        Object.entries(targetProps).forEach(([key, value]) => {
          xcodeProject.addBuildProperty(key, value, wireGuardTarget.uuid);
        });

        // Add framework and capability to extension target
        addNetworkExtensionFramework(xcodeProject, wireGuardTarget.uuid);
        addNetworkExtensionCapability(xcodeProject, wireGuardTarget.uuid);
        
        console.log("Successfully added WireGuardNetworkExtension target");
      }
    } catch (error) {
      console.warn("Error adding WireGuardNetworkExtension target:", error);
    }
    return config;
  });

  return config;
};

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
    console.warn("Error finding main target:", error);
    return null;
  }
}

/**
 * Extension capability and supporting files management
 */
function addNetworkExtensionCapability(xcodeProject: XcodeProject, targetUuid: string): void {
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
    
    // Add placeholder Development Team if needed
    if (!targetAttributes.DevelopmentTeam) {
      targetAttributes.DevelopmentTeam = "DEVELOPMENT_TEAM";
      console.log("Added placeholder DevelopmentTeam. User will need to update this.");
    }
    
    // Update build settings
    enableNetworkExtensionBuildSettings(xcodeProject, targetUuid);
    
    console.log(`Successfully added NetworkExtension capability to target: ${targetUuid}`);
  } catch (error) {
    console.warn("Error adding NetworkExtension capability:", error);
  }
}

function enableNetworkExtensionBuildSettings(xcodeProject: XcodeProject, targetUuid: string): void {
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
      }
    });
  } catch (error) {
    console.warn("Error updating build settings:", error);
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

export { default as withWireGuardGoBridge } from './ios/withWireGuardGoBridge';
export default withWireGuardNetworkExtension;
