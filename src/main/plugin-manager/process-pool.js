const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const BaseManager = require('../core/base-manager');

/**
 * 进程状态枚举
 */
const ProcessStatus = {
  IDLE: 'idle',
  BUSY: 'busy',
  STARTING: 'starting',
  ERROR: 'error',
  TERMINATED: 'terminated'
};

/**
 * 插件进程池管理器（BrowserWindow模式）
 * 实现插件的懒加载和进程复用
 */
class PluginProcessPool extends BaseManager {
  constructor(options = {}) {
    super('PluginProcessPool');
    this.maxProcesses = options.maxProcesses || 5;
    this.processes = new Map(); // name -> { window, status, ... }
    this.pluginsDir = path.join(__dirname, '..', '..', '..', 'plugins');
  }

  async onInitialize() {
    this.log(`插件进程池初始化，最大进程数: ${this.maxProcesses}`);
  }

  async onDestroy() {
    for (const [name, info] of this.processes) {
      if (info.window && !info.window.isDestroyed()) {
        info.window.close();
      }
    }
    this.processes.clear();
    this.log('插件进程池销毁完成');
  }

  async getProcess(pluginName, forceNew = false) {
    if (!forceNew && this.processes.has(pluginName)) {
      const info = this.processes.get(pluginName);
      if (info.status === 'idle' && info.window && !info.window.isDestroyed()) {
        info.status = 'busy';
        return info;
      }
    }
    if (this.processes.size >= this.maxProcesses) {
      throw new Error('已达最大插件进程数');
    }
    return await this.createProcess(pluginName);
  }

  async createProcess(pluginName) {
    const pluginPath = path.join(this.pluginsDir, pluginName);
    const metaPath = path.join(pluginPath, 'plugin.json');
    if (!fs.existsSync(metaPath)) throw new Error(`插件配置文件不存在: ${metaPath}`);
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const htmlPath = path.join(pluginPath, meta.ui && meta.ui.html ? meta.ui.html : 'index.html');
    const preloadPath = path.join(pluginPath, 'preload.js');
    if (!fs.existsSync(htmlPath)) throw new Error(`插件主页面不存在: ${htmlPath}`);
    if (!fs.existsSync(preloadPath)) throw new Error(`插件预加载脚本不存在: ${preloadPath}`);

    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    await win.loadFile(htmlPath);
    const info = { window: win, status: 'idle', meta };
    this.processes.set(pluginName, info);
    // 监听插件窗口消息
    win.webContents.on('ipc-message', (event, channel, ...args) => {
      // 这里可根据需要处理插件发来的消息
      this.log(`[${pluginName}] IPC消息: ${channel}`, args);
    });
    win.on('closed', () => {
      this.processes.delete(pluginName);
    });
    this.log(`插件进程创建成功: ${pluginName}`);
    return info;
  }

  async executePlugin(pluginName, action, ...args) {
    const info = await this.getProcess(pluginName);
    info.status = 'busy';
    info.window.webContents.send('plugin-execute', { action, args });
    if (info.window && !info.window.isVisible()) {
      info.window.show();
    }
    info.status = 'idle';
    return { success: true };
  }

  getPoolStatus() {
    return Array.from(this.processes.keys());
  }
}

module.exports = PluginProcessPool; 