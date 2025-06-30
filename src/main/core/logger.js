const fs = require('fs');
const path = require('path');
const BaseManager = require('./base-manager');

/**
 * 日志级别枚举
 */
const LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

/**
 * 日志级别名称映射
 */
const LogLevelNames = {
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.DEBUG]: 'DEBUG'
};

/**
 * 统一日志管理器
 * 提供控制台、文件、远程等多种日志输出方式
 */
class Logger extends BaseManager {
  constructor() {
    super('Logger');
    
    this.logLevel = LogLevel.INFO;
    this.logFile = null;
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.maxFiles = 5;
    this.enableConsole = true;
    this.enableFile = false;
    this.enableRemote = false;
    
    this.logDir = null;
    this.currentLogFile = null;
    this.fileStream = null;
  }

  /**
   * 初始化日志系统
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
      
      this.log('日志系统初始化完成');
      
    } catch (error) {
      console.error('日志系统初始化失败:', error);
      throw error;
    }
  }

  /**
   * 销毁日志系统
   */
  async destroy() {
    try {
      this.cleanup();
      this.log('日志系统已销毁');
    } catch (error) {
      console.error('日志系统销毁失败:', error);
    }
  }

  /**
   * 设置文件日志
   */
  setupFileLogging() {
    try {
      this.logDir = path.dirname(this.logFile);
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      
      this.currentLogFile = this.logFile;
      this.rotateLogFileIfNeeded();
      
      this.log(`文件日志已启用: ${this.currentLogFile}`, 'info');
    } catch (error) {
      console.error('设置文件日志失败:', error);
      this.enableFile = false;
    }
  }

  /**
   * 记录日志
   * @param {string} message 日志消息
   * @param {string} level 日志级别
   * @param {Object} data 附加数据
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
   * 创建日志条目
   * @param {string} message 消息
   * @param {number} level 级别
   * @param {Object} data 数据
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
   * 获取级别名称
   */
  getLevelName(level) {
    const names = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
    return names[level] || 'INFO';
  }

  /**
   * 控制台输出
   * @param {Object} logEntry 日志条目
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
   * 文件输出
   * @param {Object} logEntry 日志条目
   */
  fileOutput(logEntry) {
    if (!this.fileStream) {
      return;
    }
    
    try {
      const logLine = JSON.stringify(logEntry) + '\n';
      this.fileStream.write(logLine);
      
      // 检查文件大小，必要时轮转
      this.rotateLogFileIfNeeded();
    } catch (error) {
      console.error('写入日志文件失败:', error);
    }
  }

  /**
   * 远程输出（预留接口）
   * @param {Object} logEntry 日志条目
   */
  remoteOutput(logEntry) {
    // 预留远程日志接口
    // 可以发送到日志服务器或云服务
  }

  /**
   * 检查并轮转日志文件
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
   * 创建新的日志文件
   */
  createNewLogFile() {
    try {
      this.fileStream = fs.createWriteStream(this.currentLogFile, { flags: 'a' });
    } catch (error) {
      console.error('创建日志文件失败:', error);
    }
  }

  /**
   * 轮转日志文件
   */
  rotateLogFile() {
    if (this.fileStream) {
      this.fileStream.end();
    }
    
    // 重命名现有文件
    for (let i = this.maxFiles - 1; i > 0; i--) {
      const oldFile = `${this.logFile}.${i}`;
      const newFile = `${this.logFile}.${i + 1}`;
      
      if (fs.existsSync(oldFile)) {
        fs.renameSync(oldFile, newFile);
      }
    }
    
    // 重命名当前文件
    if (fs.existsSync(this.currentLogFile)) {
      fs.renameSync(this.currentLogFile, `${this.logFile}.1`);
    }
    
    // 创建新的日志文件
    this.createNewLogFile();
  }

  /**
   * 设置日志级别
   * @param {string|number} level 日志级别
   */
  setLogLevel(level) {
    if (typeof level === 'string') {
      this.logLevel = LogLevel[level.toUpperCase()] || LogLevel.INFO;
    } else {
      this.logLevel = level;
    }
  }

  /**
   * 启用文件日志
   * @param {string} filePath 日志文件路径
   */
  enableFileLogging(filePath) {
    this.logFile = filePath;
    this.enableFile = true;
    this.setupFileLogging();
  }

  /**
   * 获取日志统计信息
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
   * 获取日志系统状态
   */
  getStatus() {
    return {
      ...this.getStats(),
      isInitialized: true,
      componentName: this.componentName
    };
  }

  /**
   * 清理日志文件
   */
  cleanup() {
    if (this.fileStream) {
      this.fileStream.end();
      this.fileStream = null;
    }
  }
}

module.exports = Logger; 