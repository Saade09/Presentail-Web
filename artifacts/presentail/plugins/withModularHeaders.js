const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

/**
 * Inserts `use_modular_headers!` into the Expo-generated Podfile.
 *
 * Required on Xcode 26.0 (EAS image macos-sequoia-15.6-xcode-26.0):
 * AppCheckCore is a Swift pod that depends on GoogleUtilities and
 * RecaptchaInterop. Xcode 26 enforces that those Obj-C pods expose
 * module maps when imported from Swift. `use_modular_headers!` tells
 * CocoaPods to generate those maps for every pod in the workspace.
 */
module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        'Podfile'
      );
      let podfile = fs.readFileSync(podfilePath, 'utf-8');
      if (!podfile.includes('use_modular_headers!')) {
        podfile = podfile.replace(
          /^(platform :ios, '[^']*')/m,
          "$1\nuse_modular_headers!"
        );
        fs.writeFileSync(podfilePath, podfile);
        console.log('[withModularHeaders] Added use_modular_headers! to Podfile');
      } else {
        console.log('[withModularHeaders] use_modular_headers! already present, skipping');
      }
      return config;
    },
  ]);
};
