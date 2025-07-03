/**
 * Unified export of core components
 * Provides a unified access interface for all core managers
 */

// Base Manager
const BaseManager = require('./base-manager');

// Logger System
const logger = require('../utils/logger');

// Configuration Management
const ConfigManager = require('./config-manager');

// Application Manager
const { AppManager } = require('./app-manager');

// Unified export
module.exports = {
  // Base Class
  BaseManager,
  
  // Logger System
  logger,
  
  // Configuration Management
  ConfigManager,
  
  // Application Manager
  AppManager
}; 