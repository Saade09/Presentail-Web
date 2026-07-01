const path = require('path');
const fs = require('fs');

// Resolve @expo/config-plugins from the presentail package root (one level up
// from this plugins/ subdirectory) so pnpm's strict isolation doesn't block it.
const { withDangerousMod } = require(
  require.resolve('@expo/config-plugins', { paths: [path.join(__dirname, '..')] })
);

/**
 * Inserts `use_modular_headers!` into the Expo-generated Podfile.
 *
 * Required on Xcode 26.0 (EAS image macos-sequoia-15.6-xcode-26.0):
 * AppCheckCore is a Swift pod that depends on GoogleUtilities and
 * RecaptchaInterop. Xcode 26 enforces that those Obj-C pods expose module
 * maps when imported from Swift. `use_modular_headers!` tells CocoaPods to
 * generate those maps for every pod in the workspace.
 *
 * Expo SDK 54 generates: platform :ios, podfile_properties['ios.deploymentTarget'] || '15.1'
 * so the regex matches any `platform :ios` line regardless of what follows.
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

      if (podfile.includes('use_modular_headers!')) {
        console.log('[withModularHeaders] use_modular_headers! already present, skipping');
        return config;
      }

      // Match any `platform :ios ...` line (handles both literal strings and
      // variable expressions like podfile_properties['ios.deploymentTarget'])
      const patched = podfile.replace(
        /^(platform :ios[^\n]*)/m,
        '$1\nuse_modular_headers!'
      );

      if (patched === podfile) {
        // Fallback: insert before the first `target '...' do` block
        console.log('[withModularHeaders] platform :ios line not found, inserting before target block');
        podfile = podfile.replace(
          /^(target '[^']+' do)/m,
          "use_modular_headers!\n\n$1"
        );
      } else {
        podfile = patched;
      }

      fs.writeFileSync(podfilePath, podfile);
      console.log('[withModularHeaders] Added use_modular_headers! to Podfile');
      return config;
    },
  ]);
};
