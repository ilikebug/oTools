const BaseManager = require('./base-manager');

/**
 * Error type enumeration
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
 * Error severity enumeration
 */
const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Error handling strategy enumeration
 */
const ErrorStrategy = {
  RETRY: 'retry',
  RESTART: 'restart',
  IGNORE: 'ignore',
  NOTIFY: 'notify',
  TERMINATE: 'terminate'
};

/**
 * Unified error handler
 * Provides error classification, handling strategy, recovery mechanism, etc.
 */
class ErrorHandler extends BaseManager {
  constructor() {
    super('ErrorHandler');
    
    this.recoveryStrategies = new Map();
    this.notificationCallbacks = [];
    
    this.maxErrors = 100;
    this.retryAttempts = 3;
    this.retryDelay = 1000;
    
    this.setupDefaultStrategies();
  }

  /**
   * Initialize error handler
   */
  async onInitialize(options) {
    this.maxErrors = options.maxErrors || this.maxErrors;
    this.retryAttempts = options.retryAttempts || this.retryAttempts;
    this.retryDelay = options.retryDelay || this.retryDelay;
    
    this.log('Error handler initialization completed');
  }

  /**
   * Destroy error handler
   */
  async onDestroy() {
    this.recoveryStrategies.clear();
    this.notificationCallbacks = [];
    
    this.log('Error handler destroyed');
  }

  /**
   * Set default error handling strategy
   */
  setupDefaultStrategies() {
    // Plugin crash strategy
    this.setRecoveryStrategy(ErrorType.PLUGIN_CRASH, {
      strategy: ErrorStrategy.RESTART,
      maxAttempts: 3,
      delay: 2000,
      notify: true
    });

    // Process timeout strategy
    this.setRecoveryStrategy(ErrorType.PROCESS_TIMEOUT, {
      strategy: ErrorStrategy.RETRY,
      maxAttempts: 2,
      delay: 1000,
      notify: false
    });

    // API error strategy
    this.setRecoveryStrategy(ErrorType.API_ERROR, {
      strategy: ErrorStrategy.RETRY,
      maxAttempts: 3,
      delay: 500,
      notify: false
    });

    // Config error strategy
    this.setRecoveryStrategy(ErrorType.CONFIG_ERROR, {
      strategy: ErrorStrategy.NOTIFY,
      maxAttempts: 1,
      delay: 0,
      notify: true
    });

    // System error strategy
    this.setRecoveryStrategy(ErrorType.SYSTEM_ERROR, {
      strategy: ErrorStrategy.TERMINATE,
      maxAttempts: 1,
      delay: 0,
      notify: true
    });
  }

  /**
   * Handle error
   * @param {Error} error Error object
   * @param {Object} context Error context
   */
  async handleError(error, context = {}) {
    const errorInfo = this.createErrorInfo(error, context);
    
    // Determine error type and severity
    const errorType = this.classifyError(error, context);
    const severity = this.assessSeverity(error, context);
    
    errorInfo.type = errorType;
    errorInfo.severity = severity;
    
    // Get handling strategy
    const strategy = this.getRecoveryStrategy(errorType);
    
    // Execute error handling
    await this.executeErrorStrategy(errorInfo, strategy);
    
    // Send notification
    if (strategy.notify) {
      this.notifyError(errorInfo);
    }
    
    this.log(`Error handled: ${errorType} (${severity}) - ${error.message}`, 'error');
    
    return errorInfo;
  }

  /**
   * Create error information object
   * @param {Error} error Error object
   * @param {Object} context Error context
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
   * Classify error
   * @param {Error} error Error object
   * @param {Object} context Error context
   */
  classifyError(error, context) {
    const message = error.message.toLowerCase();
    const stack = error.stack.toLowerCase();
    
    // Plugin related errors
    if (message.includes('plugin') || message.includes('process') || context.pluginName) {
      if (message.includes('timeout') || message.includes('timeout')) {
        return ErrorType.PROCESS_TIMEOUT;
      }
      if (message.includes('crash') || message.includes('crash') || message.includes('exit')) {
        return ErrorType.PLUGIN_CRASH;
      }
      return ErrorType.PLUGIN_CRASH;
    }
    
    // API related errors
    if (message.includes('api') || message.includes('call failed')) {
      return ErrorType.API_ERROR;
    }
    
    // Config related errors
    if (message.includes('config') || message.includes('config')) {
      return ErrorType.CONFIG_ERROR;
    }
    
    // Network related errors
    if (message.includes('network') || message.includes('network') || message.includes('connection')) {
      return ErrorType.NETWORK_ERROR;
    }
    
    // System related errors
    if (message.includes('system') || message.includes('system') || message.includes('memory')) {
      return ErrorType.SYSTEM_ERROR;
    }
    
    return ErrorType.SYSTEM_ERROR;
  }

  /**
   * Assess error severity
   * @param {Error} error Error object
   * @param {Object} context Error context
   */
  assessSeverity(error, context) {
    const message = error.message.toLowerCase();
    
    // Critical error
    if (message.includes('fatal') || message.includes('fatal') || 
        message.includes('critical') || message.includes('severe')) {
      return ErrorSeverity.CRITICAL;
    }
    
    // High severity
    if (message.includes('crash') || message.includes('crash') || 
        message.includes('terminate') || message.includes('terminate')) {
      return ErrorSeverity.HIGH;
    }
    
    // Medium severity
    if (message.includes('timeout') || message.includes('timeout') || 
        message.includes('failed') || message.includes('failed')) {
      return ErrorSeverity.MEDIUM;
    }
    
    // Low severity
    return ErrorSeverity.LOW;
  }

  /**
   * Set recovery strategy
   * @param {string} errorType Error type
   * @param {Object} strategy Strategy configuration
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
   * Get recovery strategy
   * @param {string} errorType Error type
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
   * Execute error handling strategy
   * @param {Object} errorInfo Error information
   * @param {Object} strategy Handling strategy
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
   * Handle retry strategy
   * @param {Object} errorInfo Error information
   * @param {number} maxAttempts Maximum retry attempts
   * @param {number} delay Delay time
   */
  async handleRetryStrategy(errorInfo, maxAttempts, delay) {
    const attempts = this.getErrorAttempts(errorInfo.context.pluginName || 'unknown');
    
    if (attempts < maxAttempts) {
      this.log(`Preparing retry operation (${attempts + 1}/${maxAttempts})`, 'warn');
      
      if (delay > 0) {
        await this.delay(delay);
      }
      
      // Here you can trigger retry logic
      this.triggerRetry(errorInfo);
    } else {
      this.log(`Maximum retry attempts reached (${maxAttempts})`, 'error');
    }
  }

  /**
   * Handle restart strategy
   * @param {Object} errorInfo Error information
   * @param {number} maxAttempts Maximum retry attempts
   * @param {number} delay Delay time
   */
  async handleRestartStrategy(errorInfo, maxAttempts, delay) {
    const pluginName = errorInfo.context.pluginName;
    if (!pluginName) {
      this.log('Restart strategy requires plugin name', 'error');
      return;
    }
    
    const attempts = this.getErrorAttempts(pluginName);
    
    if (attempts < maxAttempts) {
      this.log(`Preparing to restart plugin ${pluginName} (${attempts + 1}/${maxAttempts})`, 'warn');
      
      if (delay > 0) {
        await this.delay(delay);
      }
      
      // Here you can trigger restart logic
      this.triggerRestart(pluginName);
    } else {
      this.log(`Plugin ${pluginName} reached maximum restart attempts (${maxAttempts})`, 'error');
    }
  }

  /**
   * Handle ignore strategy
   * @param {Object} errorInfo Error information
   */
  handleIgnoreStrategy(errorInfo) {
    this.log(`Ignoring error: ${errorInfo.message}`, 'debug');
  }

  /**
   * Handle notification strategy
   * @param {Object} errorInfo Error information
   */
  handleNotifyStrategy(errorInfo) {
    this.log(`Error notification: ${errorInfo.message}`, 'warn');
  }

  /**
   * Handle terminate strategy
   * @param {Object} errorInfo Error information
   */
  async handleTerminateStrategy(errorInfo) {
    this.log(`Severe error, preparing to terminate application: ${errorInfo.message}`, 'error');
    
    // Delay termination, give log recording time
    await this.delay(1000);
    
    // Here you can trigger application termination logic
    this.triggerTermination(errorInfo);
  }

  /**
   * Get error attempt count
   * @param {string} key Error key
   */
  getErrorAttempts(key) {
    return this.errorCounts.get(key) || 0;
  }

  /**
   * Register error notification callback
   * @param {Function} callback Callback function
   */
  registerNotificationCallback(callback) {
    if (typeof callback === 'function') {
      this.notificationCallbacks.push(callback);
    }
  }

  /**
   * Send error notification
   * @param {Object} errorInfo Error information
   */
  notifyError(errorInfo) {
    for (const callback of this.notificationCallbacks) {
      try {
        callback(errorInfo);
      } catch (error) {
        this.log(`Error notification callback execution failed: ${error.message}`, 'error');
      }
    }
  }

  /**
   * Trigger retry (reserved interface)
   * @param {Object} errorInfo Error information
   */
  triggerRetry(errorInfo) {
    // Subclass can override this method to implement specific retry logic
    this.log(`Triggering retry: ${errorInfo.message}`);
  }

  /**
   * Trigger restart (reserved interface)
   * @param {string} pluginName Plugin name
   */
  triggerRestart(pluginName) {
    // Subclass can override this method to implement specific restart logic
    this.log(`Triggering restart: ${pluginName}`);
  }

  /**
   * Trigger termination (reserved interface)
   * @param {Object} errorInfo Error information
   */
  triggerTermination(errorInfo) {
    // Subclass can override this method to implement specific termination logic
    this.log(`Triggering termination: ${errorInfo.message}`);
    process.exit(1);
  }

  /**
   * Generate error ID
   */
  generateErrorId() {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Delay function
   * @param {number} ms Milliseconds
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get manager status
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