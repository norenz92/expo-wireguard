import { ConfigPlugin, withXcodeProject, XcodeProject } from 'expo/config-plugins';
import * as path from 'path';

// Configuration for the External Build System target
const WIREGUARD_GO_BRIDGE_TARGET = 'WireguardGoBridge';

/**
 * Add an External Build System target called "WireguardGoBridge"
 * This target will be responsible for building the Go components of WireGuard
 */
const withWireGuardGoBridge: ConfigPlugin = (config) => {
  return withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;
    const projectRoot = config.modRequest.projectRoot;
    
    try {
      console.log(`Adding ${WIREGUARD_GO_BRIDGE_TARGET} External Build System target...`);
      
      // Add the External Build System target (PBXLegacyTarget)
      addExternalBuildSystemTarget(xcodeProject, projectRoot);
      
      console.log(`Successfully added ${WIREGUARD_GO_BRIDGE_TARGET} target`);
    } catch (error) {
      console.warn(`Failed to add ${WIREGUARD_GO_BRIDGE_TARGET} target:`, error);
    }
    
    return config;
  });
};

/**
 * Add the WireguardGoBridge External Build System target to the Xcode project
 */
function addExternalBuildSystemTarget(xcodeProject: XcodeProject, projectRoot: string): void {
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
  
  console.log(`External Build System target ${WIREGUARD_GO_BRIDGE_TARGET} added with UUID: ${targetUuid}`);
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

export default withWireGuardGoBridge;