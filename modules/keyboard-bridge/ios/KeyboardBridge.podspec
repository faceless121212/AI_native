Pod::Spec.new do |s|
  s.name           = 'KeyboardBridge'
  s.version        = '0.1.0'
  s.summary        = 'Replywise app <-> keyboard bridge (App Group status, keyboard heartbeat)'
  s.description    = 'Local Expo module used by the Replywise app to read keyboard status.'
  s.author         = 'Replywise'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = { type: 'UNLICENSED' }
  s.platforms      = {
    :ios => '16.0'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
