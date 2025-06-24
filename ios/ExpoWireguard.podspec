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

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  # Only include main module files, exclude Network Extension files
  s.source_files = 'src/**/*.{h,m,mm,swift,hpp,cpp}'
  s.exclude_files = "src/WireGuardNetworkExtension/**/*"
  
  # NOTE: wg-go.xcframework is NOT included here as it should only be linked to the Network Extension target
  # The config plugin will add it specifically to the Network Extension target to avoid module conflicts
  
  # Required iOS frameworks for main app VPN management (NOT including wg-go)
  s.frameworks = 'NetworkExtension', 'Security', 'SystemConfiguration'
end
