// Plugin manager, responsible for plugin scanning, hot reloading, etc.
const path = require('node:path');
const fs = require('fs');
const chokidar = require('chokidar');
const logger = require('../utils/logger');
const { GetPluginPath } = require('../comm');
const { screen, BrowserWindow } = require('electron');
const WindowStateKeeper = require('electron-window-state');
const Positioner = require('electron-positioner');
const { switchToPreviousApp } = require('../utils/mac-windows');



class PluginManager {
  constructor(options = {}) {
    // Always include the default plugin directory for scanning
    this.defaultDir = GetPluginPath();
    // Custom plugin directories (excluding the default directory)
    this.customDirs = [];
    
    this.plugins = new Map();
    this.processes = new Map();

    this.watcher = null;
    this.mainWindow = null;
    this.maxProcesses = null;

    this.configManager = null
    this.appManager = null; // Reference to app manager for enhanced window management
    this.cleanupTimer = null; // Timer for periodic cleanup
  }

  /**
   * Start a timer to periodically clean up unused references
   */
  startCleanupTimer() {
    if (this.cleanupTimer) {return;}
    this.cleanupTimer = setInterval(() => {
      // Clean up destroyed window references
      for (const [name, info] of this.processes) {
        if (!info.window || info.window.isDestroyed()) {
          this.processes.delete(name);
        }
      }
      // Clean up plugin references whose directory no longer exists
      for (const [name, plugin] of this.plugins) {
        if (!plugin.dir || !fs.existsSync(plugin.dir)) {
          this.plugins.delete(name);
        }
      }
    }, 60000); // Clean up every minute
  }

  /**
   * Initialize plugin manager
   */
  async initialize(options = {}) {
    try {
      this.configManager = options.configManager;
      this.appManager = options.appManager; // Store app manager reference
      const mainConfig = this.configManager.getConfig('main')
      this.maxProcesses = mainConfig.plugins.maxProcesses;
      this.customDirs = mainConfig.plugins.pluginDirs;
      
      logger.info(`Initializing plugin manager`);
      
      // Load plugins
      await this.loadPlugins();
      
      // Set up plugin watcher immediately
      if (options.autoLoad !== false) {
        this.watchPlugins();
      }

      this.startCleanupTimer(); // Start periodic cleanup
    } catch (error) {
      logger.error(`Error initializing plugin manager: ${error.message}`);
      throw error;
    }
  }

  /**
   * Set main window reference after window creation
   */
  setMainWindow(window) {
    this.mainWindow = window;
  }

  /**
   * Destroy plugin manager
   */
  async destroy() {
    try {
      if (this.watcher) {
        this.watcher.close();
        this.watcher = null;
      }
      
      this.plugins.clear();
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }
      
    } catch (error) {
      throw error;
    }
  }

  /**
   * Stop plugin process
   */
  async stopPluginProcess(pluginName) {
    const processInfo = this.processes.get(pluginName);
    if (processInfo && processInfo.window && !processInfo.window.isDestroyed()) {
      try {
        processInfo.window.close();
        this.processes.delete(pluginName);
      } catch (error) {
        logger.error(`Error stopping plugin process ${pluginName}: ${error.message}`);
      }
    }
  }

  /**
   * Stop all plugin processes
   */
  async stopAllPluginProcesses() {
    const pluginNames = Array.from(this.processes.keys());
    for (const pluginName of pluginNames) {
      await this.stopPluginProcess(pluginName);
    }
  }

  /**
   * Uninstall plugin
   * @param {string} pluginName - Name of the plugin to uninstall
   * @param {boolean} removeFiles - Whether to remove plugin files from disk
   * @returns {Object} Result object with success status and message
   */
  async uninstallPlugin(pluginName, removeFiles = true) {
    try {
      if (!this.hasPlugin(pluginName)) {
        return {
          success: false,
          error: `Plugin '${pluginName}' does not exist`
        };
      }
    
      // Stop plugin process if running
      await this.stopPluginProcess(pluginName);
  
      // Get plugin info before removal
      const pluginInfo = this.getPluginInfo(pluginName);
      const pluginDir = pluginInfo.dir;
  
      // Remove from plugins map
      this.plugins.delete(pluginName);
  
      // Check if this plugin is in a custom directory
      const isCustomDir = this.customDirs.some(dir => {
        return path.resolve(dir) === path.resolve(pluginDir);
      });
  
      if (isCustomDir) {
        // Remove the specific plugin directory from custom dirs
        this.customDirs = this.customDirs.filter(
          d => path.resolve(d) !== path.resolve(pluginDir)
        );
        
        // Update configuration file to remove this specific plugin directory
        if (this.configManager) {
          const config = this.configManager.getConfig('main');
          if (config && config.plugins && Array.isArray(config.plugins.pluginDirs)) {
            // Remove the specific plugin directory from config
            config.plugins.pluginDirs = config.plugins.pluginDirs.filter(
              d => path.resolve(d) !== path.resolve(pluginDir)
            );
            this.configManager.setConfig('main', config);
          }
        }
      } else {
        // Default plugin dir so delete it
        if (removeFiles && pluginDir && fs.existsSync(pluginDir)) {
          try {
            fs.rmSync(pluginDir, { recursive: true, force: true });
          } catch (error) {
            logger.error(`Failed to remove plugin files from disk: ${error.message}`);
            return {
              success: false,
              error: `Failed to remove plugin files: ${error.message}`
            };
          }
        }
      }
      
      this.notifyPluginsChanged();

      return {
        success: true,
        message: `Plugin '${pluginName}' uninstalled successfully`,
        removedFiles: removeFiles
      };
    } catch (error) {
      logger.error(`Error uninstalling plugin ${pluginName}: ${error.message}`);
      return {
        success: false,
        error: `Failed to uninstall plugin: ${error.message}`
      };
    }
  }
  
  /**
   * Load plugins with optional specific plugin restart
   */
  async loadPlugins(restartPluginName = null) {
    try {
      // Stop specific plugin process if restart is requested
      if (restartPluginName) {
        await this.stopPluginProcess(restartPluginName);
      }

      this.plugins.clear();
      // Helper: check if a directory contains plugin.json
      const isPluginDir = (dir) => {
        return fs.existsSync(path.join(dir, 'plugin.json'));
      };

      // Helper: try to load a single plugin directory
      const tryLoadPlugin = (pluginDir) => {
        const metaPath = path.join(pluginDir, 'plugin.json');
        try {
          const fileContent = fs.readFileSync(metaPath, 'utf-8');
          if (!fileContent.trim()) {
            logger.warn(`Empty plugin.json file in ${pluginDir}`);
            return;
          }
          const meta = JSON.parse(fileContent);
          if (!meta.name) {
            logger.warn(`Plugin missing name in ${pluginDir}`);
            return;
          }
          const pluginInfo = {
            ...meta,
            dir: pluginDir,
            loadedAt: new Date().toISOString()
          };
          this.plugins.set(meta.name, pluginInfo);
          logger.info(`Plugin loaded: ${meta.name}`);
        } catch (e) {
          logger.error(`Failed to load plugin from ${pluginDir}: ${e.message}`);
        }
      };
      for (const dir of this.getAllPluginDirs()) {
        if (!fs.existsSync(dir)) {
          logger.warn(`Plugin directory does not exist: ${dir}`);
          continue;
        }

        // 1. If the directory itself is a plugin directory, load it directly
        if (isPluginDir(dir)) {
          tryLoadPlugin(dir);
          continue;
        }

        // 2. Otherwise, scan all its subdirectories
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          if (fs.statSync(fullPath).isDirectory() && isPluginDir(fullPath)) {
            tryLoadPlugin(fullPath);
          }
        }
      }
      
      logger.info(`Plugin loading completed, ${this.plugins.size} plugins loaded.`);
      
      // Restart specific dependent plugin if restart is requested
      if (restartPluginName) {
        const pluginInfo = this.plugins.get(restartPluginName);
        if (pluginInfo && pluginInfo.enabled !== false && pluginInfo.startupMode === 'dependent') {
          try {
            await this.createProcess(restartPluginName);
            const process = this.processes.get(restartPluginName);
            if (process && process.window) {
              process.window.hide();
              process.startupMode = 'dependent';
            }
          } catch (error) {
            logger.error(`Failed to restart dependent plugin ${restartPluginName}: ${error.message}`);
          }
        }
      }
      
    } catch (error) {
      throw error;
    }
  }

  /**
   * Watch for plugin changes
   */
  watchPlugins() {
    try {
      // Close previous watcher first
      if (this.watcher) {
        this.watcher.close();
      }
      
      // Ensure plugins directory exists
      if (!fs.existsSync(this.defaultDir)) {
        fs.mkdirSync(this.defaultDir, { recursive: true });
      }
      for (const dir of this.customDirs) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }
      
      // Watch both default directory and all custom directories
      const allWatchDirs = [this.defaultDir, ...this.customDirs];
      this.watcher = chokidar.watch(allWatchDirs, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: true, // Ignore initial scan to avoid duplicate loading
        depth: 2, // Watch subdirectories
        awaitWriteFinish: {
          stabilityThreshold: 50, // Reduced for faster response
          pollInterval: 50
        },
        usePolling: true, // Use polling for better file change detection
        interval: 100 // Polling interval
      });
      
      this.watcher
        .on('addDir', async (dirPath) => {
          await this.loadPlugins(); // Reload all plugins
          this.notifyPluginsChanged();
        })
        .on('unlinkDir', async (dirPath) => {
          await this.loadPlugins(); // Reload all plugins
          this.notifyPluginsChanged();
        })
        .on('change', async (filePath) => {
          // Extract plugin name from file path
          const pluginName = path.basename(path.dirname(filePath));
          // Add a small delay to ensure file is fully written
          setTimeout(async () => {
            await this.loadPlugins(pluginName); // Restart specific plugin
            this.notifyPluginsChanged();
          }, 100);
        })
        .on('add', async (filePath) => {
          // Extract plugin name from file path
          const pluginName = path.basename(path.dirname(filePath));
          await this.loadPlugins(pluginName); // Restart specific plugin
          this.notifyPluginsChanged();
        })
        .on('unlink', async (filePath) => {
          // Extract plugin name from file path
          const pluginName = path.basename(path.dirname(filePath));
          await this.loadPlugins(pluginName); // Restart specific plugin
          this.notifyPluginsChanged();
        })
        .on('error', (error) => {
          logger.error(`Plugin watcher error: ${error.message}`);
          // Don't throw error, just log it to prevent watcher from stopping
        })
      
    } catch (error) {
      logger.error(`Error setting up plugin watcher: ${error.message}`);
      throw error;
    }
  }

  /**
   * Notify plugin changes
   */
  notifyPluginsChanged() {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents) {
        const pluginsList = this.getPluginsList();
        this.mainWindow.webContents.send('plugins-changed', pluginsList);
      } else {
        logger.warn('Cannot notify plugins: mainWindow unavailable');
      }
    } catch (error) {
      logger.error(`Error in notifyPluginsChanged: ${error.message}`);
    }
  }

  /**
   * Get plugin list
   */
  getPluginsList() {
    try {
      return Array.from(this.plugins.values()).map(plugin => ({
        name: plugin.name,
        description: plugin.description,
        version: plugin.version,
        author: plugin.author,
        icon: path.join(plugin.dir, plugin.icon),
        shortName: plugin.shortName || plugin.name,
        type: plugin.type || 'custom',
        enabled: plugin.enabled !== false,
        loadedAt: plugin.loadedAt,
        startupMode: plugin.startupMode || 'independent',
        ui: plugin.ui,
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Get plugin info
   */
  getPluginInfo(pluginName) {
    return this.plugins.get(pluginName);
  }

  /**
   * Check if plugin exists
   */
  hasPlugin(pluginName) {
    return this.plugins.has(pluginName);
  }

  /**
   * get running plugin
   */
  async getProcess(pluginName, forceNew = false) {
    if (this.processes.has(pluginName)) {
      const info = this.processes.get(pluginName);
      if (!info.window || info.window.isDestroyed()) {
        this.processes.delete(pluginName);
      }
    }
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
    // Use the plugin's actual directory from the loaded plugin info
    const pluginInfo = this.plugins.get(pluginName);
    if (!pluginInfo) {throw new Error(`Plugin info not found for: ${pluginName}`);}
    const pluginPath = pluginInfo.dir;
    const metaPath = path.join(pluginPath, 'plugin.json');
    if (!fs.existsSync(metaPath)) {throw new Error(`Plugin configuration file does not exist: ${metaPath}`);}
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const htmlEntry = meta.ui && meta.ui.html ? meta.ui.html : 'index.html';
    const isUrl = /^https?:\/\//.test(htmlEntry);
    const htmlPath = isUrl ? htmlEntry : path.join(pluginPath, htmlEntry);
    const pluginPreloadPath = path.join(pluginPath, meta.preload ? meta.preload : 'preload.js');
    
    // Use window-state to record and restore window state, with unique key per plugin
    const mainWindowState = WindowStateKeeper({
      defaultWidth: meta.ui.width || 900,
      defaultHeight: meta.ui.height || 600,
      file: `window-state-${pluginName}.json`
    });

    const win = new BrowserWindow({
      x: mainWindowState.x,
      y: mainWindowState.y,
      width: mainWindowState.width,
      height: mainWindowState.height,
      title: meta.ui.title || meta.shortName || meta.name || 'Plugin',
      show: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      frame: meta.ui.frame !== undefined ? meta.ui.frame : true,
      type: 'popup',
      webPreferences: {
        nativeWindowOpen: true,
        sandbox: false, 
        preload: path.join(__dirname, 'plugin-preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        additionalArguments: [`--plugin-preload-path=${pluginPreloadPath}`]
      }
    });

    // Manage window with window-state
    mainWindowState.manage(win);

    // Set plugin window properties once (no need for periodic updates)
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true});

    if (meta.debug) {
      win.webContents.openDevTools();
    }
    
    if (isUrl) {
      await win.loadURL(htmlPath);
    } else {
      await win.loadFile(htmlPath);
    }
    const info = { window: win, status: 'idle', meta };
    this.processes.set(pluginName, info);

    // Use electron-positioner to center the window on the screen where the mouse is
    win.once('ready-to-show', () => {
      const mouse = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(mouse);
      // Move window to the target screen first
      win.setBounds({
        x: display.bounds.x,
        y: display.bounds.y,
        width: win.getBounds().width,
        height: win.getBounds().height
      });
      const positioner = new Positioner(win);
      positioner.move('center');
      // Do NOT show or focus here
    });

    win.on('show', () => {
      // Only focus, no need to reset properties every time
      win.focus();
    });
    
    if (meta.ui && meta.ui.hideOnBlur) {
      win.on('blur', () => {
        const pluginInfo = this.plugins.get(pluginName);
        const startupMode = pluginInfo?.startupMode || 'independent';
        
        if (startupMode === 'dependent') {
          win.hide();
          switchToPreviousApp();
        } else {
          win.close();
        }
      });
    }
    
    win.on('closed', () => {
      this.processes.delete(pluginName);
      switchToPreviousApp();
    });

    win.on('close', (event) => {
      const pluginInfo = this.plugins.get(pluginName);
      const startupMode = pluginInfo?.startupMode || 'independent';
      
      if (startupMode === 'independent') {
        return
      }

      event.preventDefault();
      win.hide();
    });

    return info;
  }

  /**
   * Auto-start dependent plugins
   */
  async autoStartDependentPlugins() {
    try {      
      for (const [pluginName, pluginInfo] of this.plugins) {
        // Check if plugin is enabled and has dependent startup mode
        if (pluginInfo.enabled !== false && pluginInfo.startupMode === 'dependent') {          
          try {
            // For dependent plugins, create process but don't show window
            // This allows plugins to run in background while keeping UI hidden
            const process = await this.createProcess(pluginName);
            if (process && process.window) {
              // Ensure window is hidden but process continues running
              process.window.hide();
              // Mark as dependent mode
              process.startupMode = 'dependent';
            }
          } catch (error) {
            logger.error(`Failed to auto-start dependent plugin ${pluginName}: ${error.message}`);
          }
        }
      }
      
    } catch (error) {
      logger.error(`Error in autoStartDependentPlugins: ${error.message}`);
    }
  }

  /**
   * Check if window display needs enhancement (fast detection)
   */
  async checkIfNeedsEnhancement() {
    try {
      // 快速检查：使用 Electron 原生 API 预检
      const displays = screen.getAllDisplays();
      let hasFullscreenLikeDisplay = false;
      
      for (const display of displays) {
        // 检查是否有显示器的工作区明显小于显示区（可能有全屏应用）
        const workAreaRatio = (display.workArea.width * display.workArea.height) / 
                             (display.bounds.width * display.bounds.height);
        
        if (workAreaRatio < 0.9) { // 工作区小于90%可能有全屏应用
          hasFullscreenLikeDisplay = true;
          break;
        }
      }
      
      if (!hasFullscreenLikeDisplay) {
        return false; // 快速判断：无需增强
      }
      
      // 进一步检查：使用增强管理器的缓存检测
      const enhancedWindowManager = this.appManager?.getComponent('enhancedWindowManager');
      if (enhancedWindowManager) {
        // 使用缓存的全屏检测结果（避免 AppleScript 延时）
        const now = Date.now();
        const cacheAge = now - (enhancedWindowManager.lastFullscreenCheck || 0);
        
        // 如果缓存新鲜且显示有全屏应用，则需要增强
        if (cacheAge < 10000 && enhancedWindowManager.fullscreenAppCache === true) {
          return true;
        }
        
        // 如果缓存过旧，进行一次快速检测（但不阻塞）
        if (cacheAge > 10000) {
          // 异步更新缓存，不等待结果
          enhancedWindowManager.detectFullscreenApp().catch(() => {});
        }
      }
      
      return false; // 默认不需要增强，优先快速显示
    } catch (error) {
      logger.warn('Failed to check enhancement needs:', error);
      return false; // 出错时使用快速路径
    }
  }

  /**
   * Quick show plugin window (original logic, no delays)
   */
  showPluginWindowQuick(pluginName, processInfo, pluginInfo) {
    try {
      const mouse = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(mouse);

      // Always use plugin config width/height if available, fallback to default
      let width = 900;
      let height = 600;
      if (pluginInfo && pluginInfo.ui) {
        if (typeof pluginInfo.ui.width === 'number') {width = pluginInfo.ui.width;}
        if (typeof pluginInfo.ui.height === 'number') {height = pluginInfo.ui.height;}
      }

      let x, y;
      if (pluginInfo && pluginInfo.popupAtCursor) {
        // Popup at cursor right side
        x = mouse.x + 10; // 10px right of cursor
        y = mouse.y - Math.floor(height / 2);
        
        if (x + width > display.bounds.x + display.bounds.width) {
          x = display.bounds.x + display.bounds.width - width;
        }
        if (y < display.bounds.y) {y = display.bounds.y;}
        if (y + height > display.bounds.y + display.bounds.height) {
          y = display.bounds.y + display.bounds.height - height;
        }
      } else {
        // Center in current screen
        x = display.bounds.x + Math.floor((display.bounds.width - width) / 2);
        y = display.bounds.y + Math.floor((display.bounds.height - height) / 2);
      }

      processInfo.window.setBounds({
        x,
        y,
        width,
        height
      });
      processInfo.window.show();
      processInfo.window.focus();
      return true;
    } catch (error) {
      logger.warn(`Quick show window failed for ${pluginName}:`, error);
      return false;
    }
  }

  /**
   * Show plugin window if it exists and is hidden
   */
  async showPluginWindow(pluginName) {
    const processInfo = this.processes.get(pluginName);
    if (processInfo && processInfo.window && !processInfo.window.isDestroyed()) {
      const pluginInfo = this.plugins.get(pluginName);
      
      // 智能选择显示策略
      const needsEnhancement = await this.checkIfNeedsEnhancement();
      
      if (needsEnhancement) {
        // 使用增强管理器（全屏环境或特殊情况）
        const enhancedWindowManager = this.appManager?.getComponent('enhancedWindowManager');
        if (enhancedWindowManager) {
          try {
            logger.info(`Using enhanced method for ${pluginName} (fullscreen environment detected)`);
            enhancedWindowManager.registerWindow(pluginName, processInfo.window, {
              forceTopLevel: 'modal-panel',
              checkVisibility: true,
              autoRecover: true
            });
            
            const result = await enhancedWindowManager.forceShowWindow(pluginName);
            if (result) {return result;}
          } catch (error) {
            logger.warn(`Enhanced window manager failed for ${pluginName}, using fallback:`, error);
          }
        }
      }
      
      // 使用快速显示（默认路径）
      return this.showPluginWindowQuick(pluginName, processInfo, pluginInfo);
    } else {
      const pluginInfo = this.plugins.get(pluginName);
      if (pluginInfo && pluginInfo.startupMode === 'dependent') {
        return false;
      }
      return false;
    }
  }

  /**
   * Hide plugin window if it exists and is visible
   */
  hidePluginWindow(pluginName) {
    const processInfo = this.processes.get(pluginName);
    if (processInfo && processInfo.window && !processInfo.window.isDestroyed()) {
      if (processInfo.window.isVisible()) {
        processInfo.window.hide();
        switchToPreviousApp();
        return true;
      }
    }
    return false;
  }

  /**
   * Get plugin window status
   */
  getPluginWindowStatus(pluginName) {
    const processInfo = this.processes.get(pluginName);
    if (processInfo && processInfo.window && !processInfo.window.isDestroyed()) {
      return {
        exists: true,
        visible: processInfo.window.isVisible(),
        destroyed: processInfo.window.isDestroyed(),
        startupMode: this.plugins.get(pluginName)?.startupMode || 'independent'
      };
    }
    return {
      exists: false,
      visible: false,
      destroyed: true,
      startupMode: this.plugins.get(pluginName)?.startupMode || 'independent'
    };
  }

  /**
   * Execute plugin with improved dependent plugin handling
   */
  async executePlugin(pluginName, action, ...args) {
    try {
      const info = await this.getProcess(pluginName);
      info.status = 'busy';
      
      // Ensure window is shown before sending execute command
      await this.showPluginWindow(pluginName);
      
      info.window.webContents.send('plugin-execute', { action, args });
      info.status = 'idle';
      return { success: true };
    } catch (error) {
      logger.error(`Error executing plugin ${pluginName}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  getPoolStatus() {
    return Array.from(this.processes.keys());
  }

  /**
   * Test watcher functionality
   */
  testWatcher() {
    // Manually trigger a reload to test
    this.loadPlugins().then(() => {
      this.notifyPluginsChanged();
    }).catch(error => {
      logger.error(`Manual plugin reload failed: ${error.message}`);
    });
  }

  getAllPluginDirs() {
    // Return all valid plugin directories, default directory first
    return [this.defaultDir, ...this.customDirs];
  }

  // Add a custom plugin directory (case-insensitive, ignore trailing slash)
  async addCustomPluginDir(dir) {
    const norm = (d) => d.replace(/[\\/]+$/, '').toLowerCase();
    
    // Check if this directory is already in custom dirs
    if (norm(dir) === norm(this.defaultDir)) {
      return false;
    }
    
    // Check if this exact directory is already added
    if (this.customDirs.some(d => norm(d) === norm(dir))) {
      return false;
    }
    
    // Scan the directory for plugin subdirectories
    const pluginSubdirs = this.scanDirectoryForPlugins(dir);
    
    if (pluginSubdirs.length === 0) {
      return false; // No plugins found in this directory
    }
    
    // Add each plugin subdirectory to custom dirs
    for (const pluginDir of pluginSubdirs) {
      if (!this.customDirs.some(d => norm(d) === norm(pluginDir))) {
        this.customDirs.push(pluginDir);
      }
    }
    
    await this.loadPlugins()
  
    // Re-setup watcher to include the new directories
    if (this.watcher) {
      this.watcher.close();
      this.watchPlugins();
    }
    
    return true;
  }

  /**
   * Scan a directory for plugin subdirectories and check if the directory itself is a plugin
   * @param {string} dir Directory to scan
   * @returns {string[]} Array of plugin directory paths
   */
  scanDirectoryForPlugins(dir) {
    const pluginDirs = [];
    
    if (!fs.existsSync(dir)) {
      return pluginDirs;
    }
    
    try {
      // First check if the directory itself is a plugin
      const dirPluginJsonPath = path.join(dir, 'plugin.json');
      if (fs.existsSync(dirPluginJsonPath)) {
        pluginDirs.push(dir);
      }
      
      // Then check subdirectories
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Check if this directory contains a plugin.json file
          const pluginJsonPath = path.join(fullPath, 'plugin.json');
          if (fs.existsSync(pluginJsonPath)) {
            pluginDirs.push(fullPath);
          }
        }
      }
    } catch (error) {
      logger.error(`Error scanning directory ${dir} for plugins: ${error.message}`);
    }
    
    return pluginDirs;
  }

  // Get all custom plugin directories
  getCustomPluginDirs() {
    return this.customDirs.slice();
  }

  // Validate custom plugin directories (call on startup)
  refreshCustomPluginDirs() {
    this.customDirs = this.customDirs.filter(dir => fs.existsSync(dir));
  }
}

module.exports = PluginManager;  