import {
  ConfigPlugin,
  withXcodeProject,
  withEntitlementsPlist,
  XcodeProject,
} from "expo/config-plugins";
import * as fs from "fs";

export interface WireGuardPluginProps {
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
  console.log("🚀 withWireGuardNetworkExtension plugin starting...");

  // Add entitlements first
  config = withEntitlementsPlist(config, (config) => {
    const entitlements = config.modResults;

    // Add VPN entitlements to main app
    entitlements["com.apple.developer.networking.networkextension"] = [
      "packet-tunnel-provider",
    ];

    // Add app groups for sharing data between main app and extension
    entitlements["com.apple.security.application-groups"] = [
      "group.expo.modules.wireguard.example",
    ];

    // Add keychain access groups
    entitlements["keychain-access-groups"] = [
      "$(AppIdentifierPrefix)group.expo.modules.wireguard.example",
    ];

    return config;
  });

  // Configure Xcode project for Network Extension
  config = withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;

    try {
      console.log("🔍 Setting up WireGuard Network Extension...");
      console.log("🔍 Project root:", config.modRequest.projectRoot);
      console.log("🔍 iOS bundle ID:", config.ios?.bundleIdentifier);

      // Find all targets in the project
      const targets = xcodeProject.getFirstProject().firstProject.targets;
      console.log("🔍 Found", targets.length, "targets in project");

      // Find the WireGuardNetworkExtension target
      const extensionTarget = targets.find(
        (target: any) =>
          target.comment && target.comment.includes(NSE_TARGET_NAME)
      );

      if (!extensionTarget) {
        console.log(
          "🔍 WireGuardNetworkExtension target not found. Creating automatically..."
        );
        try {
          await createNetworkExtensionTargetSimple(
            xcodeProject,
            config.ios?.bundleIdentifier || "com.example.app",
            config.modRequest.projectRoot
          );
          console.log(
            "✅ Successfully created WireGuard Network Extension target"
          );
        } catch (error) {
          console.error("❌ Failed to create Network Extension target:", error);
          console.log("Manual setup required:");
          console.log("1. Add a Network Extension target in Xcode");
          console.log(
            `2. Set bundle ID to: ${config.ios?.bundleIdentifier || "com.example.app"}.network-extension`
          );
          console.log("3. Add PacketTunnelProvider.swift to the target");
          console.log("4. Add NetworkExtension.framework to the target");
          console.log("5. Add wg-go.xcframework to the target");
        }
      } else {
        console.log(
          `🔍 Found WireGuardNetworkExtension target with UUID: ${extensionTarget.value}`
        );
      }

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

      // Apply development team to the network extension target if found
      const finalExtensionTarget = targets.find(
        (target: any) =>
          target.comment && target.comment.includes(NSE_TARGET_NAME)
      );

      if (finalExtensionTarget && developmentTeam) {
        applyDevelopmentTeam(
          xcodeProject,
          finalExtensionTarget.value,
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
    } catch (error) {
      console.warn("Error configuring WireGuard Network Extension:", error);
    }

    return config;
  });

  return config;
};

/**
 * Create a Network Extension target in the Xcode project
 */
async function createNetworkExtensionTarget(
  xcodeProject: XcodeProject,
  bundleIdentifier: string,
  projectRoot: string
): Promise<void> {
  console.log("🔧 Creating WireGuard Network Extension target...");

  const extensionBundleId = `${bundleIdentifier}.network-extension`;
  const targetName = NSE_TARGET_NAME;

  // Generate UUIDs for all components - ensure they're properly formatted
  const targetUuid = xcodeProject.generateUuid().replace(/-/g, "").slice(0, 24);
  const productUuid = xcodeProject
    .generateUuid()
    .replace(/-/g, "")
    .slice(0, 24);
  const buildConfigListUuid = xcodeProject
    .generateUuid()
    .replace(/-/g, "")
    .slice(0, 24);
  const debugConfigUuid = xcodeProject
    .generateUuid()
    .replace(/-/g, "")
    .slice(0, 24);
  const releaseConfigUuid = xcodeProject
    .generateUuid()
    .replace(/-/g, "")
    .slice(0, 24);
  const sourcesBuildPhaseUuid = xcodeProject
    .generateUuid()
    .replace(/-/g, "")
    .slice(0, 24);
  const frameworksBuildPhaseUuid = xcodeProject
    .generateUuid()
    .replace(/-/g, "")
    .slice(0, 24);

  try {
    // 1. Add target to project targets list
    const project = xcodeProject.getFirstProject().firstProject;
    if (!project.targets) {
      project.targets = [];
    }

    project.targets.push({
      value: targetUuid,
      comment: targetName,
    });

    // 2. Create the native target object
    const target: any = {
      isa: "PBXNativeTarget",
      buildConfigurationList: buildConfigListUuid,
      buildPhases: [
        { value: sourcesBuildPhaseUuid, comment: "Sources" },
        { value: frameworksBuildPhaseUuid, comment: "Frameworks" },
      ],
      buildRules: [],
      dependencies: [],
      name: targetName,
      productName: targetName,
      productReference: productUuid,
      productType: "com.apple.product-type.app-extension",
    };

    // Add to native targets section
    const nativeTargets = xcodeProject.pbxNativeTargetSection();
    nativeTargets[targetUuid] = target;
    nativeTargets[`${targetUuid}_comment`] = targetName;

    // 3. Create product reference
    const products = xcodeProject.pbxFileReferenceSection();
    products[productUuid] = {
      isa: "PBXFileReference",
      explicitFileType: "wrapper.app-extension",
      includeInIndex: 0,
      path: `${targetName}.appex`,
      sourceTree: "BUILT_PRODUCTS_DIR",
    };
    products[`${productUuid}_comment`] = `${targetName}.appex`;

    // 4. Create build configurations
    const buildConfigs = xcodeProject.pbxXCBuildConfigurationSection();

    buildConfigs[debugConfigUuid] = {
      isa: "XCBuildConfiguration",
      buildSettings: getNetworkExtensionBuildSettings(
        extensionBundleId,
        "Debug"
      ),
      name: "Debug",
    };
    buildConfigs[`${debugConfigUuid}_comment`] = "Debug";

    buildConfigs[releaseConfigUuid] = {
      isa: "XCBuildConfiguration",
      buildSettings: getNetworkExtensionBuildSettings(
        extensionBundleId,
        "Release"
      ),
      name: "Release",
    };
    buildConfigs[`${releaseConfigUuid}_comment`] = "Release";

    // 5. Create build configuration list
    const configLists = xcodeProject.pbxXCConfigurationList();
    configLists[buildConfigListUuid] = {
      isa: "XCConfigurationList",
      buildConfigurations: [
        { value: debugConfigUuid, comment: "Debug" },
        { value: releaseConfigUuid, comment: "Release" },
      ],
      defaultConfigurationIsVisible: 0,
      defaultConfigurationName: "Release",
    };
    configLists[`${buildConfigListUuid}_comment`] =
      `Build configuration list for PBXNativeTarget "${targetName}"`;

    // 6. Create sources build phase
    createSourcesBuildPhase(xcodeProject, sourcesBuildPhaseUuid);

    // 7. Create frameworks build phase
    createFrameworksBuildPhase(xcodeProject, frameworksBuildPhaseUuid);

    // 8. Add required files to the target
    addNetworkExtensionFiles(
      xcodeProject,
      targetUuid,
      sourcesBuildPhaseUuid,
      projectRoot
    );

    // 9. Add required frameworks to the target
    addNetworkExtensionFrameworks(
      xcodeProject,
      targetUuid,
      frameworksBuildPhaseUuid,
      projectRoot
    );

    // 10. Add product to Products group
    addProductToProductsGroup(xcodeProject, productUuid, targetName);

    // 11. Add Network Extension as dependency and embed it in main app
    addNetworkExtensionDependency(
      xcodeProject,
      targetUuid,
      productUuid,
      targetName
    );

    console.log(
      `✅ Successfully created Network Extension target with UUID: ${targetUuid}`
    );
  } catch (error) {
    console.error("❌ Failed to create Network Extension target:", error);
    throw error;
  }
}

/**
 * Create a Network Extension target using a simpler approach
 */
async function createNetworkExtensionTargetSimple(
  xcodeProject: XcodeProject,
  bundleIdentifier: string,
  projectRoot: string
): Promise<void> {
  console.log(
    "🔧 Creating WireGuard Network Extension target (simplified approach)..."
  );

  const extensionBundleId = `${bundleIdentifier}.network-extension`;
  const targetName = NSE_TARGET_NAME;

  try {
    // Build paths to files - check if we're in development mode (example project) or production (installed via npm)
    const moduleBasePath = `${projectRoot}/node_modules/expo-wireguard/ios`;
    const developmentBasePath = `${projectRoot}/../ios`; // For example project

    // Check which path exists (development vs production)
    const isDevMode = fs.existsSync(
      `${projectRoot}/../ios/src/WireGuardNetworkExtension`
    );
    const basePath = isDevMode ? developmentBasePath : moduleBasePath;

    console.log(
      `📁 Using ${isDevMode ? "development" : "production"} file paths: ${basePath}`
    );

    // Use the xcode library's addTarget method
    const target = xcodeProject.addTarget(
      targetName,
      "app_extension",
      targetName
    );

    if (!target) {
      throw new Error("Failed to add target using xcode library");
    }

    console.log(`✅ Added target: ${targetName}`);

    // Add source files - first copy them to project directory, then add to Xcode
    const sourceFiles = [
      {
        path: `${basePath}/src/WireGuardNetworkExtension/PacketTunnelProvider.swift`,
        fileName: "PacketTunnelProvider.swift",
      },
    ];

    // Ensure the target directory exists
    const targetDir = `${projectRoot}/ios/WireGuardNetworkExtension`;
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    sourceFiles.forEach((file) => {
      try {
        if (fs.existsSync(file.path)) {
          // Copy the source file to the project directory
          const destPath = `${targetDir}/${file.fileName}`;
          fs.copyFileSync(file.path, destPath);
          console.log(`✅ Copied ${file.fileName} to project`);

          // Add it to the Xcode project manually using low-level APIs
          try {
            const relativeSourcePath = `WireGuardNetworkExtension/${file.fileName}`;
            addSourceFileToNetworkExtensionTarget(
              xcodeProject,
              target.uuid,
              relativeSourcePath,
              file.fileName
            );
            console.log(`✅ Added ${file.fileName} to Xcode target`);
          } catch (xcodeError) {
            console.warn(
              `⚠️ Could not add ${file.fileName} to Xcode project:`,
              xcodeError
            );
            console.log(
              `📋 Manual step required: Add ${destPath} to the WireGuardNetworkExtension target in Xcode`
            );
          }
        } else {
          console.warn(`⚠️ Source file not found: ${file.path}`);
        }
      } catch (error) {
        console.warn(`⚠️ Could not process ${file.fileName}:`, error);
      }
    });

    // Add Info.plist and entitlements files as resources (not compiled)
    const resourceFiles = [
      {
        path: `${basePath}/src/WireGuardNetworkExtension/Info.plist`,
        fileName: "Info.plist",
      },
      {
        path: `${basePath}/src/WireGuardNetworkExtension/WireGuardNetworkExtension.entitlements`,
        fileName: "WireGuardNetworkExtension.entitlements",
      },
    ];

    resourceFiles.forEach((file) => {
      try {
        if (fs.existsSync(file.path)) {
          const destPath = `${targetDir}/${file.fileName}`;
          if (file.fileName === "Info.plist") {
            // Rename to match what Xcode expects
            const finalDestPath = `${targetDir}/WireGuardNetworkExtension-Info.plist`;
            fs.copyFileSync(file.path, finalDestPath);
            console.log(`✅ Copied ${file.fileName} to ${finalDestPath}`);
          } else {
            fs.copyFileSync(file.path, destPath);
            console.log(`✅ Copied ${file.fileName} to ${destPath}`);
          }
        } else {
          console.warn(`⚠️ Resource file not found: ${file.path}`);
        }
      } catch (error) {
        console.warn(`⚠️ Could not copy ${file.fileName}:`, error);
      }
    });

    // Add frameworks manually to ensure they go to the Network Extension target
    console.log("🔧 Adding frameworks to Network Extension target...");

    try {
      // First ensure the Network Extension target has a frameworks build phase
      const targetObj = xcodeProject.pbxNativeTargetSection()[target.uuid];
      if (!targetObj) {
        throw new Error("Network Extension target not found");
      }

      // Check if frameworks build phase exists
      let frameworksBuildPhaseUuid = null;
      const buildPhases = targetObj.buildPhases || [];

      for (const phase of buildPhases) {
        const buildPhaseObj =
          xcodeProject.hash.project.objects.PBXFrameworksBuildPhase?.[
            phase.value
          ];
        if (buildPhaseObj) {
          frameworksBuildPhaseUuid = phase.value;
          break;
        }
      }

      // Create frameworks build phase if it doesn't exist
      if (!frameworksBuildPhaseUuid) {
        frameworksBuildPhaseUuid = xcodeProject
          .generateUuid()
          .replace(/-/g, "")
          .slice(0, 24);

        // Create the frameworks build phase
        const frameworksBuildPhases =
          xcodeProject.hash.project.objects.PBXFrameworksBuildPhase || {};
        frameworksBuildPhases[frameworksBuildPhaseUuid] = {
          isa: "PBXFrameworksBuildPhase",
          buildActionMask: 2147483647,
          files: [],
          runOnlyForDeploymentPostprocessing: 0,
        };
        frameworksBuildPhases[`${frameworksBuildPhaseUuid}_comment`] =
          "Frameworks";
        xcodeProject.hash.project.objects.PBXFrameworksBuildPhase =
          frameworksBuildPhases;

        // Add to target's build phases
        targetObj.buildPhases.push({
          value: frameworksBuildPhaseUuid,
          comment: "Frameworks",
        });

        console.log("✅ Created Frameworks build phase for Network Extension");
      }

      // Now add frameworks to the Network Extension target specifically
      addFrameworkToNetworkExtensionTarget(
        xcodeProject,
        target.uuid,
        frameworksBuildPhaseUuid,
        "NetworkExtension.framework",
        true
      );

      const frameworkPath = isDevMode
        ? `${projectRoot}/../ios/Frameworks/wg-go.xcframework`
        : `${projectRoot}/node_modules/expo-wireguard/ios/Frameworks/wg-go.xcframework`;

      if (fs.existsSync(frameworkPath)) {
        addFrameworkToNetworkExtensionTarget(
          xcodeProject,
          target.uuid,
          frameworksBuildPhaseUuid,
          frameworkPath,
          false
        );
        console.log("✅ Added wg-go.xcframework to Network Extension target");
      } else {
        console.warn(`⚠️ Framework not found: ${frameworkPath}`);
      }
    } catch (error) {
      console.warn(
        "⚠️ Could not add frameworks to Network Extension target:",
        error
      );
    }

    // Configure build settings manually using low-level APIs
    console.log("🔧 Configuring Network Extension build settings...");
    try {
      const targetObj = xcodeProject.pbxNativeTargetSection()[target.uuid];
      if (!targetObj?.buildConfigurationList) {
        console.warn(
          "⚠️ Could not find build configuration list for Network Extension target"
        );
        return;
      }

      const configList =
        xcodeProject.pbxXCConfigurationList()[targetObj.buildConfigurationList];
      if (!configList?.buildConfigurations) {
        console.warn(
          "⚠️ Invalid build configuration list for Network Extension target"
        );
        return;
      }

      const buildConfigIds = configList.buildConfigurations.map(
        (config: any) => config.value
      );
      const configurations = xcodeProject.pbxXCBuildConfigurationSection();

      // Update each build configuration for this target
      buildConfigIds.forEach((configId: string) => {
        const config = configurations[configId];
        if (!config?.buildSettings) return;

        const configName = config.name;
        console.log(
          `🔧 Configuring ${configName} build settings for Network Extension...`
        );

        // Set all required build settings
        config.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = extensionBundleId; // No quotes around bundle ID
        config.buildSettings.INFOPLIST_FILE =
          "WireGuardNetworkExtension/WireGuardNetworkExtension-Info.plist";
        config.buildSettings.CODE_SIGN_ENTITLEMENTS =
          "WireGuardNetworkExtension/WireGuardNetworkExtension.entitlements";
        config.buildSettings.CODE_SIGN_STYLE = "Automatic";
        config.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
        config.buildSettings.SWIFT_VERSION = "5.0";
        config.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = "14.0";
        config.buildSettings.SKIP_INSTALL = "YES";
        config.buildSettings.ENABLE_BITCODE = "NO";

        console.log(
          `✅ Configured ${configName} build settings for Network Extension`
        );
      });
    } catch (error) {
      console.warn(
        "⚠️ Could not configure Network Extension build settings:",
        error
      );
    }

    console.log(
      `✅ Successfully created Network Extension target: ${targetName}`
    );
  } catch (error) {
    console.error("❌ Failed to create Network Extension target:", error);
    throw error;
  }
}

/**
 * Create Sources build phase
 */
function createSourcesBuildPhase(
  xcodeProject: XcodeProject,
  buildPhaseUuid: string
): void {
  const buildPhases =
    xcodeProject.hash.project.objects.PBXSourcesBuildPhase || {};
  buildPhases[buildPhaseUuid] = {
    isa: "PBXSourcesBuildPhase",
    buildActionMask: 2147483647,
    files: [],
    runOnlyForDeploymentPostprocessing: 0,
  };
  buildPhases[`${buildPhaseUuid}_comment`] = "Sources";
  xcodeProject.hash.project.objects.PBXSourcesBuildPhase = buildPhases;
}

/**
 * Create Frameworks build phase
 */
function createFrameworksBuildPhase(
  xcodeProject: XcodeProject,
  buildPhaseUuid: string
): void {
  const frameworksBuildPhases =
    xcodeProject.hash.project.objects.PBXFrameworksBuildPhase || {};
  frameworksBuildPhases[buildPhaseUuid] = {
    isa: "PBXFrameworksBuildPhase",
    buildActionMask: 2147483647,
    files: [],
    runOnlyForDeploymentPostprocessing: 0,
  };
  frameworksBuildPhases[`${buildPhaseUuid}_comment`] = "Frameworks";
  xcodeProject.hash.project.objects.PBXFrameworksBuildPhase =
    frameworksBuildPhases;
}

/**
 * Add product to Products group
 */
function addProductToProductsGroup(
  xcodeProject: XcodeProject,
  productUuid: string,
  targetName: string
): void {
  try {
    // Find the Products group
    const groups = xcodeProject.hash.project.objects.PBXGroup || {};
    const productsGroup = Object.keys(groups).find(
      (key) => !key.includes("_comment") && groups[key].name === "Products"
    );

    if (productsGroup && groups[productsGroup].children) {
      groups[productsGroup].children.push({
        value: productUuid,
        comment: `${targetName}.appex`,
      });
      console.log("✅ Added product to Products group");
    }
  } catch (error) {
    console.warn("⚠️ Could not add product to Products group:", error);
  }
}

/**
 * Get build settings for the Network Extension target
 */
function getNetworkExtensionBuildSettings(
  bundleIdentifier: string,
  configName: string
): Record<string, any> {
  const isDebug = configName === "Debug";

  return {
    PRODUCT_BUNDLE_IDENTIFIER: bundleIdentifier,
    INFOPLIST_FILE: "Info.plist",
    CODE_SIGN_ENTITLEMENTS: "WireGuardNetworkExtension.entitlements",
    CODE_SIGN_STYLE: "Automatic",
    TARGETED_DEVICE_FAMILY: '"1,2"',
    SWIFT_VERSION: "5.0",
    IPHONEOS_DEPLOYMENT_TARGET: "14.0",
    SKIP_INSTALL: "YES",
    ENABLE_BITCODE: "NO",
    FRAMEWORK_SEARCH_PATHS: '"$(inherited) $(PROJECT_DIR)/Frameworks"',
    OTHER_LDFLAGS: '"$(inherited) -framework wg-go"',
    LD_RUNPATH_SEARCH_PATHS:
      '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
    ...(isDebug
      ? {
          SWIFT_OPTIMIZATION_LEVEL: "-Onone",
          SWIFT_ACTIVE_COMPILATION_CONDITIONS: "DEBUG",
        }
      : {
          SWIFT_OPTIMIZATION_LEVEL: "-O",
          SWIFT_COMPILATION_MODE: "wholemodule",
        }),
  };
}

/**
 * Add required files to the Network Extension target
 */
function addNetworkExtensionFiles(
  xcodeProject: XcodeProject,
  targetUuid: string,
  sourcesBuildPhaseUuid: string,
  projectRoot: string
): void {
  // Build paths to files - check if we're in development mode (example project) or production (installed via npm)
  const moduleBasePath = `${projectRoot}/node_modules/expo-wireguard/ios`;
  const developmentBasePath = `${projectRoot}/../ios`; // For example project

  // Check which path exists (development vs production)
  const isDevMode = fs.existsSync(
    `${projectRoot}/../ios/src/WireGuardNetworkExtension`
  );
  const basePath = isDevMode ? developmentBasePath : moduleBasePath;

  console.log(
    `📁 Using ${isDevMode ? "development" : "production"} file paths: ${basePath}`
  );

  const requiredFiles = [
    {
      path: `${basePath}/src/WireGuardNetworkExtension/PacketTunnelProvider.swift`,
      fileName: "PacketTunnelProvider.swift",
      type: "sourcecode.swift",
      addToSources: true,
    },
    {
      path: `${basePath}/src/WireGuardNetworkExtension/Info.plist`,
      fileName: "Info.plist",
      type: "text.plist.xml",
      addToSources: false,
    },
    {
      path: `${basePath}/src/WireGuardNetworkExtension/WireGuardNetworkExtension.entitlements`,
      fileName: "WireGuardNetworkExtension.entitlements",
      type: "text.plist.entitlements",
      addToSources: false,
    },
  ];

  requiredFiles.forEach((file) => {
    try {
      // Add file reference
      const fileRefUuid = xcodeProject
        .generateUuid()
        .replace(/-/g, "")
        .slice(0, 24);
      const fileRefs = xcodeProject.pbxFileReferenceSection();

      fileRefs[fileRefUuid] = {
        isa: "PBXFileReference",
        lastKnownFileType: file.type,
        name: file.fileName,
        path: file.path,
        sourceTree: "<absolute>",
      };
      fileRefs[`${fileRefUuid}_comment`] = file.fileName;

      // Add to sources build phase if it's a source file
      if (file.addToSources) {
        const buildFileUuid = xcodeProject
          .generateUuid()
          .replace(/-/g, "")
          .slice(0, 24);
        const buildFiles = xcodeProject.pbxBuildFileSection();

        buildFiles[buildFileUuid] = {
          isa: "PBXBuildFile",
          fileRef: fileRefUuid,
        };
        buildFiles[`${buildFileUuid}_comment`] = `${file.fileName} in Sources`;

        // Add to sources build phase
        const buildPhases =
          xcodeProject.hash.project.objects.PBXSourcesBuildPhase || {};
        if (
          buildPhases[sourcesBuildPhaseUuid] &&
          buildPhases[sourcesBuildPhaseUuid].files
        ) {
          buildPhases[sourcesBuildPhaseUuid].files.push({
            value: buildFileUuid,
            comment: `${file.fileName} in Sources`,
          });
        }
      }

      // Add to WireGuardNetworkExtension group
      addFileToGroup(
        xcodeProject,
        fileRefUuid,
        file.fileName,
        "WireGuardNetworkExtension"
      );

      console.log(`✅ Added ${file.fileName} to Network Extension target`);
    } catch (error) {
      console.warn(`⚠️ Could not add ${file.fileName} to target:`, error);
    }
  });
}

/**
 * Add file to a specific group in the project
 */
function addFileToGroup(
  xcodeProject: XcodeProject,
  fileUuid: string,
  fileName: string,
  groupName: string
): void {
  try {
    const groups = xcodeProject.hash.project.objects.PBXGroup || {};

    // Find or create the group
    let targetGroupKey = Object.keys(groups).find(
      (key) => !key.includes("_comment") && groups[key].name === groupName
    );

    if (!targetGroupKey) {
      // Create the group if it doesn't exist
      targetGroupKey = xcodeProject.generateUuid();

      if (targetGroupKey) {
        groups[targetGroupKey] = {
          isa: "PBXGroup",
          children: [],
          name: groupName,
          sourceTree: '"<group>"',
        };
        groups[`${targetGroupKey}_comment`] = groupName;

        // Add group to main group
        const mainGroup = xcodeProject.getFirstProject().firstProject.mainGroup;
        const mainGroupObj = groups[mainGroup];
        if (mainGroupObj && mainGroupObj.children) {
          mainGroupObj.children.push({
            value: targetGroupKey,
            comment: groupName,
          });
        }
      }
    }

    // Add file to group
    if (targetGroupKey) {
      const targetGroup = groups[targetGroupKey];
      if (targetGroup && targetGroup.children) {
        targetGroup.children.push({
          value: fileUuid,
          comment: fileName,
        });
      }
    }
  } catch (error) {
    console.warn(`⚠️ Could not add file to group ${groupName}:`, error);
  }
}

/**
 * Add required frameworks to the Network Extension target
 */
function addNetworkExtensionFrameworks(
  xcodeProject: XcodeProject,
  targetUuid: string,
  frameworksBuildPhaseUuid: string,
  projectRoot: string
): void {
  // Build paths to frameworks - check if we're in development mode or production
  const moduleFrameworkPath = `${projectRoot}/node_modules/expo-wireguard/ios/Frameworks/wg-go.xcframework`;
  const developmentFrameworkPath = `${projectRoot}/../ios/Frameworks/wg-go.xcframework`;

  // Check which path exists (development vs production)
  const isDevMode = fs.existsSync(
    `${projectRoot}/../ios/Frameworks/wg-go.xcframework`
  );
  const frameworkPath = isDevMode
    ? developmentFrameworkPath
    : moduleFrameworkPath;

  console.log(
    `📁 Using ${isDevMode ? "development" : "production"} framework path: ${frameworkPath}`
  );

  const frameworks = [
    {
      name: "NetworkExtension.framework",
      isSystem: true,
      settings: { ATTRIBUTES: ["Required"] },
    },
    {
      name: "wg-go.xcframework",
      isSystem: false,
      path: frameworkPath,
      settings: { ATTRIBUTES: ["Required"] },
    },
  ];

  frameworks.forEach((framework) => {
    try {
      // Add framework reference
      const frameworkRefUuid = xcodeProject
        .generateUuid()
        .replace(/-/g, "")
        .slice(0, 24);
      const fileRefs = xcodeProject.pbxFileReferenceSection();

      if (framework.isSystem) {
        // System framework
        fileRefs[frameworkRefUuid] = {
          isa: "PBXFileReference",
          lastKnownFileType: "wrapper.framework",
          name: framework.name,
          path: `System/Library/Frameworks/${framework.name}`,
          sourceTree: "SDKROOT",
        };
      } else {
        // Local framework - use absolute path
        fileRefs[frameworkRefUuid] = {
          isa: "PBXFileReference",
          lastKnownFileType: "wrapper.xcframework",
          name: framework.name,
          path: framework.path!,
          sourceTree: "<absolute>",
        };
      }
      fileRefs[`${frameworkRefUuid}_comment`] = framework.name;

      // Add to frameworks build phase
      const buildFileUuid = xcodeProject
        .generateUuid()
        .replace(/-/g, "")
        .slice(0, 24);
      const buildFiles = xcodeProject.pbxBuildFileSection();

      buildFiles[buildFileUuid] = {
        isa: "PBXBuildFile",
        fileRef: frameworkRefUuid,
        settings: framework.settings,
      };
      buildFiles[`${buildFileUuid}_comment`] =
        `${framework.name} in Frameworks`;

      // Add to frameworks build phase
      const buildPhases =
        xcodeProject.hash.project.objects.PBXFrameworksBuildPhase || {};
      if (
        buildPhases[frameworksBuildPhaseUuid] &&
        buildPhases[frameworksBuildPhaseUuid].files
      ) {
        buildPhases[frameworksBuildPhaseUuid].files.push({
          value: buildFileUuid,
          comment: `${framework.name} in Frameworks`,
        });
      }

      // Add framework to Frameworks group if it's not a system framework
      if (!framework.isSystem) {
        addFileToGroup(
          xcodeProject,
          frameworkRefUuid,
          framework.name,
          "Frameworks"
        );
      }

      console.log(`✅ Added ${framework.name} to Network Extension target`);
    } catch (error) {
      console.warn(`⚠️ Could not add ${framework.name} to target:`, error);
    }
  });
}

/**
 * Add a framework to the Network Extension target specifically
 */
function addFrameworkToNetworkExtensionTarget(
  xcodeProject: XcodeProject,
  targetUuid: string,
  frameworksBuildPhaseUuid: string,
  frameworkPath: string,
  isSystemFramework: boolean
): void {
  try {
    // Generate UUIDs for file reference and build file
    const fileRefUuid = xcodeProject
      .generateUuid()
      .replace(/-/g, "")
      .slice(0, 24);
    const buildFileUuid = xcodeProject
      .generateUuid()
      .replace(/-/g, "")
      .slice(0, 24);

    // Add file reference
    const fileRefs = xcodeProject.pbxFileReferenceSection();
    const frameworkName = frameworkPath.split("/").pop() || frameworkPath;

    if (isSystemFramework) {
      // System framework
      fileRefs[fileRefUuid] = {
        isa: "PBXFileReference",
        lastKnownFileType: "wrapper.framework",
        name: frameworkName,
        path: `System/Library/Frameworks/${frameworkName}`,
        sourceTree: "SDKROOT",
      };
    } else {
      // Local framework - use absolute path
      fileRefs[fileRefUuid] = {
        isa: "PBXFileReference",
        lastKnownFileType: "wrapper.xcframework",
        name: frameworkName,
        path: frameworkPath,
        sourceTree: '"<absolute>"',
      };
    }
    fileRefs[`${fileRefUuid}_comment`] = frameworkName;

    // Add build file
    const buildFiles = xcodeProject.pbxBuildFileSection();
    buildFiles[buildFileUuid] = {
      isa: "PBXBuildFile",
      fileRef: fileRefUuid,
      settings: { ATTRIBUTES: ["Required"] },
    };
    buildFiles[`${buildFileUuid}_comment`] = `${frameworkName} in Frameworks`;

    // Add to frameworks build phase
    const frameworksBuildPhases =
      xcodeProject.hash.project.objects.PBXFrameworksBuildPhase || {};
    const buildPhase = frameworksBuildPhases[frameworksBuildPhaseUuid];
    if (buildPhase && buildPhase.files) {
      buildPhase.files.push({
        value: buildFileUuid,
        comment: `${frameworkName} in Frameworks`,
      });
    }

    // Add framework to Frameworks group if it's not a system framework
    if (!isSystemFramework) {
      addFileToGroup(xcodeProject, fileRefUuid, frameworkName, "Frameworks");
    }

    console.log(`✅ Added ${frameworkName} to Network Extension target`);
  } catch (error) {
    console.warn(
      `⚠️ Could not add ${frameworkPath} to Network Extension target:`,
      error
    );
  }
}

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
 * Add Network Extension as dependency and embed it in main app
 */
function addNetworkExtensionDependency(
  xcodeProject: XcodeProject,
  extensionTargetUuid: string,
  extensionProductUuid: string,
  extensionTargetName: string
): void {
  try {
    console.log("🔗 Adding Network Extension as dependency to main app...");

    // Find the main app target
    const mainTarget = findMainTarget(xcodeProject);
    if (!mainTarget) {
      console.error(
        "❌ Could not find main app target to add Network Extension dependency"
      );
      return;
    }

    console.log(
      `🎯 Found main target: ${mainTarget.name} (${mainTarget.uuid})`
    );

    // 1. Create target dependency
    const dependencyUuid = xcodeProject
      .generateUuid()
      .replace(/-/g, "")
      .slice(0, 24);
    const targetDependencies =
      xcodeProject.hash.project.objects.PBXTargetDependency || {};

    targetDependencies[dependencyUuid] = {
      isa: "PBXTargetDependency",
      target: extensionTargetUuid,
      targetProxy: createContainerItemProxy(
        xcodeProject,
        extensionTargetUuid,
        extensionTargetName
      ),
    };
    targetDependencies[`${dependencyUuid}_comment`] = `PBXTargetDependency`;
    xcodeProject.hash.project.objects.PBXTargetDependency = targetDependencies;

    // 2. Add dependency to main target
    const mainTargetObj =
      xcodeProject.pbxNativeTargetSection()[mainTarget.uuid];
    if (mainTargetObj) {
      if (!mainTargetObj.dependencies) {
        mainTargetObj.dependencies = [];
      }
      mainTargetObj.dependencies.push({
        value: dependencyUuid,
        comment: `PBXTargetDependency`,
      });
      console.log(`✅ Added target dependency to ${mainTarget.name}`);
    }

    // 3. Create embed app extensions build phase
    const embedBuildPhaseUuid = xcodeProject
      .generateUuid()
      .replace(/-/g, "")
      .slice(0, 24);
    const copyFilesBuildPhases =
      xcodeProject.hash.project.objects.PBXCopyFilesBuildPhase || {};

    // Create build file for the extension product
    const buildFileUuid = xcodeProject
      .generateUuid()
      .replace(/-/g, "")
      .slice(0, 24);
    const buildFiles = xcodeProject.pbxBuildFileSection();

    buildFiles[buildFileUuid] = {
      isa: "PBXBuildFile",
      fileRef: extensionProductUuid,
      settings: {
        ATTRIBUTES: ["RemoveHeadersOnCopy"],
      },
    };
    buildFiles[`${buildFileUuid}_comment`] =
      `${extensionTargetName}.appex in Embed App Extensions`;

    // Create the embed build phase
    copyFilesBuildPhases[embedBuildPhaseUuid] = {
      isa: "PBXCopyFilesBuildPhase",
      buildActionMask: 2147483647,
      dstPath: "",
      dstSubfolderSpec: 13, // App Extensions folder
      files: [
        {
          value: buildFileUuid,
          comment: `${extensionTargetName}.appex in Embed App Extensions`,
        },
      ],
      name: "Embed App Extensions",
      runOnlyForDeploymentPostprocessing: 0,
    };
    copyFilesBuildPhases[`${embedBuildPhaseUuid}_comment`] =
      "Embed App Extensions";
    xcodeProject.hash.project.objects.PBXCopyFilesBuildPhase =
      copyFilesBuildPhases;

    // 4. Add embed build phase to main target
    if (mainTargetObj && mainTargetObj.buildPhases) {
      mainTargetObj.buildPhases.push({
        value: embedBuildPhaseUuid,
        comment: "Embed App Extensions",
      });
      console.log(
        `✅ Added Embed App Extensions build phase to ${mainTarget.name}`
      );
    }

    console.log(
      "✅ Successfully configured Network Extension dependency and embedding"
    );
  } catch (error) {
    console.error("❌ Failed to add Network Extension dependency:", error);
    throw error;
  }
}

/**
 * Create container item proxy for target dependency
 */
function createContainerItemProxy(
  xcodeProject: XcodeProject,
  targetUuid: string,
  targetName: string
): string {
  const proxyUuid = xcodeProject.generateUuid().replace(/-/g, "").slice(0, 24);
  const containerItemProxies =
    xcodeProject.hash.project.objects.PBXContainerItemProxy || {};

  // Get the project reference
  const projectRef = xcodeProject.getFirstProject().uuid;

  containerItemProxies[proxyUuid] = {
    isa: "PBXContainerItemProxy",
    containerPortal: projectRef,
    proxyType: 1,
    remoteGlobalIDString: targetUuid,
    remoteInfo: targetName,
  };
  containerItemProxies[`${proxyUuid}_comment`] = `PBXContainerItemProxy`;
  xcodeProject.hash.project.objects.PBXContainerItemProxy =
    containerItemProxies;

  return proxyUuid;
}

/**
 * Manually add a source file to the Network Extension target
 */
function addSourceFileToNetworkExtensionTarget(
  xcodeProject: XcodeProject,
  targetUuid: string,
  relativePath: string,
  fileName: string
): void {
  try {
    // Generate UUIDs for file reference and build file
    const fileRefUuid = xcodeProject
      .generateUuid()
      .replace(/-/g, "")
      .slice(0, 24);
    const buildFileUuid = xcodeProject
      .generateUuid()
      .replace(/-/g, "")
      .slice(0, 24);

    // Add file reference
    const fileRefs = xcodeProject.pbxFileReferenceSection();
    fileRefs[fileRefUuid] = {
      isa: "PBXFileReference",
      lastKnownFileType: "sourcecode.swift",
      name: fileName,
      path: relativePath,
      sourceTree: '"<group>"',
    };
    fileRefs[`${fileRefUuid}_comment`] = fileName;

    // Add build file
    const buildFiles = xcodeProject.pbxBuildFileSection();
    buildFiles[buildFileUuid] = {
      isa: "PBXBuildFile",
      fileRef: fileRefUuid,
    };
    buildFiles[`${buildFileUuid}_comment`] = `${fileName} in Sources`;

    // Find the Network Extension target's sources build phase
    const targetObj = xcodeProject.pbxNativeTargetSection()[targetUuid];
    if (!targetObj || !targetObj.buildPhases) {
      throw new Error("Network Extension target or build phases not found");
    }

    // Find the sources build phase
    let sourcesBuildPhaseUuid = null;
    for (const phase of targetObj.buildPhases) {
      const buildPhaseObj =
        xcodeProject.hash.project.objects.PBXSourcesBuildPhase?.[phase.value];
      if (buildPhaseObj) {
        sourcesBuildPhaseUuid = phase.value;
        break;
      }
    }

    if (!sourcesBuildPhaseUuid) {
      // Create sources build phase if it doesn't exist
      sourcesBuildPhaseUuid = xcodeProject
        .generateUuid()
        .replace(/-/g, "")
        .slice(0, 24);

      const sourcesBuildPhases =
        xcodeProject.hash.project.objects.PBXSourcesBuildPhase || {};
      sourcesBuildPhases[sourcesBuildPhaseUuid] = {
        isa: "PBXSourcesBuildPhase",
        buildActionMask: 2147483647,
        files: [],
        runOnlyForDeploymentPostprocessing: 0,
      };
      sourcesBuildPhases[`${sourcesBuildPhaseUuid}_comment`] = "Sources";
      xcodeProject.hash.project.objects.PBXSourcesBuildPhase =
        sourcesBuildPhases;

      // Add to target's build phases
      targetObj.buildPhases.push({
        value: sourcesBuildPhaseUuid,
        comment: "Sources",
      });
    }

    // Add build file to sources build phase
    const sourcesBuildPhases =
      xcodeProject.hash.project.objects.PBXSourcesBuildPhase || {};
    const buildPhase = sourcesBuildPhases[sourcesBuildPhaseUuid];
    if (buildPhase && buildPhase.files) {
      buildPhase.files.push({
        value: buildFileUuid,
        comment: `${fileName} in Sources`,
      });
    }

    // Add file to WireGuardNetworkExtension group
    addFileToGroup(
      xcodeProject,
      fileRefUuid,
      fileName,
      "WireGuardNetworkExtension"
    );

    console.log(`✅ Manually added ${fileName} to Network Extension target`);
  } catch (error) {
    console.warn(
      `⚠️ Could not manually add ${fileName} to Network Extension target:`,
      error
    );
    throw error;
  }
}

export default withWireGuardNetworkExtension;
