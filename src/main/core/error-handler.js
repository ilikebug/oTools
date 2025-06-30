const BaseManager = require('./base-manager');

/**
 * 错误类型枚举
 */
const ErrorType = {
  PLUGIN_CRASH: 'plugin_crash',
  PROCESS_TIMEOUT: 'process_timeout',
  API_ERROR: 'api_error',
  CONFIG_ERROR: 'config_error',
  NETWORK_ERROR: 'network_error',
  SYSTEM_ERROR: 'system_error'
};

/**
 * 错误严重程度枚举
 */
const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * 错误处理策略枚举
 */
const ErrorStrategy = {
  RETRY: 'retry',
  RESTART: 'restart',
  IGNORE: 'ignore',
  NOTIFY: 'notify',
  TERMINATE: 'terminate'
};

/**
 * 统一错误处理器
 * 提供错误分类、处理策略、恢复机制等功能
 */
class ErrorHandler extends BaseManager {
  constructor() {
    super('ErrorHandler');
    
    this.errors = [];
    this.errorCounts = new Map();
    this.recoveryStrategies = new Map();
    this.notificationCallbacks = [];
    
    this.maxErrors = 100;
    this.retryAttempts = 3;
    this.retryDelay = 1000;
    
    this.setupDefaultStrategies();
  }

  /**
   * 初始化错误处理器
   */
  async onInitialize(options) {
    this.maxErrors = options.maxErrors || this.maxErrors;
    this.retryAttempts = options.retryAttempts || this.retryAttempts;
    this.retryDelay = options.retryDelay || this.retryDelay;
    
    this.log('错误处理器初始化完成');
  }

  /**
   * 销毁错误处理器
   */
  async onDestroy() {
    this.errors = [];
    this.errorCounts.clear();
    this.recoveryStrategies.clear();
    this.notificationCallbacks = [];
    
    this.log('错误处理器已销毁');
  }

  /**
   * 设置默认错误处理策略
   */
  setupDefaultStrategies() {
    // 插件崩溃策略
    this.setRecoveryStrategy(ErrorType.PLUGIN_CRASH, {
      strategy: ErrorStrategy.RESTART,
      maxAttempts: 3,
      delay: 2000,
      notify: true
    });

    // 进程超时策略
    this.setRecoveryStrategy(ErrorType.PROCESS_TIMEOUT, {
      strategy: ErrorStrategy.RETRY,
      maxAttempts: 2,
      delay: 1000,
      notify: false
    });

    // API错误策略
    this.setRecoveryStrategy(ErrorType.API_ERROR, {
      strategy: ErrorStrategy.RETRY,
      maxAttempts: 3,
      delay: 500,
      notify: false
    });

    // 配置错误策略
    this.setRecoveryStrategy(ErrorType.CONFIG_ERROR, {
      strategy: ErrorStrategy.NOTIFY,
      maxAttempts: 1,
      delay: 0,
      notify: true
    });

    // 系统错误策略
    this.setRecoveryStrategy(ErrorType.SYSTEM_ERROR, {
      strategy: ErrorStrategy.TERMINATE,
      maxAttempts: 1,
      delay: 0,
      notify: true
    });
  }

  /**
   * 处理错误
   * @param {Error} error 错误对象
   * @param {Object} context 错误上下文
   */
  async handleError(error, context = {}) {
    const errorInfo = this.createErrorInfo(error, context);
    
    // 记录错误
    this.recordError(errorInfo);
    
    // 确定错误类型和严重程度
    const errorType = this.classifyError(error, context);
    const severity = this.assessSeverity(error, context);
    
    errorInfo.type = errorType;
    errorInfo.severity = severity;
    
    // 获取处理策略
    const strategy = this.getRecoveryStrategy(errorType);
    
    // 执行错误处理
    await this.executeErrorStrategy(errorInfo, strategy);
    
    // 发送通知
    if (strategy.notify) {
      this.notifyError(errorInfo);
    }
    
    this.log(`错误已处理: ${errorType} (${severity}) - ${error.message}`, 'error');
    
    return errorInfo;
  }

  /**
   * 创建错误信息对象
   * @param {Error} error 错误对象
   * @param {Object} context 错误上下文
   */
  createErrorInfo(error, context) {
    return {
      id: this.generateErrorId(),
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      name: error.name,
      context: {
        ...context,
        processId: process.pid,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
      }
    };
  }

  /**
   * 记录错误
   * @param {Object} errorInfo 错误信息
   */
  recordError(errorInfo) {
    this.errors.push(errorInfo);
    
    // 限制错误记录数量
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }
    
    // 统计错误数量
    const errorType = errorInfo.type || 'unknown';
    const count = this.errorCounts.get(errorType) || 0;
    this.errorCounts.set(errorType, count + 1);
  }

  /**
   * 分类错误
   * @param {Error} error 错误对象
   * @param {Object} context 错误上下文
   */
  classifyError(error, context) {
    const message = error.message.toLowerCase();
    const stack = error.stack.toLowerCase();
    
    // 插件相关错误
    if (message.includes('plugin') || message.includes('进程') || context.pluginName) {
      if (message.includes('timeout') || message.includes('超时')) {
        return ErrorType.PROCESS_TIMEOUT;
      }
      if (message.includes('crash') || message.includes('崩溃') || message.includes('exit')) {
        return ErrorType.PLUGIN_CRASH;
      }
      return ErrorType.PLUGIN_CRASH;
    }
    
    // API相关错误
    if (message.includes('api') || message.includes('调用失败')) {
      return ErrorType.API_ERROR;
    }
    
    // 配置相关错误
    if (message.includes('config') || message.includes('配置')) {
      return ErrorType.CONFIG_ERROR;
    }
    
    // 网络相关错误
    if (message.includes('network') || message.includes('网络') || message.includes('connection')) {
      return ErrorType.NETWORK_ERROR;
    }
    
    // 系统相关错误
    if (message.includes('system') || message.includes('系统') || message.includes('memory')) {
      return ErrorType.SYSTEM_ERROR;
    }
    
    return ErrorType.SYSTEM_ERROR;
  }

  /**
   * 评估错误严重程度
   * @param {Error} error 错误对象
   * @param {Object} context 错误上下文
   */
  assessSeverity(error, context) {
    const message = error.message.toLowerCase();
    
    // 致命错误
    if (message.includes('fatal') || message.includes('致命') || 
        message.includes('critical') || message.includes('严重')) {
      return ErrorSeverity.CRITICAL;
    }
    
    // 高严重程度
    if (message.includes('crash') || message.includes('崩溃') || 
        message.includes('terminate') || message.includes('终止')) {
      return ErrorSeverity.HIGH;
    }
    
    // 中等严重程度
    if (message.includes('timeout') || message.includes('超时') || 
        message.includes('failed') || message.includes('失败')) {
      return ErrorSeverity.MEDIUM;
    }
    
    // 低严重程度
    return ErrorSeverity.LOW;
  }

  /**
   * 设置恢复策略
   * @param {string} errorType 错误类型
   * @param {Object} strategy 策略配置
   */
  setRecoveryStrategy(errorType, strategy) {
    this.recoveryStrategies.set(errorType, {
      strategy: strategy.strategy,
      maxAttempts: strategy.maxAttempts || 1,
      delay: strategy.delay || 0,
      notify: strategy.notify || false
    });
  }

  /**
   * 获取恢复策略
   * @param {string} errorType 错误类型
   */
  getRecoveryStrategy(errorType) {
    return this.recoveryStrategies.get(errorType) || {
      strategy: ErrorStrategy.NOTIFY,
      maxAttempts: 1,
      delay: 0,
      notify: true
    };
  }

  /**
   * 执行错误处理策略
   * @param {Object} errorInfo 错误信息
   * @param {Object} strategy 处理策略
   */
  async executeErrorStrategy(errorInfo, strategy) {
    const { strategy: strategyType, maxAttempts, delay } = strategy;
    
    switch (strategyType) {
      case ErrorStrategy.RETRY:
        await this.handleRetryStrategy(errorInfo, maxAttempts, delay);
        break;
        
      case ErrorStrategy.RESTART:
        await this.handleRestartStrategy(errorInfo, maxAttempts, delay);
        break;
        
      case ErrorStrategy.IGNORE:
        this.handleIgnoreStrategy(errorInfo);
        break;
        
      case ErrorStrategy.NOTIFY:
        this.handleNotifyStrategy(errorInfo);
        break;
        
      case ErrorStrategy.TERMINATE:
        await this.handleTerminateStrategy(errorInfo);
        break;
        
      default:
        this.handleNotifyStrategy(errorInfo);
    }
  }

  /**
   * 处理重试策略
   * @param {Object} errorInfo 错误信息
   * @param {number} maxAttempts 最大重试次数
   * @param {number} delay 延迟时间
   */
  async handleRetryStrategy(errorInfo, maxAttempts, delay) {
    const attempts = this.getErrorAttempts(errorInfo.context.pluginName || 'unknown');
    
    if (attempts < maxAttempts) {
      this.log(`准备重试操作 (${attempts + 1}/${maxAttempts})`, 'warn');
      
      if (delay > 0) {
        await this.delay(delay);
      }
      
      // 这里可以触发重试逻辑
      this.triggerRetry(errorInfo);
    } else {
      this.log(`达到最大重试次数 (${maxAttempts})`, 'error');
    }
  }

  /**
   * 处理重启策略
   * @param {Object} errorInfo 错误信息
   * @param {number} maxAttempts 最大重试次数
   * @param {number} delay 延迟时间
   */
  async handleRestartStrategy(errorInfo, maxAttempts, delay) {
    const pluginName = errorInfo.context.pluginName;
    if (!pluginName) {
      this.log('重启策略需要插件名称', 'error');
      return;
    }
    
    const attempts = this.getErrorAttempts(pluginName);
    
    if (attempts < maxAttempts) {
      this.log(`准备重启插件 ${pluginName} (${attempts + 1}/${maxAttempts})`, 'warn');
      
      if (delay > 0) {
        await this.delay(delay);
      }
      
      // 这里可以触发重启逻辑
      this.triggerRestart(pluginName);
    } else {
      this.log(`插件 ${pluginName} 达到最大重启次数 (${maxAttempts})`, 'error');
    }
  }

  /**
   * 处理忽略策略
   * @param {Object} errorInfo 错误信息
   */
  handleIgnoreStrategy(errorInfo) {
    this.log(`忽略错误: ${errorInfo.message}`, 'debug');
  }

  /**
   * 处理通知策略
   * @param {Object} errorInfo 错误信息
   */
  handleNotifyStrategy(errorInfo) {
    this.log(`错误通知: ${errorInfo.message}`, 'warn');
  }

  /**
   * 处理终止策略
   * @param {Object} errorInfo 错误信息
   */
  async handleTerminateStrategy(errorInfo) {
    this.log(`严重错误，准备终止应用: ${errorInfo.message}`, 'error');
    
    // 延迟终止，给日志记录时间
    await this.delay(1000);
    
    // 这里可以触发应用终止逻辑
    this.triggerTermination(errorInfo);
  }

  /**
   * 获取错误尝试次数
   * @param {string} key 错误键
   */
  getErrorAttempts(key) {
    return this.errorCounts.get(key) || 0;
  }

  /**
   * 注册错误通知回调
   * @param {Function} callback 回调函数
   */
  registerNotificationCallback(callback) {
    if (typeof callback === 'function') {
      this.notificationCallbacks.push(callback);
    }
  }

  /**
   * 发送错误通知
   * @param {Object} errorInfo 错误信息
   */
  notifyError(errorInfo) {
    for (const callback of this.notificationCallbacks) {
      try {
        callback(errorInfo);
      } catch (error) {
        this.log(`错误通知回调执行失败: ${error.message}`, 'error');
      }
    }
  }

  /**
   * 触发重试（预留接口）
   * @param {Object} errorInfo 错误信息
   */
  triggerRetry(errorInfo) {
    // 子类可以重写此方法实现具体的重试逻辑
    this.log(`触发重试: ${errorInfo.message}`);
  }

  /**
   * 触发重启（预留接口）
   * @param {string} pluginName 插件名称
   */
  triggerRestart(pluginName) {
    // 子类可以重写此方法实现具体的重启逻辑
    this.log(`触发重启: ${pluginName}`);
  }

  /**
   * 触发终止（预留接口）
   * @param {Object} errorInfo 错误信息
   */
  triggerTermination(errorInfo) {
    // 子类可以重写此方法实现具体的终止逻辑
    this.log(`触发终止: ${errorInfo.message}`);
    process.exit(1);
  }

  /**
   * 生成错误ID
   */
  generateErrorId() {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 延迟函数
   * @param {number} ms 毫秒数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取错误统计信息
   */
  getErrorStats() {
    const stats = {
      totalErrors: this.errors.length,
      errorCounts: Object.fromEntries(this.errorCounts),
      recentErrors: this.errors.slice(-10),
      errorTypes: Array.from(this.errorCounts.keys())
    };
    
    return stats;
  }

  /**
   * 清理错误记录
   */
  clearErrors() {
    this.errors = [];
    this.errorCounts.clear();
    this.log('错误记录已清理');
  }

  /**
   * 获取管理器状态
   */
  getStatus() {
    const baseStatus = super.getStatus();
    const errorStats = this.getErrorStats();
    
    return {
      ...baseStatus,
      errors: errorStats
    };
  }
}

module.exports = ErrorHandler; 