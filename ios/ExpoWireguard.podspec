require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoWireguard'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.swift_version  = '5.4'
  s.source         = { git: 'https://github.com/norenz92/expo-wireguard' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.vendored_frameworks = 'Frameworks/Wireguard.xcframework'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    'HEADER_SEARCH_PATHS' => '"$(PODS_TARGET_SRCROOT)/Frameworks/Wireguard.xcframework/ios-arm64/Headers" "$(PODS_TARGET_SRCROOT)/Frameworks/Wireguard.xcframework/ios-arm64-simulator/Headers"',
    # Disable the module map to prevent redefinition errors
    'CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES' => 'YES',
    'MODULEMAP_FILE' => ''
  }

  # The following script runs during installation to handle module map conflicts
  s.prepare_command = <<-CMD
    # Rename or remove conflicting module maps to prevent redefinition errors
    find ./Frameworks/Wireguard.xcframework -name "module.modulemap" -exec rm {} \\;
  CMD

  s.source_files = 'src/**/*.{h,m,mm,swift,hpp,cpp}'
end
