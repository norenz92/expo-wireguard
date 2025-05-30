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
    'DEFINES_MODULE' => 'YES'
  }
  
  # Add WireGuard as Swift Package Manager dependency without user interaction
  spm_dependency(s,
    url: 'https://git.zx2c4.com/wireguard-apple',
    requirement: {kind: 'exactVersion', version: '1.0.15-26'},
    products: ['WireGuardKit']
  )
  
  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end