/**
 * Unified export of core components
 * Provides a unified access interface for all core managers
 */

// Base Manager
const BaseManager = require('./base-manager');

// Logger System
const Logger = require('./logger');

// Configuration Management
const ConfigManager = require('./config-manager');

// Error Handler
const ErrorHandler = require('./error-handler');

// Application Manager
const { AppManager } = require('./app-manager');

// Unified export
module.exports = {
  // Base Class
  BaseManager,
  
  // Logger System
  Logger,
  
  // Configuration Management
  ConfigManager,
  
  // Error Handler
  ErrorHandler,
  
  // Application Manager
  AppManager
}; 