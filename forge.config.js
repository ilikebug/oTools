const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');

module.exports = {
  packagerConfig: {
    asar: {
      unpack: '**/*.traineddata'
    },
    icon: 'assets/app',
    extendInfo: {
      NSUserNotificationUsageDescription: "Notification permission is required for message alerts.",
      NSScreenCaptureUsageDescription: "Screen capture permission is required for screenshot and OCR features."
    },
    appBundleId: "com.sylvan.otools",
    extraResource: ["chi_sim.traineddata", "eng.traineddata"],
    // Exclude unnecessary files and directories
    ignore: [
      /^\/\.git/,
      /^\/\.gitignore$/,
      /^\/\.vscode/,
      /^\/\.DS_Store$/,
      /^\/README\.md$/,
      /^\/oTools-Plugins\.md$/,
      /^\/eslint\.config\.mjs$/,
      /^\/forge\.config\.js$/,
      /^\/out/,
      /^\/native/,
      /^\/node_modules\/electron($|\/)/,
      /^\/node_modules\/electron-winstaller($|\/)/,
      /^\/node_modules\/@electron-forge($|\/)/,
      /^\/node_modules\/eslint($|\/)/,
      /^\/node_modules\/@eslint($|\/)/,
      /^\/node_modules\/globals($|\/)/,
      // Exclude platform-specific dependencies
      /^\/node_modules\/.*\/build\/Release\/.*\.node$/,
      // Exclude source files
      /\.ts$/,
      /\.map$/,
      /\.spec\.js$/,
      /\.test\.js$/,
    ],
    // Only package production dependencies
    prune: true,
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {
        // Automatically unpack native modules
        unpackNativeModulesBeforeBuild: true,
      },
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false, // Disable RunAsNode for security
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false, // Disable in production
      [FuseV1Options.EnableNodeCliInspectArguments]: false, // Disable in production
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  // Add hooks for build optimization
  hooks: {
    prePackage: async (forgeConfig, options) => {
      console.log('Starting pre-package optimization...');
      // Custom optimization logic can be added here
    },
    postPackage: async (forgeConfig, options) => {
      const fs = require('fs');
      const path = require('path');
      
      // Calculate total size of application directory
      function getDirSize(dirPath) {
        let size = 0;
        try {
          const files = fs.readdirSync(dirPath);
          for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) {
              size += getDirSize(filePath);
            } else {
              size += stats.size;
            }
          }
        } catch (error) {
          console.warn('Error calculating directory size:', error.message);
        }
        return size;
      }
      
      const appPath = options.outputPaths[0];
      const totalSize = getDirSize(appPath);
      
      // Try to get app.asar size
      let asarSize = 0;
      try {
        const asarPath = path.join(appPath, 'oTools.app/Contents/Resources/app.asar');
        if (fs.existsSync(asarPath)) {
          asarSize = fs.statSync(asarPath).size;
        }
      } catch (error) {
        console.warn('Unable to get asar file size:', error.message);
      }
      
      console.log('Packaging completed!');
      console.log(`Total app size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
      if (asarSize > 0) {
        console.log(`app.asar size: ${(asarSize / 1024 / 1024).toFixed(2)} MB`);
      }
    },
  },
};
