const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    icon: 'assets/app',
    extendInfo: {
      NSUserNotificationUsageDescription: "Notification permission is required for message alerts.",
      NSScreenCaptureUsageDescription: "Screen capture permission is required for screenshot and OCR features."
    },
    // Ensure native modules and Tesseract.js files are properly handled
    ignore: [
      /^\/node_modules\/tesseract\.js\/.*\.worker\.js$/,
      /^\/node_modules\/tesseract\.js\/.*\.wasm$/,
      /^\/node_modules\/tesseract\.js\/.*\.traineddata$/,
      /^\/node_modules\/tesseract\.js\/.*\.js\.map$/,
      /^\/node_modules\/tesseract\.js\/.*\.worker\.js\.map$/
    ]
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
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: true, // Enable Node.js integration for native modules
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: true, // Enable Node options
      [FuseV1Options.EnableNodeCliInspectArguments]: true, // Enable Node CLI arguments
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  appBundleId: "com.sylvan.otools"
};
