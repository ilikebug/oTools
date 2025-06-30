const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const BaseManager = require('./base-manager');

/**
 * 配置管理器
 * 负责加载、验证、热重载应用配置
 */
class ConfigManager extends BaseManager {
  constructor() {
    super('ConfigManager');
    this.configs = new Map();
    this.watchers = new Map();
    this.validators = new Map();
    this.configDir = null;
  }

  /**
   * 初始化配置管理器
   */
  async onInitialize(options) {
    this.configDir = options.configDir || path.join(__dirname, '../../config');
    
    // 确保配置目录存在
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    
    // 加载所有配置
    await this.loadAllConfigurations();
    
    // 设置配置监听
    this.setupConfigWatchers();
    
    this.log('配置管理器初始化完成');
  }

  /**
   * 销毁配置管理器
   */
  async onDestroy() {
    // 关闭所有文件监听器
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    
    this.log('配置管理器已销毁');
  }

  /**
   * 加载所有配置文件
   */
  async loadAllConfigurations() {
    try {
      // 加载主配置
      await this.loadMainConfig();
      
      // 加载插件配置
      await this.loadPluginConfigs();
      
      // 验证所有配置
      this.validateAllConfigurations();
      
      this.log(`已加载 ${this.configs.size} 个配置文件`);
    } catch (error) {
      this.log(`加载配置失败: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * 加载主配置文件
   */
  async loadMainConfig() {
    const mainConfigPath = path.join(this.configDir, 'main.json');
    const defaultConfig = this.getDefaultMainConfig();
    
    let config;
    if (fs.existsSync(mainConfigPath)) {
      config = JSON.parse(fs.readFileSync(mainConfigPath, 'utf-8'));
      // 合并默认配置
      config = this.mergeConfigs(defaultConfig, config);
    } else {
      config = defaultConfig;
      // 保存默认配置
      this.saveConfig('main', config);
    }
    
    this.configs.set('main', config);
    this.log('主配置加载完成');
  }

  /**
   * 获取默认主配置
   */
  getDefaultMainConfig() {
    return {
      app: {
        name: 'oTools',
        version: '1.0.0',
        debug: false
      },
      window: {
        width: 480,
        height: 420,
        alwaysOnTop: true,
        skipTaskbar: true
      },
      plugins: {
        autoLoad: true,
        maxProcesses: 5,
        timeout: 30000
      },
      logging: {
        level: 'info',
        enableFile: true,
        logFile: 'logs/otools.log'
      },
      shortcuts: {
        toggle: 'CommandOrControl+Shift+Space'
      }
    };
  }

  /**
   * 加载插件配置
   */
  async loadPluginConfigs() {
    const pluginsConfigDir = path.join(this.configDir, 'plugins');
    
    if (!fs.existsSync(pluginsConfigDir)) {
      fs.mkdirSync(pluginsConfigDir, { recursive: true });
      return;
    }
    
    const files = fs.readdirSync(pluginsConfigDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const pluginName = path.basename(file, '.json');
        const configPath = path.join(pluginsConfigDir, file);
        
        try {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          this.configs.set(`plugin:${pluginName}`, config);
          this.log(`插件配置加载完成: ${pluginName}`);
        } catch (error) {
          this.log(`加载插件配置失败 ${pluginName}: ${error.message}`, 'error');
        }
      }
    }
  }

  /**
   * 设置配置文件监听
   */
  setupConfigWatchers() {
    // 监听主配置文件
    const mainConfigPath = path.join(this.configDir, 'main.json');
    this.watchConfigFile('main', mainConfigPath);
    
    // 监听插件配置文件
    const pluginsConfigDir = path.join(this.configDir, 'plugins');
    if (fs.existsSync(pluginsConfigDir)) {
      const watcher = chokidar.watch(path.join(pluginsConfigDir, '*.json'));
      
      watcher.on('change', (filePath) => {
        const pluginName = path.basename(filePath, '.json');
        this.reloadPluginConfig(pluginName);
      });
      
      this.watchers.set('plugins', watcher);
    }
  }

  /**
   * 监听单个配置文件
   */
  watchConfigFile(configName, filePath) {
    if (!fs.existsSync(filePath)) {
      return;
    }
    
    const watcher = chokidar.watch(filePath);
    
    watcher.on('change', () => {
      this.reloadConfig(configName);
    });
    
    this.watchers.set(configName, watcher);
  }

  /**
   * 重新加载配置
   */
  async reloadConfig(configName) {
    try {
      if (configName === 'main') {
        await this.loadMainConfig();
      } else if (configName.startsWith('plugin:')) {
        const pluginName = configName.replace('plugin:', '');
        await this.reloadPluginConfig(pluginName);
      }
      
      this.log(`配置重新加载完成: ${configName}`);
      
      // 通知配置变更
      this.notifyConfigChange(configName);
    } catch (error) {
      this.log(`重新加载配置失败 ${configName}: ${error.message}`, 'error');
    }
  }

  /**
   * 重新加载插件配置
   */
  async reloadPluginConfig(pluginName) {
    const configPath = path.join(this.configDir, 'plugins', `${pluginName}.json`);
    
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      this.configs.set(`plugin:${pluginName}`, config);
    }
  }

  /**
   * 获取配置
   */
  getConfig(configName, defaultValue = null) {
    return this.configs.get(configName) || defaultValue;
  }

  /**
   * 设置配置
   */
  setConfig(configName, config) {
    this.configs.set(configName, config);
    this.saveConfig(configName, config);
  }

  /**
   * 保存配置到文件
   */
  saveConfig(configName, config) {
    try {
      let filePath;
      if (configName === 'main') {
        filePath = path.join(this.configDir, 'main.json');
      } else if (configName.startsWith('plugin:')) {
        const pluginName = configName.replace('plugin:', '');
        const pluginsDir = path.join(this.configDir, 'plugins');
        if (!fs.existsSync(pluginsDir)) {
          fs.mkdirSync(pluginsDir, { recursive: true });
        }
        filePath = path.join(pluginsDir, `${pluginName}.json`);
      }
      
      if (filePath) {
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
        this.log(`配置已保存: ${configName}`);
      }
    } catch (error) {
      this.log(`保存配置失败 ${configName}: ${error.message}`, 'error');
    }
  }

  /**
   * 合并配置
   */
  mergeConfigs(defaultConfig, userConfig) {
    const merged = { ...defaultConfig };
    
    for (const [key, value] of Object.entries(userConfig)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        merged[key] = this.mergeConfigs(merged[key] || {}, value);
      } else {
        merged[key] = value;
      }
    }
    
    return merged;
  }

  /**
   * 验证配置
   */
  validateConfiguration(config, schema) {
    // 简单的配置验证
    if (!config || typeof config !== 'object') {
      throw new Error('配置必须是对象');
    }
    
    // 可以在这里添加更复杂的验证逻辑
    return true;
  }

  /**
   * 验证所有配置
   */
  validateAllConfigurations() {
    for (const [name, config] of this.configs) {
      try {
        this.validateConfiguration(config);
      } catch (error) {
        this.log(`配置验证失败 ${name}: ${error.message}`, 'error');
      }
    }
  }

  /**
   * 通知配置变更
   */
  notifyConfigChange(configName) {
    // 这里可以通过事件系统通知其他组件
    // 暂时使用简单的日志记录
    this.log(`配置变更通知: ${configName}`);
  }

  /**
   * 获取所有配置名称
   */
  getConfigNames() {
    return Array.from(this.configs.keys());
  }

  /**
   * 获取配置统计信息
   */
  getStats() {
    return {
      totalConfigs: this.configs.size,
      configNames: this.getConfigNames(),
      watchersCount: this.watchers.size
    };
  }
}

module.exports = ConfigManager; 