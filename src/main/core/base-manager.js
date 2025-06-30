/**
 * 基础管理器类
 * 提供所有管理器的基础功能和通用方法
 */
class BaseManager {
  constructor(name) {
    this.name = name;
    this.isInitialized = false;
    this.logger = null;
    this.config = null;
  }

  /**
   * 初始化管理器
   * @param {Object} options 初始化选项
   */
  async initialize(options = {}) {
    if (this.isInitialized) {
      throw new Error(`${this.name} 已经初始化`);
    }

    try {
      this.logger = options.logger;
      this.config = options.config;
      
      await this.onInitialize(options);
      this.isInitialized = true;
      
      this.log(`初始化成功`);
    } catch (error) {
      this.log(`初始化失败: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * 销毁管理器
   */
  async destroy() {
    if (!this.isInitialized) {
      return;
    }

    try {
      await this.onDestroy();
      this.isInitialized = false;
      this.log(`销毁成功`);
    } catch (error) {
      this.log(`销毁失败: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * 子类需要实现的初始化方法
   * @param {Object} options 初始化选项
   */
  async onInitialize(options) {
    // 子类重写此方法
  }

  /**
   * 子类需要实现的销毁方法
   */
  async onDestroy() {
    // 子类重写此方法
  }

  /**
   * 记录日志
   * @param {string} message 日志消息
   * @param {string} level 日志级别
   */
  log(message, level = 'info') {
    if (this.logger) {
      this.logger.log(level, `[${this.name}] ${message}`);
    } else {
      console.log(`[${this.name}] ${message}`);
    }
  }

  /**
   * 检查管理器是否已初始化
   */
  checkInitialized() {
    if (!this.isInitialized) {
      throw new Error(`${this.name} 未初始化`);
    }
  }

  /**
   * 获取管理器状态
   */
  getStatus() {
    return {
      name: this.name,
      isInitialized: this.isInitialized,
      config: this.config ? true : false,
      logger: this.logger ? true : false
    };
  }
}

module.exports = BaseManager; 