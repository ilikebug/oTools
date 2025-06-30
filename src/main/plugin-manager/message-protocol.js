/**
 * 消息协议定义
 * 统一管理所有进程间通信的消息格式和类型
 */

/**
 * 消息类型枚举
 */
const MessageType = {
  // 请求消息
  REQUEST: {
    PLUGIN_EXECUTE: 'plugin:execute',
    API_CALL: 'api:call',
    WINDOW_SHOW: 'window:show',
    CONFIG_GET: 'config:get',
    CONFIG_SET: 'config:set'
  },
  
  // 响应消息
  RESPONSE: {
    SUCCESS: 'response:success',
    ERROR: 'response:error',
    TIMEOUT: 'response:timeout'
  },
  
  // 事件消息
  EVENT: {
    PLUGIN_LOADED: 'event:plugin:loaded',
    PLUGIN_READY: 'event:plugin:ready',
    PLUGINS_CHANGED: 'event:plugins:changed',
    CONFIG_CHANGED: 'event:config:changed',
    PERFORMANCE_ALERT: 'event:performance:alert'
  },
  
  // 系统消息
  SYSTEM: {
    INIT: 'system:init',
    PING: 'system:ping',
    PONG: 'system:pong',
    SHUTDOWN: 'system:shutdown'
  }
};

/**
 * 消息状态枚举
 */
const MessageStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  TIMEOUT: 'timeout'
};

/**
 * 消息构建器
 * 提供统一的消息创建和解析方法
 */
class MessageBuilder {
  /**
   * 生成唯一消息ID
   */
  static generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 创建请求消息
   * @param {string} type 消息类型
   * @param {Object} data 消息数据
   * @param {string} id 消息ID（可选）
   */
  static createRequest(type, data = {}, id = null) {
    return {
      type,
      id: id || this.generateId(),
      timestamp: Date.now(),
      data,
      version: '1.0',
      status: MessageStatus.PENDING
    };
  }

  /**
   * 创建响应消息
   * @param {string} requestId 请求消息ID
   * @param {boolean} success 是否成功
   * @param {Object} data 响应数据
   * @param {string} error 错误信息
   */
  static createResponse(requestId, success, data = null, error = null) {
    return {
      type: success ? MessageType.RESPONSE.SUCCESS : MessageType.RESPONSE.ERROR,
      id: requestId,
      timestamp: Date.now(),
      data,
      error,
      version: '1.0',
      status: success ? MessageStatus.COMPLETED : MessageStatus.FAILED
    };
  }

  /**
   * 创建事件消息
   * @param {string} type 事件类型
   * @param {Object} data 事件数据
   */
  static createEvent(type, data = {}) {
    return {
      type,
      id: this.generateId(),
      timestamp: Date.now(),
      data,
      version: '1.0',
      isEvent: true
    };
  }

  /**
   * 创建系统消息
   * @param {string} type 系统消息类型
   * @param {Object} data 系统数据
   */
  static createSystemMessage(type, data = {}) {
    return {
      type,
      id: this.generateId(),
      timestamp: Date.now(),
      data,
      version: '1.0',
      isSystem: true
    };
  }

  /**
   * 验证消息格式
   * @param {Object} message 消息对象
   */
  static validateMessage(message) {
    if (!message || typeof message !== 'object') {
      return { valid: false, error: '消息必须是对象' };
    }

    if (!message.type || typeof message.type !== 'string') {
      return { valid: false, error: '消息类型必须存在且为字符串' };
    }

    if (!message.id || typeof message.id !== 'string') {
      return { valid: false, error: '消息ID必须存在且为字符串' };
    }

    if (!message.timestamp || typeof message.timestamp !== 'number') {
      return { valid: false, error: '消息时间戳必须存在且为数字' };
    }

    return { valid: true };
  }

  /**
   * 检查消息是否为请求
   * @param {Object} message 消息对象
   */
  static isRequest(message) {
    return message && !message.isEvent && !message.isSystem && 
           Object.values(MessageType.REQUEST).includes(message.type);
  }

  /**
   * 检查消息是否为响应
   * @param {Object} message 消息对象
   */
  static isResponse(message) {
    return message && Object.values(MessageType.RESPONSE).includes(message.type);
  }

  /**
   * 检查消息是否为事件
   * @param {Object} message 消息对象
   */
  static isEvent(message) {
    return message && (message.isEvent || Object.values(MessageType.EVENT).includes(message.type));
  }

  /**
   * 检查消息是否为系统消息
   * @param {Object} message 消息对象
   */
  static isSystem(message) {
    return message && (message.isSystem || Object.values(MessageType.SYSTEM).includes(message.type));
  }
}

/**
 * 消息处理器基类
 * 提供消息处理的基础功能
 */
class MessageHandler {
  constructor() {
    this.handlers = new Map();
    this.middleware = [];
  }

  /**
   * 注册消息处理器
   * @param {string} type 消息类型
   * @param {Function} handler 处理函数
   */
  registerHandler(type, handler) {
    if (typeof handler !== 'function') {
      throw new Error('处理器必须是函数');
    }
    this.handlers.set(type, handler);
  }

  /**
   * 注册中间件
   * @param {Function} middleware 中间件函数
   */
  registerMiddleware(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('中间件必须是函数');
    }
    this.middleware.push(middleware);
  }

  /**
   * 处理消息
   * @param {Object} message 消息对象
   * @param {Object} context 上下文
   */
  async handleMessage(message, context = {}) {
    // 验证消息
    const validation = MessageBuilder.validateMessage(message);
    if (!validation.valid) {
      throw new Error(`消息验证失败: ${validation.error}`);
    }

    // 执行中间件
    for (const middleware of this.middleware) {
      const result = await middleware(message, context);
      if (result === false) {
        return null; // 中间件阻止了消息处理
      }
    }

    // 查找处理器
    const handler = this.handlers.get(message.type);
    if (!handler) {
      throw new Error(`未找到消息处理器: ${message.type}`);
    }

    // 执行处理器
    try {
      return await handler(message, context);
    } catch (error) {
      throw new Error(`消息处理失败: ${error.message}`);
    }
  }

  /**
   * 获取已注册的处理器类型
   */
  getRegisteredTypes() {
    return Array.from(this.handlers.keys());
  }
}

/**
 * 消息路由器
 * 根据消息类型路由到不同的处理器
 */
class MessageRouter {
  constructor() {
    this.routes = new Map();
    this.defaultHandler = null;
  }

  /**
   * 注册路由
   * @param {string} pattern 路由模式
   * @param {Function} handler 处理函数
   */
  route(pattern, handler) {
    this.routes.set(pattern, handler);
  }

  /**
   * 设置默认处理器
   * @param {Function} handler 默认处理函数
   */
  setDefaultHandler(handler) {
    this.defaultHandler = handler;
  }

  /**
   * 路由消息
   * @param {Object} message 消息对象
   * @param {Object} context 上下文
   */
  async routeMessage(message, context = {}) {
    // 查找匹配的路由
    for (const [pattern, handler] of this.routes) {
      if (this.matchPattern(message.type, pattern)) {
        return await handler(message, context);
      }
    }

    // 使用默认处理器
    if (this.defaultHandler) {
      return await this.defaultHandler(message, context);
    }

    throw new Error(`未找到匹配的路由: ${message.type}`);
  }

  /**
   * 匹配路由模式
   * @param {string} messageType 消息类型
   * @param {string} pattern 路由模式
   */
  matchPattern(messageType, pattern) {
    // 简单的通配符匹配
    if (pattern === '*') return true;
    if (pattern === messageType) return true;
    
    // 支持前缀匹配，如 "plugin:*"
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return messageType.startsWith(prefix);
    }
    
    return false;
  }
}

module.exports = {
  MessageType,
  MessageStatus,
  MessageBuilder,
  MessageHandler,
  MessageRouter
}; 