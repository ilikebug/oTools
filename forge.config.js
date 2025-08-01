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
    // 排除不需要的文件和目录
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
      // 排除不需要的平台特定依赖
      /^\/node_modules\/.*\/build\/Release\/.*\.node$/,
      // 排除源码文件
      /\.ts$/,
      /\.map$/,
      /\.spec\.js$/,
      /\.test\.js$/,
    ],
    // 只打包生产依赖
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
        // 自动解包原生模块
        unpackNativeModulesBeforeBuild: true,
      },
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false, // 禁用 RunAsNode 提升安全性
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false, // 生产环境禁用
      [FuseV1Options.EnableNodeCliInspectArguments]: false, // 生产环境禁用
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  // 添加钩子进行构建优化
  hooks: {
    prePackage: async (forgeConfig, options) => {
      console.log('开始预打包优化...');
      // 可以在这里添加自定义的优化逻辑
    },
    postPackage: async (forgeConfig, options) => {
      console.log('打包完成，应用大小:', 
        require('fs').statSync(options.outputPaths[0]).size / 1024 / 1024, 'MB');
    },
  },
};
