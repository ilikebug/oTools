const BaseManager = require('./base-manager');

/**
 * 性能监控器
 * 监控应用性能指标，识别性能瓶颈
 */
class PerformanceMonitor extends BaseManager {
  constructor() {
    super('PerformanceMonitor');
    this.metrics = new Map();
    this.startTime = Date.now();
    this.thresholds = {
      slowOperation: 5000,    // 5秒
      memoryWarning: 100 * 1024 * 1024,  // 100MB
      cpuWarning: 80          // 80%
    };
    this.alerts = [];
    this.monitoringInterval = null;
  }

  /**
   * 初始化性能监控器
   */
  async onInitialize(options) {
    this.thresholds = { ...this.thresholds, ...options.thresholds };
    
    // 启动定期监控
    this.startPeriodicMonitoring();
    
    this.log('性能监控器初始化完成');
  }

  /**
   * 销毁性能监控器
   */
  async onDestroy() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.log('性能监控器已销毁');
  }

  /**
   * 开始计时
   * @param {string} operation 操作名称
   * @param {string} pluginName 插件名称（可选）
   */
  startTimer(operation, pluginName = null) {
    const key = pluginName ? `${pluginName}:${operation}` : operation;
    this.metrics.set(key, {
      startTime: performance.now(),
      pluginName,
      operation,
      status: 'running'
    });
  }

  /**
   * 结束计时
   * @param {string} operation 操作名称
   * @param {string} pluginName 插件名称（可选）
   * @param {Object} data 附加数据
   */
  endTimer(operation, pluginName = null, data = {}) {
    const key = pluginName ? `${pluginName}:${operation}` : operation;
    const metric = this.metrics.get(key);
    
    if (metric) {
      metric.duration = performance.now() - metric.startTime;
      metric.endTime = Date.now();
      metric.status = 'completed';
      metric.data = data;
      
      // 记录性能数据
      this.logPerformance(metric);
      
      // 检查性能阈值
      this.checkPerformanceThresholds(metric);
      
      // 清理旧的指标数据
      this.cleanupOldMetrics();
    }
  }

  /**
   * 记录性能数据
   * @param {Object} metric 性能指标
   */
  logPerformance(metric) {
    const { operation, duration, pluginName } = metric;
    const pluginInfo = pluginName ? `[${pluginName}]` : '';
    
    this.log(`${pluginInfo} ${operation} 耗时 ${duration.toFixed(2)}ms`, 'debug');
  }

  /**
   * 检查性能阈值
   * @param {Object} metric 性能指标
   */
  checkPerformanceThresholds(metric) {
    const { operation, duration, pluginName } = metric;
    
    // 检查慢操作
    if (duration > this.thresholds.slowOperation) {
      this.alertSlowOperation(metric);
    }
    
    // 检查内存使用
    const memoryUsage = process.memoryUsage();
    if (memoryUsage.heapUsed > this.thresholds.memoryWarning) {
      this.alertHighMemoryUsage(memoryUsage);
    }
  }

  /**
   * 警告慢操作
   * @param {Object} metric 性能指标
   */
  alertSlowOperation(metric) {
    const alert = {
      type: 'slow_operation',
      timestamp: new Date().toISOString(),
      message: `操作执行缓慢: ${metric.operation}`,
      data: {
        operation: metric.operation,
        duration: metric.duration,
        pluginName: metric.pluginName,
        threshold: this.thresholds.slowOperation
      }
    };
    
    this.alerts.push(alert);
    this.log(`性能警告: ${alert.message} (${metric.duration.toFixed(2)}ms)`, 'warn');
    
    // 通知其他组件
    this.notifyPerformanceAlert(alert);
  }

  /**
   * 警告高内存使用
   * @param {Object} memoryUsage 内存使用情况
   */
  alertHighMemoryUsage(memoryUsage) {
    const alert = {
      type: 'high_memory',
      timestamp: new Date().toISOString(),
      message: '内存使用过高',
      data: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        threshold: this.thresholds.memoryWarning
      }
    };
    
    this.alerts.push(alert);
    this.log(`内存警告: ${alert.message} (${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB)`, 'warn');
    
    // 通知其他组件
    this.notifyPerformanceAlert(alert);
  }

  /**
   * 开始定期监控
   */
  startPeriodicMonitoring() {
    this.monitoringInterval = setInterval(() => {
      this.checkSystemResources();
      this.cleanupOldAlerts();
    }, 30000); // 每30秒检查一次
  }

  /**
   * 检查系统资源
   */
  checkSystemResources() {
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    // 记录系统资源使用情况
    this.log(`系统资源 - 内存: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB, 运行时间: ${uptime.toFixed(0)}s`, 'debug');
    
    // 检查内存使用
    if (memoryUsage.heapUsed > this.thresholds.memoryWarning) {
      this.alertHighMemoryUsage(memoryUsage);
    }
  }

  /**
   * 清理旧的指标数据
   */
  cleanupOldMetrics() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5分钟
    
    for (const [key, metric] of this.metrics.entries()) {
      if (metric.endTime && (now - metric.endTime) > maxAge) {
        this.metrics.delete(key);
      }
    }
  }

  /**
   * 清理旧的警告
   */
  cleanupOldAlerts() {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1小时
    
    this.alerts = this.alerts.filter(alert => {
      return (now - new Date(alert.timestamp).getTime()) < maxAge;
    });
  }

  /**
   * 通知性能警告
   * @param {Object} alert 警告信息
   */
  notifyPerformanceAlert(alert) {
    // 这里可以通过事件系统通知其他组件
    // 暂时使用简单的日志记录
    this.log(`性能警告通知: ${alert.type}`, 'warn');
  }

  /**
   * 获取性能统计信息
   */
  getPerformanceStats() {
    const stats = {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      metricsCount: this.metrics.size,
      alertsCount: this.alerts.length,
      recentAlerts: this.alerts.slice(-5) // 最近5个警告
    };
    
    // 计算平均响应时间
    let totalDuration = 0;
    let completedCount = 0;
    
    for (const metric of this.metrics.values()) {
      if (metric.status === 'completed' && metric.duration) {
        totalDuration += metric.duration;
        completedCount++;
      }
    }
    
    if (completedCount > 0) {
      stats.averageResponseTime = totalDuration / completedCount;
    }
    
    return stats;
  }

  /**
   * 获取慢操作列表
   */
  getSlowOperations(limit = 10) {
    const slowOperations = [];
    
    for (const metric of this.metrics.values()) {
      if (metric.status === 'completed' && metric.duration > this.thresholds.slowOperation) {
        slowOperations.push(metric);
      }
    }
    
    // 按持续时间排序
    slowOperations.sort((a, b) => b.duration - a.duration);
    
    return slowOperations.slice(0, limit);
  }

  /**
   * 重置性能数据
   */
  resetMetrics() {
    this.metrics.clear();
    this.alerts = [];
    this.log('性能数据已重置');
  }

  /**
   * 设置性能阈值
   * @param {Object} thresholds 新的阈值
   */
  setThresholds(thresholds) {
    this.thresholds = { ...this.thresholds, ...thresholds };
    this.log('性能阈值已更新');
  }

  /**
   * 获取监控状态
   */
  getStatus() {
    const baseStatus = super.getStatus();
    const stats = this.getPerformanceStats();
    
    return {
      ...baseStatus,
      monitoring: {
        isActive: this.monitoringInterval !== null,
        thresholds: this.thresholds,
        stats: stats
      }
    };
  }
}

module.exports = PerformanceMonitor; 