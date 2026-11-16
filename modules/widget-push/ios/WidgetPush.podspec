Pod::Spec.new do |s|
  s.name           = 'WidgetPush'
  s.version        = '1.0.0'
  s.summary        = 'SuiviBaby : widgets posés (envoi des données du widget seulement si un widget existe)'
  s.description    = s.summary
  s.license        = 'UNLICENSED'
  s.author         = 'SuiviBaby'
  s.homepage       = 'https://suivibaby.app'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
