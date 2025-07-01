const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const BaseManager = require('../core/base-manager');

/**
 * Process status enumeration
 */
const ProcessStatus = {
  IDLE: 'idle',
  BUSY: 'busy',
  STARTING: 'starting',
  ERROR: 'error',
  TERMINATED: 'terminated'
};

/**
 * Plugin process pool manager (BrowserWindow mode)
 * Implement lazy loading and process reuse of plugins
 */
class PluginProcessPool extends BaseManager {
  constructor(options = {}) {
    super('PluginProcessPool');
    this.maxProcesses = options.maxProcesses || 5;
    this.processes = new Map(); // name -> { window, status, ... }
    this.pluginsDir = path.join(__dirname, '..', '..', '..', 'plugins');
  }

  async onInitialize() {
    this.log(`Plugin process pool initialization, maximum process number: ${this.maxProcesses}`);
  }

  async onDestroy() {
    for (const [name, info] of this.processes) {
      if (info.window && !info.window.isDestroyed()) {
        info.window.close();
      }
    }
    this.processes.clear();
    this.log('Plugin process pool destruction completed');
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
      throw new Error('Maximum plugin process number reached');
    }
    return await this.createProcess(pluginName);
  }

  async createProcess(pluginName) {
    const pluginPath = path.join(this.pluginsDir, pluginName);
    const metaPath = path.join(pluginPath, 'plugin.json');
    if (!fs.existsSync(metaPath)) throw new Error(`Plugin configuration file does not exist: ${metaPath}`);
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const htmlPath = path.join(pluginPath, meta.ui && meta.ui.html ? meta.ui.html : 'index.html');
    const preloadPath = path.join(pluginPath, 'preload.js');
    if (!fs.existsSync(htmlPath)) throw new Error(`Plugin main page does not exist: ${htmlPath}`);
    if (!fs.existsSync(preloadPath)) throw new Error(`Plugin preload script does not exist: ${preloadPath}`);

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
    // Listen for plugin window messages
    win.webContents.on('ipc-message', (event, channel, ...args) => {
      // Here you can handle messages sent by the plugin
      this.log(`[${pluginName}] IPC message: ${channel}`, args);
    });
    win.on('closed', () => {
      this.processes.delete(pluginName);
    });
    this.log(`Plugin process created successfully: ${pluginName}`);
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