# oTools 插件开发详细指南 / oTools Plugin Development Detailed Guide

> 适用版本 / Applicable Version: oTools v1.0.0 及以上 / v1.0.0+

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
  ├── main.js             # 插件主逻辑（可选）/ Optional, plugin main logic
  ├── icon.png            # 插件图标 / Icon
  └── index.css           # 样式文件 / CSS
```

---

## 2. plugin.json 配置详解 / plugin.json Configuration Details

`plugin.json` 是插件的核心配置文件，决定插件的加载、窗口、UI 等行为。/ `plugin.json` is the core configuration file for the plugin, determining its loading, window, UI, and other behaviors.

**完整示例 / Full Example:**

```json
{
  "name": "screenshot-ocr",           // 插件英文唯一名 / Unique English name
  "shortName": "截图识别",             // 插件中文名 / Chinese name
  "description": "截图并进行 OCR 文字识别", // 插件功能描述 / Description
  "version": "1.0.0",                 // 版本号 / Version
  "author": "Your Name",              // 作者 / Author
  "icon": "icon.png",                 // 图标文件名 / Icon filename
  "type": "custom",                   // 插件类型 / Plugin type
  "enabled": true,                     // 是否启用 / Enabled
  "startupMode": "independent",        // 启动模式 / Startup mode
  "ui": {
    "html": "index.html",              // 主页面文件 / Main page file
    "width": 900,                       // 窗口宽度 / Window width
    "height": 600,                      // 窗口高度 / Window height
    "title": "截图识别",                // 窗口标题 / Window title
  }
  "preload": "preload.js",           // 预加载脚本 / Preload script
  "frame": true,                     // 边框设置 / frame setting
  "debug": false,                    // 开启 DevTools / open DevTools
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

## IPC 接口与调用示例（IPC API & Usage）

### 1. 基本说明（Basic Description）

所有在 `allowedMethods` 列表中的方法，都会通过 `contextBridge` 暴露到渲染进程的 `window.otools` 对象下。  
All methods in the `allowedMethods` list are exposed to the renderer process via `window.otools` by `contextBridge`.

调用方式统一为 / Usage:

```js
window.otools.方法名(...参数) // window.otools.methodName(...args)
```

所有方法均为**异步**，返回 Promise。All methods are **asynchronous** and return a Promise.

---

### 2. 方法列表与调用示例 / Method List & Usage Example

| 方法名 (Method)         | 参数说明 (Params)       | 返回值/说明 (Return/Description) | 示例 (Example)                    |
|-------------------------|------------------------|----------------------------------|-----------------------------------|
| getPlugins              | 无 / none              | Promise<插件列表 / plugin list>  | `await window.otools.getPlugins()` |
| getPluginNames          | 无 / none              | Promise<插件名数组 / names[]>    | `await window.otools.getPluginNames()` |
| executePlugin           | (pluginName, ...args)  | Promise<执行结果 / result>       | `await window.otools.executePlugin('myPlugin', arg1, arg2)` |
| showPluginWindow        | (pluginName)           | Promise<void>                    | `await window.otools.showPluginWindow('myPlugin')` |
| hidePluginWindow        | (pluginName)           | Promise<void>                    | `await window.otools.hidePluginWindow('myPlugin')` |
| getPluginWindowStatus   | (pluginName)           | Promise<boolean>                 | `await window.otools.getPluginWindowStatus('myPlugin')` |
| uninstallPlugin         | (pluginName)           | Promise<void>                    | `await window.otools.uninstallPlugin('myPlugin')` |
| setPluginConfig         | (pluginName, config)   | Promise<void>                    | `await window.otools.setPluginConfig('myPlugin', {key: 'value'})` |
| downloadPlugin          | (options)              | Promise<结果 / result>           | `await window.otools.downloadPlugin({folder: 'plugin-folder'})` |
| getCustomShortcuts      | 无 / none              | Promise<快捷键配置 / shortcuts>  | `await window.otools.getCustomShortcuts()` |
| setCustomShortcuts      | (config)               | Promise<void>                    | `await window.otools.setCustomShortcuts({...})` |
| getAppStatus            | 无 / none              | Promise<状态对象 / status>       | `await window.otools.getAppStatus()` |
| getSystemInfo           | 无 / none              | Promise<系统信息 / info>         | `await window.otools.getSystemInfo()` |
| refreshShortcut         | 无 / none              | Promise<void>                    | `await window.otools.refreshShortcut()` |
| openExternal            | (url)                  | Promise<void>                    | `await window.otools.openExternal('https://...')` |
| getConfig               | (key)                  | Promise<值 / value>              | `await window.otools.getConfig('theme')` |
| getConfigNames          | 无 / none              | Promise<key数组 / keys[]>        | `await window.otools.getConfigNames()` |
| setConfig               | (key, value)           | Promise<void>                    | `await window.otools.setConfig('theme', 'dark')` |
| captureScreen           | 无 / none              | Promise<图片数据 / image>        | `await window.otools.captureScreen()` |
| performOcr              | (imageData)            | Promise<识别结果 / text>         | `await window.otools.performOcr(img)` |
| captureAndOcr           | 无 / none              | Promise<识别结果 / text>         | `await window.otools.captureAndOcr()` |
| showOpenDialog          | (options)              | Promise<文件路径 / path>         | `await window.otools.showOpenDialog({})` |
| showSaveDialog          | (options)              | Promise<文件路径 / path>         | `await window.otools.showSaveDialog({})` |
| readFile                | (filePath)             | Promise<内容 / content>          | `await window.otools.readFile('/path')` |
| writeFile               | (filePath, content)    | Promise<void>                    | `await window.otools.writeFile('/path', 'data')` |
| fileExists              | (filePath)             | Promise<boolean>                 | `await window.otools.fileExists('/path')` |
| createDirectory         | (dirPath)              | Promise<void>                    | `await window.otools.createDirectory('/dir')` |
| showItemInFolder        | (filePath)             | Promise<void>                    | `await window.otools.showItemInFolder('/path')` |
| listDirectory           | (dirPath)              | Promise<文件列表 / files[]>      | `await window.otools.listDirectory('/dir')` |
| getFileInfo             | (filePath)             | Promise<信息对象 / info>         | `await window.otools.getFileInfo('/path')` |
| deleteFile              | (filePath)             | Promise<void>                    | `await window.otools.deleteFile('/path')` |
| copyFile                | (src, dest)            | Promise<void>                    | `await window.otools.copyFile('/src', '/dest')` |
| moveFile                | (src, dest)            | Promise<void>                    | `await window.otools.moveFile('/src', '/dest')` |
| getWindowInfo           | 无 / none              | Promise<窗口信息 / info>         | `await window.otools.getWindowInfo()` |
| minimizeWindow          | 无 / none              | Promise<void>                    | `await window.otools.minimizeWindow()` |
| maximizeWindow          | 无 / none              | Promise<void>                    | `await window.otools.maximizeWindow()` |
| showWindow              | 无 / none              | Promise<void>                    | `await window.otools.showWindow()` |
| hideWindow              | 无 / none              | Promise<void>                    | `await window.otools.hideWindow()` |
| setDbValue              | (key, value)           | Promise<void>                    | `await window.otools.setDbValue('key', 'value')` |
| getDbValue              | (key)                  | Promise<值 / value>              | `await window.otools.getDbValue('key')` |
| deleteDbValue           | (key)                  | Promise<void>                    | `await window.otools.deleteDbValue('key')` |
| getScreenInfo           | 无 / none              | Promise<屏幕信息 / info>         | `await window.otools.getScreenInfo()` |
| generateRandomString    | (length)               | Promise<string>                  | `await window.otools.generateRandomString(16)` |
| readClipboard           | 无 / none              | Promise<string>                  | `await window.otools.readClipboard()` |
| writeClipboard          | (text)                 | Promise<void>                    | `await window.otools.writeClipboard('内容')` |
| readClipboardImage      | 无 / none              | Promise<图片数据 / image>        | `await window.otools.readClipboardImage()` |
| writeClipboardImage     | (imageData)            | Promise<void>                    | `await window.otools.writeClipboardImage(img)` |
| simulateMouse           | (options)              | Promise<void>                    | `await window.otools.simulateMouse({...})` |
| getMousePosition        | 无 / none              | Promise<{x, y}>                  | `await window.otools.getMousePosition()` |
| simulateKeyboard        | (options)              | Promise<void>                    | `await window.otools.simulateKeyboard({...})` |
| showSystemNotification  | (options)              | Promise<void>                    | `await window.otools.showSystemNotification({...})` |

---

### 3. 统一调用机制（Unified Call Mechanism）

所有方法最终通过 IPC 调用主进程的 `'otools-function'` 事件，参数依次为：  
All methods are finally called via IPC event `'otools-function'` in the main process, with parameters:

- 第一个参数：方法名（字符串）/ First param: method name (string)
- 后续参数：方法实际参数 / Following params: actual method arguments

**所有方法均为异步，返回 Promise。All methods are asynchronous and return Promise.**

---

### 4. 示例（Examples）

```js
// 获取插件列表 / Get plugin list
window.otools.getPlugins().then(plugins => {
  console.log(plugins);
});

// 写入文件（推荐 async/await）/ Write file (recommended async/await)
async function saveFile() {
  await window.otools.writeFile('/tmp/test.txt', 'hello world');
  alert('保存成功 / Saved!');
}
```

---

如需了解每个方法的具体参数和返回值，请参考主进程 ipc 相关实现（通常在 `ipc.js` 或相关文件中）。  
For detailed params and return values, please refer to the main process IPC implementation (usually in `ipc.js` or related files).

---

如需进一步补充详细参数类型和返回结构，请提供主进程对应方法的实现代码。  
If you need more detailed param types and return structures, please provide the main process implementation code.

---

### 5. 自定义 IPC 通道注册 / Registering Custom IPC Channels

主进程可通过 ipcMain.handle('your-channel', handler) 注册自定义通道，插件通过 window.otools.invoke('your-channel', ...) 调用。

The main process can register custom channels via ipcMain.handle('your-channel', handler), and plugins can call them via window.otools.invoke('your-channel', ...).

---

### 6. API 参数与返回结构 / API Params & Return Structure

详细参数和返回结构请参考主进程 ipc.js 文件的实现，或联系开发者获取接口文档。

For detailed params and return structures, refer to the main process ipc.js implementation or contact the developer for API docs.

---

## 8. 插件开发与调试建议 / Development & Debugging Tips

- 开发模式下插件窗口会自动打开 DevTools（如未自动打开可手动调用 win.webContents.openDevTools()）。/ In development mode, plugin windows will automatically open DevTools (if not, call win.webContents.openDevTools() manually).
- 推荐使用 VSCode、Chrome DevTools 进行断点调试。/ Recommend using VSCode, Chrome DevTools for debugging.
- 充分利用热重载，快速迭代开发。/ Make full use of hot reload for rapid development.
- 预加载脚本中只暴露必要 API，避免安全隐患。/ Only expose necessary APIs in the preload script to avoid security risks.
- 插件开发遇到问题可查阅主程序日志（oTools/logs/otools.log）。/ Check main app log (oTools/logs/otools.log) if you encounter plugin development issues.

---

## 8. 插件中使用第三方 Node 模块（Using Third-party Node Modules in Plugins）

### 1. 安装依赖（Install Dependencies）

每个插件可以有自己的 `node_modules` 目录和 `package.json` 文件。
Each plugin can have its own `node_modules` and `package.json`.

**步骤 / Steps:**

1. 进入你的插件目录（如 `plugins/your-plugin/`）。  
   Go to your plugin directory (e.g. `plugins/your-plugin/`).
2. 使用 npm 或 yarn 安装所需模块。  
   Use npm or yarn to install the required module.

   ```bash
   npm install axios
   # 或 / or
   yarn add axios
   ```

3. 安装后，`node_modules` 和 `package.json` 会出现在插件目录下。  
   After installation, `node_modules` and `package.json` will appear in your plugin folder.

---

### 2. 插件中引用第三方模块（Require Third-party Modules in Plugin）

在插件的主入口文件或其他 JS 文件中，直接使用 `require` 或 `import` 引入第三方模块。
In your plugin's main entry file or any JS file, use `require` or `import` to include third-party modules.

**示例 / Example:**

```js
// CommonJS
const axios = require('axios');

// ES Module (如果你的插件支持)
import axios from 'axios';

// 使用 axios 发起请求 / Use axios to make a request
axios.get('https://api.example.com/data')
  .then(res => {
    console.log(res.data);
  });
```

---

### 3. 运行时依赖加载机制（Runtime Dependency Resolution）

oTools 框架的插件加载机制会自动为插件设置好 `module.paths`，
使得 `require` 优先从插件自身的 `node_modules` 查找依赖。
The oTools plugin loader automatically sets up `module.paths` so that `require` will first look for dependencies in the plugin's own `node_modules`.

**注意 / Note:**  
- 如果插件没有自己的 `node_modules`，会回退到主程序的依赖目录。  
  If the plugin does not have its own `node_modules`, it will fallback to the main app's dependencies.
- 推荐每个插件独立管理依赖，避免版本冲突。  
  It is recommended that each plugin manages its own dependencies to avoid version conflicts.

---

### 4. 在插件 preload.js 中使用（Use in Plugin Preload.js）

如果你的插件有自定义的 `preload.js`，同样可以直接 `require` 第三方模块。
If your plugin has a custom `preload.js`, you can also `require` third-party modules directly.

**示例 / Example:**

```js
// plugins/your-plugin/preload.js
const dayjs = require('dayjs');
console.log(dayjs().format());
```

---

### 5. 常见问题（FAQ）

- **Q: 为什么 require 找不到模块？**  
  A: 请确认已在插件目录下正确安装依赖，并且插件目录结构正确。

- **Q: 可以使用原生 Node.js 模块吗？**  
  A: 可以，Node.js 内置模块（如 `fs`, `path` 等）可直接使用，无需安装。

---

如需更详细的插件开发说明，请参考 oTools 插件开发文档或联系开发者支持。  
For more details, please refer to the oTools plugin development documentation or contact developer support.

---

## 9. 插件卸载与热重载 / Uninstall & Hot Reload

插件可通过主程序界面卸载，支持删除插件目录及所有文件。/ Plugins can be uninstalled via the main app UI, supporting deletion of the plugin folder and all files.
插件进程会被安全关闭，相关资源释放。/ Plugin processes will be safely closed and resources released.
插件文件变动时，主程序会自动热重载插件，无需重启。/ When plugin files change, the main app will hot reload the plugin automatically, no restart needed.

---

## 10. 常见问题与最佳实践 / FAQ & Best Practices

Q: 插件窗口无法打开？ / Q: Plugin window cannot open?  
A: 检查 plugin.json 的 ui.html、ui.preload 路径是否正确，确保文件存在，并查看主程序日志。/ Check if the ui.html and ui.preload paths in plugin.json are correct, files exist, and check the main app log.

Q: 如何与主程序深度集成？ / Q: How to deeply integrate with the main app?  
A: 通过自定义 IPC 通道与主程序通信，或请求主程序暴露更多 API。/ Communicate with the main app via custom IPC channels, or request the main app to expose more APIs.

Q: 插件依赖冲突如何解决？ / Q: How to resolve plugin dependency conflicts?  
A: 推荐每个插件独立管理依赖，避免版本冲突。/ It is recommended that each plugin manages its own dependencies independently to avoid version conflicts.

Q: 如何调试 preload.js？ / Q: How to debug preload.js?  
A: 可在 preload.js 中使用 console.log，或在插件窗口 DevTools 的 Console 面板查看输出。/ Use console.log in preload.js and check output in the plugin window DevTools Console panel.

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