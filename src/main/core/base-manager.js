/**
 * Base Manager Class
 * Provides basic functions and common methods for all managers
 */
class BaseManager {
  constructor(name) {
    this.name = name;
    this.isInitialized = false;
    this.logger = null;
    this.config = null;
  }

  /**
   * Initialize the manager
   * @param {Object} options Initialization options
   */
  async initialize(options = {}) {
    if (this.isInitialized) {
      throw new Error(`${this.name} has been initialized`);
    }

    try {
      this.logger = options.logger;
      this.config = options.config;
      
      await this.onInitialize(options);
      this.isInitialized = true;
      
      this.log(`Initialization succeeded`);
    } catch (error) {
      this.log(`Initialization failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Destroy the manager
   */
  async destroy() {
    if (!this.isInitialized) {
      return;
    }

    try {
      await this.onDestroy();
      this.isInitialized = false;
      this.log(`Destruction succeeded`);
    } catch (error) {
      this.log(`Destruction failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Initialization method to be implemented by subclasses
   * @param {Object} options Initialization options
   */
  async onInitialize(options) {
    // Subclasses should override this method
  }

  /**
   * Destruction method to be implemented by subclasses
   */
  async onDestroy() {
    // Subclasses should override this method
  }

  /**
   * Log messages
   * @param {string} message Log message
   * @param {string} level Log level
   */
  log(message, level = 'info') {
    if (this.logger) {
      this.logger.log(level, `[${this.name}] ${message}`);
    } else {
      console.log(`[${this.name}] ${message}`);
    }
  }

  /**
   * Check if the manager has been initialized
   */
  checkInitialized() {
    if (!this.isInitialized) {
      throw new Error(`${this.name} has not been initialized`);
    }
  }

  /**
   * Get manager status
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