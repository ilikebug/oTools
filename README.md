# oTools - 桌面工具管理中心 / oTools - Desktop Tool Management Center
# oTools - Desktop Tool Management Center

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/Platform-macOS-blue.svg)](https://www.apple.com/macos/)
[![Electron](https://img.shields.io/badge/Electron-37.1.0-green.svg)](https://electronjs.org/)

## 📖 项目简介 / Project Introduction

### 中文
oTools 是一个基于 Electron 的桌面工具管理中心，采用插件化架构设计。它提供了一个统一的界面来管理、配置和运行各种工具插件，让用户能够轻松扩展和定制自己的桌面工具集。

### English
oTools is an Electron-based desktop tool management center with a plugin architecture. It provides a unified interface for managing, configuring, and running various tool plugins, allowing users to easily extend and customize their desktop toolset.

## ✨ 主要功能 / Key Features

### 🔧 插件管理 / Plugin Management
- **插件安装与卸载 / Plugin Installation & Uninstallation**
- **插件启用/禁用 / Plugin Enable/Disable**
- **插件配置管理 / Plugin Configuration Management**
- **插件市场集成 / Plugin Market Integration**
- **插件窗口管理 / Plugin Window Management**

### ⌨️ 快捷键系统 / Shortcut System
- **全局快捷键 / Global Shortcuts**
- **自定义快捷键 / Custom Shortcuts**
- **快捷键热重载 / Hot Reload Shortcuts**

### 📊 状态监控 / Status Monitoring
- **应用运行状态 / Application Running Status**
- **插件运行统计 / Plugin Running Statistics**
- **实时状态更新 / Real-time Status Updates**

### 🔐 配置管理 / Configuration Management
- **GitHub Token 管理 / GitHub Token Management**
- **应用设置 / Application Settings**
- **插件配置 / Plugin Configuration**
- **自动启动设置 / Auto-start Settings**

### 🛠️ 系统工具 / System Tools
- **截图功能 / Screenshot Functionality**
- **OCR 文字识别 / OCR Text Recognition**
- **剪贴板管理 / Clipboard Management**
- **文件操作 / File Operations**
- **系统通知 / System Notifications**

## 🚀 快速开始 / Quick Start

### 环境要求 / Requirements
- Node.js >= 18.x（推荐 / Recommended）
- Electron >= 25.x（推荐 37.x / Recommended 37.x）
- macOS 12+（仅支持 / Only supports macOS）

### 安装 / Installation

```bash
# 克隆项目 / Clone the project
git clone https://github.com/your-username/oTools.git
cd oTools

# 安装依赖 / Install dependencies
npm install

# 启动开发模式 / Start development mode
npm start
```

### 构建 / Build

```bash
# 打包应用 / Package the application
npm run package

# 制作安装包 / Make installer
npm run make
```

## 📦 插件开发 / Plugin Development

- 支持热重载 / Supports hot reload
- 插件独立依赖 / Independent plugin dependencies
- 主进程与渲染进程安全通信 / Secure main/renderer communication
- 插件市场一键集成 / One-click plugin market integration

[ oTools 插件开发详细指南 / oTools Plugin Development Detailed Guide ](./oTools-Plugins.md)

[ oTools Plugin Development Detailed Guide](./oTools-Plugins.md)


## 🏗️ 技术架构 / Technical Architecture

### 核心技术 / Core Technologies
- **Electron** - 跨平台桌面应用框架
- **Node.js** - JavaScript 运行时
- **Chokidar** - 文件系统监控
- **Tesseract.js** - OCR 文字识别
- **RobotJS** - 自动化操作

### 项目结构 / Project Structure

```
oTools/
├── src/
│   ├── main/           # 主进程 / Main process
│   │   ├── core/       # 核心模块 / Core modules
│   │   ├── utils/      # 工具函数 / Utility functions
│   │   └── ipc.js      # IPC 通信 / IPC communication
│   └── renderer/       # 渲染进程 / Renderer process
│       ├── index.html  # 主界面 / Main interface
│       ├── index.js    # 渲染逻辑 / Renderer logic
│       └── preload.js  # 预加载脚本 / Preload script
├── assets/             # 资源文件 / Assets
```

## 🔧 配置说明 / Configuration

### 主配置结构 / Main Configuration Structure

```json
{
  "app": {
    "name": "oTools",                // 应用名称 / Application name
    "version": "1.0.0",              // 版本号 / Version
    "debug": false,                   // 调试模式 / Debug mode
    "autoStart": true                 // 是否开机自启 / Auto start on system boot
  },
  "window": {
    "width": 400,                     // 主窗口宽度 / Main window width
    "height": 360,                    // 主窗口高度 / Main window height
    "alwaysOnTop": true,              // 窗口是否置顶 / Always on top
    "skipTaskbar": true               // 是否在任务栏隐藏 / Skip taskbar
  },
  "plugins": {
    "autoLoad": true,                 // 启动时自动加载插件 / Auto load plugins on startup
    "maxProcesses": 10,               // 最大插件进程数 / Max plugin processes
    "timeout": 30000                  // 插件超时时间（毫秒）/ Plugin timeout (ms)
  },
  "logger": {
    "level": "info",                  // 日志级别 / Log level (e.g. info, debug, error)
    "enableFile": true,               // 是否写入日志文件 / Enable file logging
    "logFile": "otools.log",          // 日志文件名 / Log file name
    "enableConsole": false            // 是否控制台输出日志 / Enable console logging
  },
  "shortcuts": {
    "toggle": "ALT+SPACE"             // 主界面显示/隐藏快捷键 / Main window toggle shortcut
  },
  "pluginMarket": {
    "debug": false                    // 插件市场调试模式 / Plugin market debug mode
  },
  "githubToken": "",                  // GitHub Token（用于插件访问 GitHub API）/ GitHub Token (for plugin GitHub API access)
  "customShortcuts": []               // 自定义插件快捷键列表 / Custom plugin shortcuts list
}
```

---

### 字段说明 / Field Descriptions

| 字段 / Field         | 说明 / Description |
|----------------------|-------------------|
| `app`                | 应用基础信息和启动设置 / Basic app info and startup settings |
| `window`             | 主窗口相关设置 / Main window settings |
| `plugins`            | 插件系统相关设置 / Plugin system settings |
| `logger`             | 日志系统相关设置 / Logger settings |
| `shortcuts`          | 全局快捷键设置 / Global shortcut settings |
| `pluginMarket`       | 插件市场相关设置 / Plugin market settings |
| `githubToken`        | GitHub 访问令牌 / GitHub access token |
| `customShortcuts`    | 自定义插件快捷键数组 / Custom plugin shortcut array |

---

### GitHub Token 说明 / GitHub Token Description

#### 中文
GitHub Token 用于插件访问 GitHub API，特别是从插件市场下载插件时。添加 GitHub Token 后，插件市场下载将不受 GitHub API 的速率限制（每小时 60 次请求限制）。

**如何获取 GitHub Token：**
1. 访问 [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. 点击 "Generate new token (classic)"
3. 设置 Token 描述（如：oTools Plugin Market）
4. 选择权限范围：
   - `public_repo` - 访问公共仓库
   - `read:packages` - 读取包信息
   - `repo` - 完整仓库访问（如果需要私有仓库）
5. 点击 "Generate token"
6. 复制生成的 Token 并粘贴到配置中

#### English
GitHub Token is used for plugins to access GitHub API, especially when downloading plugins from the plugin market. After adding a GitHub Token, plugin market downloads will not be subject to GitHub API rate limits (60 requests per hour limit).

**How to get GitHub Token:**
1. Visit [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Set Token description (e.g., oTools Plugin Market)
4. Select scopes:
   - `public_repo` - Access public repositories
   - `read:packages` - Read package information
   - `repo` - Full repository access (if private repos needed)
5. Click "Generate token"
6. Copy the generated Token and paste it into the configuration

---

### 自定义快捷键结构 / Custom Shortcut Structure

```json
[
  {
    "pluginName": "your-plugin-name", // 插件名 / Plugin name
    "accelerator": "Alt+Shift+S"     // 快捷键组合 / Shortcut key combination
  }
]
```

## 📋 开发计划 / Development Roadmap

### 已完成 / Completed
- ✅ 基础框架搭建 / Basic framework setup
- ✅ 插件管理系统 / Plugin management system
- ✅ 快捷键系统 / Shortcut system
- ✅ 配置管理 / Configuration management
- ✅ 截图和 OCR 功能 / Screenshot and OCR functionality

### 进行中 / In Progress
- 🔄 插件市场 / Plugin marketplace
- 🔄 更多系统工具 / More system tools
- 🔄 性能优化 / Performance optimization

### 计划中 / Planned
- 📅 插件开发 SDK / Plugin development SDK
- 📅 主题系统 / Theme system
- 📅 多语言支持 / Multi-language support
- 📅 云端同步 / Cloud synchronization

## 🤝 贡献指南 / Contributing

### 中文
我们欢迎所有形式的贡献！请查看我们的贡献指南：
1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

### English
We welcome all forms of contributions! Please check our contributing guidelines:
1. Fork the project
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 许可证 / License

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 作者 / Authors

- **ILikeBug** - *Initial work* - [GitHub](https://github.com/ILikeBug)

## 🙏 致谢 / Acknowledgments

### 中文
- Electron 团队提供的优秀框架
- 所有贡献者的支持
- 开源社区的力量

### English
- Excellent framework provided by the Electron team
- Support from all contributors
- The power of the open source community

---

**⭐ 如果这个项目对你有帮助，请给我们一个星标！**

**⭐ If this project helps you, please give us a star!** 

## ❓ 常见问题 / FAQ

### Q: 插件无法加载怎么办？ / What if a plugin fails to load?
A: 检查 plugin.json 配置、主程序日志、插件目录结构是否正确。/ Check plugin.json config, main app log, and plugin directory structure.

### Q: 如何查看主程序日志？ / How to view main app logs?
A: 日志文件位于用户目录下 oTools/logs/otools.log。/ Log file is located at oTools/logs/otools.log in your user directory.

### Q: 插件市场无法访问？ / Plugin market not accessible?
A: 检查网络连接，或配置 GitHub Token 以提升访问速率。/ Check your network connection, or configure a GitHub Token to improve access speed. 

### Q: macOS 下无法自动切换前台应用或 AppleScript 控制其他 App？ / Why can't oTools switch to the previous app or control other apps via AppleScript on macOS?
A: 
macOS 对自动化（Apple Events/Automation）权限有严格限制，未签名的 App 默认无法获得自动化权限，导致相关功能（如自动切换前台 App、AppleScript 控制其他 App）无法使用。
macOS has strict restrictions on Automation (Apple Events/Automation) permissions. Unsigned apps cannot obtain automation permissions by default, so features like switching to the previous app or controlling other apps via AppleScript may not work.

**解决办法 / Solution:**
1. **本地自签名 App / Locally sign the app**
   
   关闭 oTools 后，在终端执行（假设你的 App 路径为 /Applications/oTools.app）：
   After closing oTools, run in terminal (assuming your app path is /Applications/oTools.app):
   ```sh
   codesign --deep --force --sign - /Applications/oTools.app
   ```
   - `-` 代表 ad-hoc 签名，不需要开发者证书，仅用于本地测试。
   - '-' means ad-hoc signature, no developer certificate required, for local testing only.
   - 签名后重新打开 oTools，首次触发自动化操作时，macOS 会弹窗请求权限，请选择“允许”。
   - After signing, reopen oTools. When triggering automation for the first time, macOS will prompt for permission. Please choose "Allow".

2. **重置自动化权限 / Reset Automation Permissions**
   
   如果没有弹窗，或授权后依然无效，可以重置 AppleEvents 权限：
   If no prompt appears or permission still doesn't work, reset AppleEvents permissions:
   ```sh
   tccutil reset AppleEvents
   ```
   然后重新运行 oTools 并再次触发自动化操作，等待弹窗授权。
   Then rerun oTools and trigger automation again to get the prompt.

3. **检查系统设置 / Check System Settings**
   
   前往“系统设置 > 隐私与安全 > 自动化”，确保 oTools 已获得对应 App（如 System Events）的自动化权限。
   Go to "System Settings > Privacy & Security > Automation" and make sure oTools is allowed to control the required apps (such as System Events).

**说明 / Note:**
- 由于 macOS 安全策略，未签名的开源 App 只能通过本地自签名方式获得自动化权限。
- Because of macOS security policy, unsigned open source apps can only obtain automation permissions via local ad-hoc signing.
- 分发给其他用户时，也需要他们自行签名。
- Other users also need to sign the app themselves after downloading.
- 相关限制为 macOS 系统安全策略，非 oTools 项目本身问题。
- This is a macOS system security limitation, not an oTools project issue. 