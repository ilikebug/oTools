/**
 * 核心组件统一导出
 * 提供所有核心管理器的统一访问接口
 */

// 基础管理器
const BaseManager = require('./base-manager');

// 日志系统
const Logger = require('./logger');

// 配置管理
const ConfigManager = require('./config-manager');

// 性能监控
const PerformanceMonitor = require('./performance-monitor');

// 错误处理
const ErrorHandler = require('./error-handler');

// 消息协议
const MessageProtocol = require('./message-protocol');

// 应用管理器
const { AppManager } = require('./app-manager');

// 统一导出
module.exports = {
  // 基础类
  BaseManager,
  
  // 日志系统
  Logger,
  
  // 配置管理
  ConfigManager,
  
  // 性能监控
  PerformanceMonitor,
  
  // 错误处理
  ErrorHandler,
  
  // 消息协议
  MessageProtocol,
  
  // 应用管理器
  AppManager
}; 