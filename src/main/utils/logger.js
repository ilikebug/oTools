const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const {GetLoggerPath} =  require('../comm')

/**
 * Log level enumeration
 */
const LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

/**
 * Unified logger manager
 * Provides console, file, remote, and other logging outputs
 */
class Logger {
  constructor() {
    this.logLevel = LogLevel.INFO;
    this.logFile = null;
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.maxFiles = 5;
    this.enableConsole = true;
    this.enableFile = true;
    this.enableRemote = false;
    
    this.logDir = GetLoggerPath();
    this.currentLogFile = null;
    this.fileStream = null;
  }

  /**
   * Initialize logger system
   */
  async initialize(options = {}) {
    try {
      this.logLevel = options.level ? LogLevel[options.level.toUpperCase()] || LogLevel.INFO : LogLevel.INFO;
      this.logFile = options.logFile || null;
      this.maxFileSize = options.maxFileSize || this.maxFileSize;
      this.maxFiles = options.maxFiles || this.maxFiles;
      this.enableConsole = options.enableConsole !== false;
      this.enableFile = options.enableFile || false;
      this.enableRemote = options.enableRemote || false;
      
      if (this.enableFile && this.logFile) {
        this.setupFileLogging();
      }
            
    } catch (error) {
      console.error('Logger system initialization failed:', error);
      throw error;
    }
  }

  /**
   * Destroy logger system
   */
  async destroy() {
    try {
      this.cleanup();
      this.log('Logger system destroyed');
    } catch (error) {
      console.error('Logger system destruction failed:', error);
    }
  }

  /**
   * Set file logging
   */
  setupFileLogging() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      
      // Ensure logFile is set
      if (!this.logFile) {
        console.warn('No log file name specified, disabling file logging');
        this.enableFile = false;
        return;
      }
      
      this.currentLogFile = path.join(this.logDir, this.logFile);
      this.rotateLogFileIfNeeded();
      if (!this.fileStream) {
        this.createNewLogFile();
      }
      this.log(`File logging enabled: ${this.currentLogFile}`, 'info');
    } catch (error) {
      console.error('File logging setup failed:', error);
      this.enableFile = false;
    }
  }

  /**
   * Record log
   * @param {string} message Log message
   * @param {string} level Log level
   * @param {Object} data Additional data
   */
  log(message, level = 'info', data = null) {
    const numericLevel = typeof level === 'string' ? LogLevel[level.toUpperCase()] : level;
    
    if (numericLevel <= this.logLevel) {
      const logEntry = this.createLogEntry(message, numericLevel, data);
      
      if (this.enableConsole) {
        this.consoleOutput(logEntry);
      }
      if (this.enableFile) {
        this.fileOutput(logEntry);
      }
      
      if (this.enableRemote) {
        this.remoteOutput(logEntry);
      }
    }
  }

  /**
   * Create log entry
   * @param {string} message Message
   * @param {number} level Level
   * @param {Object} data Data
   */
  createLogEntry(message, level, data) {
    return {
      timestamp: new Date().toISOString(),
      level: this.getLevelName(level),
      message,
      data,
      process: process.pid,
      memory: process.memoryUsage()
    };
  }

  /**
   * Get level name
   */
  getLevelName(level) {
    const names = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
    return names[level] || 'INFO';
  }

  /**
   * Console output
   * @param {Object} logEntry Log entry
   */
  consoleOutput(logEntry) {
    const { timestamp, level, message, data } = logEntry;
    const timeStr = new Date(timestamp).toLocaleTimeString();
    
    let output = `[${timeStr}] [${level}] ${message}`;
    
    if (data) {
      output += ` | ${JSON.stringify(data)}`;
    }
    
    switch (level) {
      case 'ERROR':
        console.error(output);
        break;
      case 'WARN':
        console.warn(output);
        break;
      case 'DEBUG':
        console.debug(output);
        break;
      default:
        console.log(output);
    }
  }

  /**
   * File output
   * @param {Object} logEntry Log entry
   */
  fileOutput(logEntry) {
    if (!this.enableFile) {
      return;
    }
    
    if (!this.fileStream) {
      this.createNewLogFile();
    }
    
    if (!this.fileStream) {
      // File logging is disabled or failed, just return silently
      return;
    }
    
    try {
      const logLine = JSON.stringify(logEntry) + '\n';
      this.fileStream.write(logLine);
      
      // Check file size and rotate if necessary
      this.rotateLogFileIfNeeded();
    } catch (error) {
      console.error('Failed to write to log file:', error);
      this.enableFile = false;
    }
  }

  /**
   * Remote output (reserved interface)
   * @param {Object} logEntry Log entry
   */
  remoteOutput(logEntry) {
    // Reserved remote log interface
    // Can be sent to log server or cloud service
  }

  /**
   * Check and rotate log file
   */
  rotateLogFileIfNeeded() {
    if (!this.currentLogFile || !fs.existsSync(this.currentLogFile)) {
      this.createNewLogFile();
      return;
    }
    
    const stats = fs.statSync(this.currentLogFile);
    if (stats.size > this.maxFileSize) {
      this.rotateLogFile();
    }
  }

  /**
   * Create new log file
   */
  createNewLogFile() {
    try {
      if (!this.currentLogFile) {
        console.warn('No log file path specified, skipping file logging');
        this.enableFile = false;
        return;
      }
      
      const logDir = path.dirname(this.currentLogFile);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      this.fileStream = fs.createWriteStream(this.currentLogFile, { flags: 'a' });
      
      this.fileStream.on('error', (error) => {
        console.error('Log file stream error:', error);
        this.fileStream = null;
        this.enableFile = false;
      });
      
    } catch (error) {
      console.error('Failed to create log file:', error);
      this.fileStream = null;
      this.enableFile = false;
    }
  }

  /**
   * Rotate log file
   */
  rotateLogFile() {
    if (this.fileStream) {
      this.fileStream.end();
    }
    for (let i = this.maxFiles - 1; i > 0; i--) {
      const oldFile = path.join(this.logDir, `${this.logFile}.${i}`);
      const newFile = path.join(this.logDir, `${this.logFile}.${i + 1}`);
      if (fs.existsSync(oldFile)) {
        fs.renameSync(oldFile, newFile);
      }
    }
    if (fs.existsSync(this.currentLogFile)) {
      fs.renameSync(this.currentLogFile, path.join(this.logDir, `${this.logFile}.1`));
    }
    this.createNewLogFile();
  }

  /**
   * Set log level
   * @param {string|number} level Log level
   */
  setLogLevel(level) {
    if (typeof level === 'string') {
      this.logLevel = LogLevel[level.toUpperCase()] || LogLevel.INFO;
    } else {
      this.logLevel = level;
    }
  }

  /**
   * Enable file logging
   * @param {string} filePath Log file path
   */
  enableFileLogging(filePath) {
    this.logFile = filePath;
    this.enableFile = true;
    this.setupFileLogging();
  }

  /**
   * Get log statistics
   */
  getStats() {
    return {
      logLevel: this.getLevelName(this.logLevel),
      enableConsole: this.enableConsole,
      enableFile: this.enableFile,
      enableRemote: this.enableRemote,
      currentLogFile: this.currentLogFile,
      maxFileSize: this.maxFileSize,
      maxFiles: this.maxFiles
    };
  }

  /**
   * Get logger system status
   */
  getStatus() {
    return {
      ...this.getStats(),
      isInitialized: true,
      componentName: this.componentName
    };
  }

  /**
   * Clean up log files
   */
  cleanup() {
    if (this.fileStream) {
      this.fileStream.end();
      this.fileStream = null;
    }
  }
}


const logger = new Logger();

['info', 'error', 'warn', 'debug'].forEach(level => {
  logger[level] = function(message, data = null) {
    this.log(message, level, data);
  };
});

module.exports = logger; 