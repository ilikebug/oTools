# oTools 插件开发详细指南 / oTools Plugin Development Detailed Guide

---

## 目录 / Table of Contents

1. 插件基础结构 / Plugin Basic Structure
2. plugin.json 配置详解 / plugin.json Configuration
3. 主页面与预加载脚本 / Main Page & Preload Script
4. 插件生命周期与窗口管理 / Lifecycle & Window Management
5. 插件执行方式 / Plugin Execution Methods
6. 插件与主程序的 IPC 通信 / IPC Communication
7. IPC 接口与调用示例 / IPC APIs & Usage Examples
8. 插件开发与调试建议 / Development & Debugging Tips
9. 插件卸载与热重载 / Uninstall & Hot Reload
10. 常见问题与最佳实践 / FAQ & Best Practices
11. 进阶集成与扩展 / Advanced Integration & Extension
12. 示例插件结构 / Example Plugin Structure

---

## 1. 插件基础结构 / Plugin Basic Structure

每个插件是一个独立文件夹，位于 oTools 插件目录（`$UserData/oTools/plugins`）。/ Each plugin is an independent folder under the oTools plugins directory (`$UserData/oTools/plugins`).

**推荐结构 / Recommended Structure:**

```
my-plugin/
  ├── plugin.json         # 插件元信息配置 / Plugin metadata
  ├── index.html          # 主页面 / Main page
  ├── preload.js          # 预加载脚本 / Preload script
  ├── main.js             # 插件主逻辑 / Optional, plugin main logic
  ├── icon.png            # 插件图标 / Icon
  └── index.css           # 样式文件 / CSS
```

---

## 2. plugin.json 配置详解 / plugin.json Configuration Details

`plugin.json` 是插件的核心配置文件，决定插件的加载、窗口、UI 等行为。/ `plugin.json` is the core configuration file for the plugin, determining its loading, window, UI, and other behaviors.

**完整示例 / Full Example:**

```json
{
  "name": "screenshot-ocr",
  "shortName": "截图识别",
  "description": "截图并进行 OCR 文字识别",
  "version": "1.0.0",
  "author": "Your Name",
  "icon": "icon.png",
  "type": "custom",
  "enabled": true,
  "startupMode": "independent",
  "ui": {
    "html": "index.html",
    "preload": "preload.js",
    "width": 900,
    "height": 600,
    "title": "截图识别",
    "resizable": true,
    "alwaysOnTop": true
  }
}
```

**字段说明 / Field Description:**

| 字段 / Field      | 类型 / Type   | 说明 / Description |
|-------------------|--------------|--------------------|
| name              | string       | 插件英文唯一名（与文件夹一致）/ Unique English name (same as folder) |
| shortName         | string       | 插件中文名/简称 / Chinese name/short name |
| description       | string       | 插件功能描述 / Description |
| version           | string       | 版本号 / Version |
| author            | string       | 作者 / Author |
| icon              | string       | 图标文件名 / Icon filename |
| type              | string       | 插件类型（如 custom）/ Plugin type (e.g., custom) |
| enabled           | boolean      | 是否启用 / Enabled or not |
| startupMode       | string       | 启动模式：independent（独立窗口）/ dependent（后台常驻）/ Startup mode: independent (standalone window) / dependent (background) |
| ui                | object       | UI 配置 / UI configuration |
| └─ html           | string       | 主页面文件 / Main page file |
| └─ preload        | string       | 预加载脚本 / Preload script |
| └─ width/height   | number       | 窗口宽高 / Window width/height |
| └─ title          | string       | 窗口标题 / Window title |
| └─ resizable      | boolean      | 是否可调整大小 / Resizable |
| └─ alwaysOnTop    | boolean      | 是否窗口置顶 / Always on top |

---

## 3. 主页面与预加载脚本 / Main Page & Preload Script

### 3.1 index.html

插件主界面，支持标准 HTML/CSS/JS，可引入前端框架（如 Vue/React）。/ The plugin main page supports standard HTML/CSS/JS and can use frameworks like Vue/React.
可通过 `<script src="main.js"></script>` 引入主逻辑。/ You can include main logic via `<script src="main.js"></script>`.

### 3.2 preload.js

必须存在，负责安全地暴露 Node/Electron API 给渲染进程。/ Must exist, securely exposes Node/Electron APIs to the renderer.
推荐只暴露有限的 API，防止安全风险。/ Only expose limited APIs to prevent security risks.

**preload.js 示例 / Example:**

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('otools', {
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args)),
  invoke: (channel, data) => ipcRenderer.invoke(channel, data)
});
```

---

## 4. 插件生命周期与窗口管理 / Plugin Lifecycle & Window Management

### 4.1 加载与热重载 / Loading & Hot Reload

oTools 会自动扫描插件目录，检测到插件文件变动（如 plugin.json、index.html、preload.js）会自动热重载插件。/ oTools automatically scans the plugin directory and hot-reloads plugins when files like plugin.json, index.html, or preload.js change.
插件开发时无需重启主程序，保存文件即可生效。/ No need to restart the main app during development, just save the file.

### 4.2 启动模式 / Startup Mode

`independent`：插件窗口按需启动，关闭即销毁，适合工具类插件。/ `independent`: Plugin window starts on demand and is destroyed when closed, suitable for tool-type plugins.
`dependent`：插件随主程序后台启动，窗口默认隐藏，适合常驻服务型插件。/ `dependent`: Plugin starts in the background with the main app, window is hidden by default, suitable for resident/background plugins.

### 4.3 窗口行为 / Window Behavior

窗口参数（宽高、标题、是否置顶等）由 plugin.json 的 `ui` 字段决定。/ Window parameters (size, title, always on top, etc.) are set by the `ui` field in plugin.json.
插件窗口默认可调整大小、可置顶、可隐藏。/ Plugin windows are resizable, can be always on top, and can be hidden by default.
关闭窗口时，dependent 插件会隐藏窗口而不是销毁进程。/ When closed, dependent plugin windows are hidden instead of destroyed.

---

## 5. 插件执行方式 / Plugin Execution Methods

插件有两种主要的执行方式：/ There are two main plugin execution methods:

### 1. 通过插件 DOM 加载 / By DOM Loading

适用于独立 UI 工具类插件，主程序会在窗口中通过 iframe 或 webview 加载插件页面（如 index.html）。/ Suitable for standalone UI tool plugins, the main app loads the plugin page (e.g., index.html) via iframe or webview in a window.

**典型场景 / Typical Scenario:**
- 需要完整界面的插件，如截图、OCR、翻译等工具。
- 插件页面通过 preload.js 与主程序通信。

**示例 / Example:**
```js
// 主程序自动创建窗口并加载插件页面
// The main process automatically creates a window and loads the plugin page
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing plugin...');
    // execute logic
});
```

### 2. 通过 onPluginExecute 事件 / By onPluginExecute Event

适用于无 UI 或需要响应主程序指令的插件。主程序通过 plugin-execute 事件通知插件执行特定操作。/ Suitable for headless or command-driven plugins. The main process notifies the plugin to execute specific actions via the plugin-execute event.

**典型场景 / Typical Scenario:**
- 插件无需界面，仅需处理数据或后台任务。
- 插件需要响应主程序的快捷键、菜单等触发。

**示例 / Example:**
```js
// preload.js
window.otools.on('plugin-execute', (data) => {
  // data.action, data.args
  // 根据 action 执行不同逻辑 / Execute logic based on action
});
```

---

## 6. 插件与主程序的 IPC 通信 / IPC Communication Between Plugin and Main Process

### 6.1 主程序 → 插件窗口 / Main Process → Plugin Window

| 通道名 / Channel      | 说明 / Description                        | 数据格式 / Data Format |
|----------------------|-------------------------------------------|-----------------------|
| plugin-execute       | 执行插件动作，传递 action/args / Execute plugin action, pass action/args | { action, args }      |
| plugins-changed      | 插件列表变更通知，传递插件列表 / Notify plugin list change, pass plugin list | pluginsList           |

**监听示例 / Listen Example:**

```js
window.otools.on('plugin-execute', (data) => {
  // data.action, data.args
  // 处理插件逻辑 / Handle plugin logic
});

window.otools.on('plugins-changed', (plugins) => {
  // 刷新插件列表 / Refresh plugin list
});
```

### 6.2 插件窗口 → 主程序 / Plugin Window → Main Process

通过 `window.otools.send` 或 `window.otools.invoke` 发送自定义消息。/ Send custom messages via `window.otools.send` or `window.otools.invoke`.
需主程序端（如 main.js、ipc.js）注册对应的 ipcMain 处理。/ The main process (e.g., main.js, ipc.js) must register the corresponding ipcMain handler.

**发送示例 / Send Example:**

```js
window.otools.send('your-custom-channel', { foo: 'bar' });
window.otools.invoke('your-custom-channel', { foo: 'bar' }).then(result => { ... });
```

**常见用途 / Common Use Cases:**

- 请求主程序执行系统操作（如截图、文件操作、系统托盘等）。/ Request the main process to perform system operations (e.g., screenshot, file operations, tray, etc.)
- 获取主程序状态或数据。/ Get main process status or data.
- 与其他插件或主程序前端通信。/ Communicate with other plugins or the main app frontend.

---

## 7. IPC 接口与调用示例 / IPC APIs & Usage Examples

以下为 oTools 框架暴露的主要 IPC 接口及其在 preload.js/渲染进程中的常见调用写法：
/ Below are the main IPC APIs exposed by oTools and typical usage in preload.js/renderer:

### 1. 插件相关接口 / Plugin-related APIs

- 获取插件列表 / Get plugin list  
  `getPlugins: () => ipcRenderer.invoke('get-plugins')`
- 获取插件名称（用于快捷键配置）/ Get plugin names (for shortcut config)  
  `getPluginNames: () => ipcRenderer.invoke('get-plugin-names')`
- 执行插件 / Execute plugin  
  `executePlugin: (pluginName, ...args) => ipcRenderer.invoke('execute-plugin', pluginName, ...args)`
- 启动插件进程 / Start plugin process  
  `startPlugin: (pluginName) => ipcRenderer.invoke('start-plugin', pluginName)`
- 停止插件进程 / Stop plugin process  
  `stopPlugin: (pluginName) => ipcRenderer.invoke('stop-plugin', pluginName)`
- 显示插件窗口（通过 sender）/ Show plugin window (by sender)  
  `showPluginWindow: () => ipcRenderer.invoke('show-plugin-window')`
- 按名称显示插件窗口 / Show plugin window by name  
  `showPluginWindowByName: (pluginName) => ipcRenderer.invoke('show-plugin-window-by-name', pluginName)`
- 按名称隐藏插件窗口 / Hide plugin window by name  
  `hidePluginWindowByName: (pluginName) => ipcRenderer.invoke('hide-plugin-window-by-name', pluginName)`
- 切换插件窗口显示/隐藏 / Toggle plugin window show/hide  
  `togglePluginWindowByName: (pluginName) => ipcRenderer.invoke('toggle-plugin-window-by-name', pluginName)`
- 获取插件窗口状态 / Get plugin window status  
  `getPluginWindowStatus: (pluginName) => ipcRenderer.invoke('get-plugin-window-status', pluginName)`
- 卸载插件 / Uninstall plugin  
  `uninstallPlugin: (pluginName, removeFiles = true) => ipcRenderer.invoke('uninstall-plugin', pluginName, removeFiles)`
- 设置插件配置 / Set plugin config  
  `setPluginConfig: (pluginName, config) => ipcRenderer.invoke('set-plugin-config', pluginName, config)`

### 2. 插件市场与快捷键 / Plugin Market & Shortcuts

- 获取自定义快捷键 / Get custom shortcuts  
  `getCustomShortcuts: () => ipcRenderer.invoke('get-custom-shortcuts')`
- 设置自定义快捷键 / Set custom shortcuts  
  `setCustomShortcuts: (shortcuts) => ipcRenderer.invoke('set-custom-shortcuts', shortcuts)`
- 打开插件市场窗口 / Open plugin market window  
  `ipcRenderer.send('open-plugin-market')`
- 下载并安装插件 / Download and install plugin  
  `ipcRenderer.send('download-plugin', { folder: 'plugin-folder-name' })`

### 3. 系统与配置相关接口 / System & Config APIs

- 获取应用状态 / Get app status  
  `getAppStatus: () => ipcRenderer.invoke('get-app-status')`
- 获取配置 / Get config  
  `getConfig: (configName) => ipcRenderer.invoke('get-config', configName)`
- 获取所有配置名 / Get all config names  
  `getConfigNames: () => ipcRenderer.invoke('get-config-names')`
- 刷新快捷键 / Refresh shortcuts  
  `refreshShortcut: () => ipcRenderer.invoke('refresh-shortcut')`
- 设置配置 / Set config  
  `setConfig: (configName, config) => ipcRenderer.invoke('set-config', configName, config)`

### 4. 截图与 OCR / Screenshot & OCR

- 截图 / Capture screen  
  `captureScreen: () => ipcRenderer.invoke('capture-screen')`
- OCR 识别（base64图片）/ OCR recognition (base64 image)  
  `performOCR: (imageData) => ipcRenderer.invoke('perform-ocr', imageData)`
- 截图并识别 / Capture and OCR  
  `captureAndOCR: () => ipcRenderer.invoke('capture-and-ocr')`

### 5. 通知与应用控制 / Notification & App Control

- 系统通知 / System notification  
  `ipcRenderer.send('show-system-notification', { title: '标题', body: '内容' })`
- 退出应用 / Quit app  
  `ipcRenderer.send('quit-app')`

### 6. 文件与对话框操作 / File & Dialog Operations

- 打开文件对话框 / Show open dialog  
  `showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options)`
- 保存文件对话框 / Show save dialog  
  `showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options)`
- 读取文件内容 / Read file content  
  `readFile: (filePath) => ipcRenderer.invoke('read-file', filePath)`
- 写入文件内容 / Write file content  
  `writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content)`
- 判断文件是否存在 / Check if file exists  
  `fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath)`
- 创建目录 / Create directory  
  `createDirectory: (dirPath) => ipcRenderer.invoke('create-directory', dirPath)`
- 删除文件或目录 / Delete file or directory  
  `deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath)`
- 复制文件 / Copy file  
  `copyFile: (sourcePath, destPath) => ipcRenderer.invoke('copy-file', sourcePath, destPath)`
- 移动文件 / Move file  
  `moveFile: (sourcePath, destPath) => ipcRenderer.invoke('move-file', sourcePath, destPath)`
- 列出目录内容 / List directory contents  
  `listDirectory: (dirPath) => ipcRenderer.invoke('list-directory', dirPath)`
- 获取文件信息 / Get file info  
  `getFileInfo: (filePath) => ipcRenderer.invoke('get-file-info', filePath)`

### 7. 剪贴板操作 / Clipboard Operations

- 读取剪贴板文本 / Read clipboard text  
  `readClipboard: () => ipcRenderer.invoke('read-clipboard')`
- 写入剪贴板文本 / Write clipboard text  
  `writeClipboard: (text) => ipcRenderer.invoke('write-clipboard', text)`
- 读取剪贴板图片 / Read clipboard image  
  `readClipboardImage: () => ipcRenderer.invoke('read-clipboard-image')`
- 写入剪贴板图片 / Write clipboard image  
  `writeClipboardImage: (imageData) => ipcRenderer.invoke('write-clipboard-image', imageData)`

### 8. 窗口操作 / Window Operations

- 获取窗口信息 / Get window info  
  `getWindowInfo: () => ipcRenderer.invoke('get-window-info')`
- 最小化窗口 / Minimize window  
  `minimizeWindow: () => ipcRenderer.invoke('minimize-window')`
- 最大化/还原窗口 / Maximize/unmaximize window  
  `maximizeWindow: () => ipcRenderer.invoke('maximize-window')`
- 显示窗口 / Show window  
  `showWindow: () => ipcRenderer.invoke('show-window')`
- 隐藏窗口 / Hide window  
  `hideWindow: () => ipcRenderer.invoke('hide-window')`

### 9. 系统信息与进程 / System Info & Process

- 获取系统信息 / Get system info  
  `getSystemInfo: () => ipcRenderer.invoke('get-system-info')`
- 获取进程信息 / Get process info  
  `getProcessInfo: () => ipcRenderer.invoke('get-process-info')`

### 10. 数据库（简单键值存储）/ Simple Key-Value Storage

- 设置键值 / Set key-value  
  `setDbValue: (key, value) => ipcRenderer.invoke('set-db-value', key, value)`
- 获取键值 / Get key-value  
  `getDbValue: (key) => ipcRenderer.invoke('get-db-value', key)`
- 删除键值 / Delete key-value  
  `deleteDbValue: (key) => ipcRenderer.invoke('delete-db-value', key)`

### 11. 屏幕与显示器 / Screen & Display

- 获取所有显示器信息 / Get all display info  
  `getScreenInfo: () => ipcRenderer.invoke('get-screen-info')`

### 12. 加密与哈希 / Crypto & Hash

- 哈希字符串 / Hash string  
  `hashString: (algorithm, data) => ipcRenderer.invoke('hash-string', algorithm, data)`
- 生成 UUID / Generate UUID  
  `generateUUID: () => ipcRenderer.invoke('generate-uuid')`
- 加密文本 / Encrypt text  
  `encryptText: (text, password) => ipcRenderer.invoke('encrypt-text', text, password)`
- 解密文本 / Decrypt text  
  `decryptText: (encrypted, password, iv) => ipcRenderer.invoke('decrypt-text', encrypted, password, iv)`

### 13. 时间与日期 / Time & Date

- 获取当前时间 / Get current time  
  `getCurrentTime: () => ipcRenderer.invoke('get-current-time')`
- 格式化时间戳 / Format timestamp  
  `formatDate: (timestamp, format) => ipcRenderer.invoke('format-date', timestamp, format)`

### 14. 文本与编码 / Text & Encoding

- 文本转 base64 / Text to base64  
  `textToBase64: (text) => ipcRenderer.invoke('text-to-base64', text)`
- base64 转文本 / Base64 to text  
  `base64ToText: (base64) => ipcRenderer.invoke('base64-to-text', base64)`
- 生成随机字符串 / Generate random string  
  `generateRandomString: (length, charset) => ipcRenderer.invoke('generate-random-string', length, charset)`

### 15. 文件压缩与解压 / File Compression

- 压缩文件 / Compress file  
  `compressFile: (sourcePath, destPath) => ipcRenderer.invoke('compress-file', sourcePath, destPath)`
- 解压文件 / Decompress file  
  `decompressFile: (sourcePath, destPath) => ipcRenderer.invoke('decompress-file', sourcePath, destPath)`

### 16. 其他 / Others

- 打开外部链接 / Open external link  
  `openExternal: (url) => ipcRenderer.invoke('open-external', url)`
- 在文件夹中显示项目 / Show item in folder  
  `showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath)`
- 获取应用版本 / Get app version  
  `getAppVersion: () => ipcRenderer.invoke('get-app-version')`

---

如需在 preload.js 中暴露这些方法，可参考如下写法：  
/ To expose these methods in preload.js, you can use:

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('otools', {
  getAppStatus: () => ipcRenderer.invoke('get-app-status'),
  // ... 其他方法同上
});
```

如需更多接口参数说明或用法示例，请随时提问！/ For more details or usage examples, feel free to ask!

---

## 8. 插件开发与调试建议 / Development & Debugging Tips

开发模式下，插件窗口会自动打开 DevTools，便于调试。/ In development mode, plugin windows will automatically open DevTools for debugging.
推荐使用 VSCode 等编辑器，配合 Electron/前端调试工具。/ It is recommended to use editors like VSCode with Electron/frontend debugging tools.
充分利用热重载，快速迭代开发。/ Make full use of hot reload for rapid development.
预加载脚本中只暴露必要 API，避免安全隐患。/ Only expose necessary APIs in the preload script to avoid security risks.

---

## 9. 插件卸载与热重载 / Uninstall & Hot Reload

插件可通过主程序界面卸载，支持删除插件目录及所有文件。/ Plugins can be uninstalled via the main app UI, supporting deletion of the plugin folder and all files.
插件进程会被安全关闭，相关资源释放。/ Plugin processes will be safely closed and resources released.
插件文件变动时，主程序会自动热重载插件，无需重启。/ When plugin files change, the main app will hot reload the plugin automatically, no restart needed.

---

## 10. 常见问题与最佳实践 / FAQ & Best Practices

Q: 插件窗口无法打开？ / Q: Plugin window cannot open?  
A: 检查 plugin.json 的 ui.html、ui.preload 路径是否正确，确保文件存在。/ Check if the ui.html and ui.preload paths in plugin.json are correct and files exist.

Q: 如何与主程序深度集成？ / Q: How to deeply integrate with the main app?  
A: 通过自定义 IPC 通道与主程序通信，或请求主程序暴露更多 API。/ Communicate with the main app via custom IPC channels, or request the main app to expose more APIs.

Q: 插件如何存储数据？ / Q: How does a plugin store data?  
A: 推荐使用主程序暴露的存储 API，或自行在插件目录下管理数据文件。/ It is recommended to use the storage API exposed by the main app, or manage data files in the plugin directory.

**最佳实践 / Best Practices:**
- 保持插件目录结构清晰，资源独立。/ Keep plugin directory structure clear and resources independent.
- 遵循 Electron 安全最佳实践，避免直接暴露 Node API。/ Follow Electron security best practices, do not expose Node APIs directly.
- 插件 UI 设计简洁，兼容不同分辨率。/ Keep plugin UI simple and compatible with different resolutions.
- 合理使用 IPC，避免频繁通信导致性能问题。/ Use IPC reasonably, avoid frequent communication that may cause performance issues.

---

## 11. 进阶集成与扩展 / Advanced Integration & Extension

- 支持多窗口插件（可在主页面动态创建新窗口）。/ Support multi-window plugins (can dynamically create new windows in the main page).
- 支持与主程序数据共享、全局快捷键、系统托盘等高级特性。/ Support advanced features such as data sharing with the main app, global shortcuts, system tray, etc.
- 可开发后台服务型插件（如自动同步、定时任务等）。/ Can develop background service plugins (e.g., auto-sync, scheduled tasks, etc.).

---

## 12. 示例插件结构 / Example Plugin Structure

```
screenshot-ocr/
  ├── plugin.json
  ├── index.html
  ├── index.css
  ├── main.js
  ├── preload.js
  └── icon.png
```

---

## 参考与文档 / Reference & Documentation

- [官方插件示例 / Official Plugin Example](https://github.com/ilikebug/oTools-Plugins/tree/main/screenshot-ocr)
- Electron 官方文档 / Electron Official Docs: [https://www.electronjs.org/docs](https://www.electronjs.org/docs)

---

如有疑问，欢迎随时提问！/ If you have any questions, feel free to ask! 