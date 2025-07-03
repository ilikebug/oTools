/**
 * Base Manager Class
 * Provides basic functions and common methods for all managers
 */
const logger = require('../utils/logger');

class BaseManager {
  constructor(name) {
    this.name = name;
    this.isInitialized = false;
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
      this.config = options.config;
      
      await this.onInitialize(options);
      this.isInitialized = true;
      
      logger.info(`Initialization succeeded`);
    } catch (error) {
      logger.error(`Initialization failed: ${error.message}`);
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
      logger.info(`Destruction succeeded`);
    } catch (error) {
      logger.error(`Destruction failed: ${error.message}`);
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
   * Get manager status
   */
  getStatus() {
    return {
      name: this.name,
      isInitialized: this.isInitialized,
      config: this.config ? true : false
    };
  }
}

module.exports = BaseManager; 