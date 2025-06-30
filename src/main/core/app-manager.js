const BaseManager = require('./base-manager');
const Logger = require('./logger');
const ConfigManager = require('./config-manager');
const PerformanceMonitor = require('./performance-monitor');
const ErrorHandler = require('./error-handler');
const { MessageBuilder, MessageHandler, MessageRouter } = require('./message-protocol');
const PluginProcessPool = require('../plugin-manager/process-pool');
const PluginManager = require('../plugin-manager/index');
const PluginProcessManager = require('../plugin-manager/process-manager');

/**
 * 应用管理器 - 统一管理所有核心组件
 */
class AppManager extends BaseManager {
  constructor() {
    super('AppManager');
    
    // 核心组件
    this.logger = null;
    this.configManager = null;
    this.performanceMonitor = null;
    this.errorHandler = null;
    this.messageBuilder = null;
    this.messageHandler = null;
    this.messageRouter = null;
    
    // 插件相关组件
    this.pluginProcessPool = null;
    this.pluginManager = null;
    this.pluginProcessManager = null;
    
    // 应用状态
    this.isInitialized = false;
    this.startTime = null;
    this.appStatus = {
      version: '1.0.0',
      status: 'initializing',
      uptime: 0,
      componentCount: 0,
      lastError: null
    };
  }

  /**
   * 初始化应用管理器
   */
  async initialize(options = {}) {
    try {
      this.startTime = Date.now();
      this.appStatus.status = 'initializing';
      
      // 1. 初始化日志系统
      this.logger = new Logger();
      await this.logger.initialize(options.logging || {});
      this.logger.log('应用管理器初始化开始');
      
      // 2. 初始化配置管理器
      this.configManager = new ConfigManager();
      await this.configManager.initialize({
        configDir: options.configDir,
        logger: this.logger
      });
      
      // 3. 初始化性能监控
      this.performanceMonitor = new PerformanceMonitor();
      await this.performanceMonitor.initialize({
        logger: this.logger,
        configManager: this.configManager
      });
      
      // 4. 初始化错误处理器
      this.errorHandler = new ErrorHandler();
      await this.errorHandler.initialize({
        logger: this.logger,
        configManager: this.configManager,
        performanceMonitor: this.performanceMonitor
      });
      
      // 5. 初始化消息协议组件
      this.messageBuilder = MessageBuilder;
      this.messageHandler = new MessageHandler();
      this.messageRouter = new MessageRouter();
      
      // 6. 初始化插件进程池
      this.pluginProcessPool = new PluginProcessPool(this);
      await this.pluginProcessPool.initialize({
        macTools: options.macTools,
        resultWindowManager: options.resultWindowManager
      });
      
      // 7. 初始化插件管理器
      this.pluginManager = new PluginManager(this);
      await this.pluginManager.initialize({
        mainWindow: options.mainWindow,
        resultWindowManager: options.resultWindowManager,
        enableWatch: options.enablePluginWatch !== false
      });
      
      // 8. 初始化插件进程管理器（兼容旧版本）
      this.pluginProcessManager = new PluginProcessManager(this);
      await this.pluginProcessManager.initialize({
        macTools: options.macTools,
        resultWindowManager: options.resultWindowManager
      });
      
      // 更新应用状态
      this.appStatus.status = 'running';
      this.appStatus.componentCount = this.getComponentCount();
      this.isInitialized = true;
      
      this.logger.log('应用管理器初始化完成');
      
    } catch (error) {
      this.appStatus.status = 'error';
      this.appStatus.lastError = error.message;
      
      if (this.logger) {
        this.logger.log(`应用管理器初始化失败: ${error.message}`, 'error');
      } else {
        console.error('应用管理器初始化失败:', error);
      }
      
      throw error;
    }
  }

  /**
   * 销毁应用管理器
   */
  async destroy() {
    try {
      this.appStatus.status = 'shutting_down';
      this.logger.log('应用管理器开始销毁');
      
      // 按相反顺序销毁组件
      const destroyOrder = [
        'pluginProcessManager',
        'pluginManager', 
        'pluginProcessPool',
        'messageHandler',
        'messageRouter',
        'errorHandler',
        'performanceMonitor',
        'configManager',
        'logger'
      ];
      
      for (const componentName of destroyOrder) {
        const component = this[componentName];
        if (component && typeof component.destroy === 'function') {
          try {
            await component.destroy();
            this.logger.log(`${componentName} 已销毁`);
          } catch (error) {
            this.logger.log(`${componentName} 销毁失败: ${error.message}`, 'error');
          }
        }
      }
      
      this.appStatus.status = 'stopped';
      this.isInitialized = false;
      
      console.log('应用管理器已销毁');
      
    } catch (error) {
      console.error('应用管理器销毁失败:', error);
      throw error;
    }
  }

  /**
   * 获取组件
   */
  getComponent(componentName) {
    const componentMap = {
      logger: this.logger,
      configManager: this.configManager,
      performanceMonitor: this.performanceMonitor,
      errorHandler: this.errorHandler,
      messageBuilder: this.messageBuilder,
      messageHandler: this.messageHandler,
      messageRouter: this.messageRouter,
      pluginProcessPool: this.pluginProcessPool,
      pluginManager: this.pluginManager,
      pluginProcessManager: this.pluginProcessManager
    };
    
    return componentMap[componentName];
  }

  /**
   * 获取所有组件
   */
  getAllComponents() {
    return {
      logger: this.logger,
      configManager: this.configManager,
      performanceMonitor: this.performanceMonitor,
      errorHandler: this.errorHandler,
      messageBuilder: this.messageBuilder,
      messageHandler: this.messageHandler,
      messageRouter: this.messageRouter,
      pluginProcessPool: this.pluginProcessPool,
      pluginManager: this.pluginManager,
      pluginProcessManager: this.pluginProcessManager
    };
  }

  /**
   * 获取组件数量
   */
  getComponentCount() {
    return Object.keys(this.getAllComponents()).filter(key => this[key] !== null).length;
  }

  /**
   * 获取应用状态
   */
  getAppStatus() {
    if (this.startTime) {
      this.appStatus.uptime = Date.now() - this.startTime;
    }
    
    return {
      ...this.appStatus,
      components: Object.keys(this.getAllComponents()).reduce((acc, key) => {
        const component = this[key];
        acc[key] = {
          active: !!component,
          status: component ? 'active' : 'inactive',
          hasDestroy: typeof component?.destroy === 'function',
          hasGetStatus: typeof component?.getStatus === 'function'
        };
        return acc;
      }, {})
    };
  }

  /**
   * 获取详细状态信息
   */
  getDetailedStatus() {
    const status = this.getAppStatus();
    
    // 添加各组件的详细状态
    const components = this.getAllComponents();
    for (const [name, component] of Object.entries(components)) {
      if (component && typeof component.getStatus === 'function') {
        try {
          status.components[name].details = component.getStatus();
        } catch (error) {
          status.components[name].details = { error: error.message };
        }
      }
    }
    
    return status;
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      components: {},
      issues: []
    };
    
    const components = this.getAllComponents();
    
    for (const [name, component] of Object.entries(components)) {
      try {
        if (!component) {
          health.components[name] = { status: 'missing', error: 'Component not initialized' };
          health.issues.push(`${name}: Component not initialized`);
          continue;
        }
        
        // 检查组件是否有健康检查方法
        if (typeof component.healthCheck === 'function') {
          const componentHealth = await component.healthCheck();
          health.components[name] = componentHealth;
          
          if (componentHealth.status !== 'healthy') {
            health.issues.push(`${name}: ${componentHealth.error || 'Unknown error'}`);
          }
        } else {
          // 基本检查
          health.components[name] = { 
            status: 'unknown', 
            message: 'No health check method available' 
          };
        }
        
      } catch (error) {
        health.components[name] = { 
          status: 'error', 
          error: error.message 
        };
        health.issues.push(`${name}: ${error.message}`);
      }
    }
    
    // 如果有问题，更新整体状态
    if (health.issues.length > 0) {
      health.status = 'unhealthy';
    }
    
    return health;
  }

  /**
   * 重启组件
   */
  async restartComponent(componentName) {
    try {
      this.logger.log(`重启组件: ${componentName}`);
      
      const component = this.getComponent(componentName);
      if (!component) {
        throw new Error(`组件不存在: ${componentName}`);
      }
      
      // 销毁组件
      if (typeof component.destroy === 'function') {
        await component.destroy();
      }
      
      // 重新初始化组件
      switch (componentName) {
        case 'logger':
          this.logger = new Logger();
          await this.logger.initialize({});
          break;
          
        case 'configManager':
          this.configManager = new ConfigManager();
          await this.configManager.initialize({ logger: this.logger });
          break;
          
        case 'performanceMonitor':
          this.performanceMonitor = new PerformanceMonitor();
          await this.performanceMonitor.initialize({ 
            logger: this.logger, 
            configManager: this.configManager 
          });
          break;
          
        case 'errorHandler':
          this.errorHandler = new ErrorHandler();
          await this.errorHandler.initialize({ 
            logger: this.logger, 
            configManager: this.configManager, 
            performanceMonitor: this.performanceMonitor 
          });
          break;
          
        case 'pluginProcessPool':
          this.pluginProcessPool = new PluginProcessPool(this);
          await this.pluginProcessPool.initialize({});
          break;
          
        case 'pluginManager':
          this.pluginManager = new PluginManager(this);
          await this.pluginManager.initialize({});
          break;
          
        default:
          throw new Error(`不支持的组件重启: ${componentName}`);
      }
      
      this.logger.log(`组件 ${componentName} 重启成功`);
      
    } catch (error) {
      this.logger.log(`组件 ${componentName} 重启失败: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * 发送消息到组件
   */
  async sendMessage(componentName, message) {
    try {
      const component = this.getComponent(componentName);
      if (!component) {
        throw new Error(`组件不存在: ${componentName}`);
      }
      
      if (typeof component.handleMessage === 'function') {
        return await component.handleMessage(message);
      } else {
        throw new Error(`组件 ${componentName} 不支持消息处理`);
      }
      
    } catch (error) {
      this.logger.log(`发送消息到组件 ${componentName} 失败: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * 广播消息到所有组件
   */
  async broadcastMessage(message) {
    const results = {};
    const components = this.getAllComponents();
    
    for (const [name, component] of Object.entries(components)) {
      if (component && typeof component.handleMessage === 'function') {
        try {
          results[name] = await component.handleMessage(message);
        } catch (error) {
          results[name] = { error: error.message };
        }
      } else {
        results[name] = { error: 'Component does not support message handling' };
      }
    }
    
    return results;
  }
}

module.exports = { AppManager }; 