const BaseManager = require('./base-manager');

/**
 * Performance Monitor
 * Monitor application performance metrics, identify performance bottlenecks
 */
class PerformanceMonitor extends BaseManager {
  constructor() {
    super('PerformanceMonitor');
    this.metrics = new Map();
    this.startTime = Date.now();
    this.thresholds = {
      slowOperation: 5000,    // 5 seconds
      memoryWarning: 100 * 1024 * 1024,  // 100MB
      cpuWarning: 80          // 80%
    };
    this.alerts = [];
    this.monitoringInterval = null;
  }

  /**
   * Initialize Performance Monitor
   */
  async onInitialize(options) {
    this.thresholds = { ...this.thresholds, ...options.thresholds };
    
    // Start periodic monitoring
    this.startPeriodicMonitoring();
    
    this.log('Performance Monitor initialization completed');
  }

  /**
   * Destroy Performance Monitor
   */
  async onDestroy() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.log('Performance Monitor destroyed');
  }

  /**
   * Start Timer
   * @param {string} operation Operation name
   * @param {string} pluginName Plugin name (optional)
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
   * End Timer
   * @param {string} operation Operation name
   * @param {string} pluginName Plugin name (optional)
   * @param {Object} data Additional data
   */
  endTimer(operation, pluginName = null, data = {}) {
    const key = pluginName ? `${pluginName}:${operation}` : operation;
    const metric = this.metrics.get(key);
    
    if (metric) {
      metric.duration = performance.now() - metric.startTime;
      metric.endTime = Date.now();
      metric.status = 'completed';
      metric.data = data;
      
      // Record performance data
      this.logPerformance(metric);
      
      // Check performance thresholds
      this.checkPerformanceThresholds(metric);
      
      // Clean up old metric data
      this.cleanupOldMetrics();
    }
  }

  /**
   * Record performance data
   * @param {Object} metric Performance metric
   */
  logPerformance(metric) {
    const { operation, duration, pluginName } = metric;
    const pluginInfo = pluginName ? `[${pluginName}]` : '';
    
    this.log(`${pluginInfo} ${operation} took ${duration.toFixed(2)}ms`, 'debug');
  }

  /**
   * Check performance thresholds
   * @param {Object} metric Performance metric
   */
  checkPerformanceThresholds(metric) {
    const { operation, duration, pluginName } = metric;
    
    // Check slow operation
    if (duration > this.thresholds.slowOperation) {
      this.alertSlowOperation(metric);
    }
    
    // Check memory usage
    const memoryUsage = process.memoryUsage();
    if (memoryUsage.heapUsed > this.thresholds.memoryWarning) {
      this.alertHighMemoryUsage(memoryUsage);
    }
  }

  /**
   * Alert slow operation
   * @param {Object} metric Performance metric
   */
  alertSlowOperation(metric) {
    const alert = {
      type: 'slow_operation',
      timestamp: new Date().toISOString(),
      message: `Slow operation: ${metric.operation}`,
      data: {
        operation: metric.operation,
        duration: metric.duration,
        pluginName: metric.pluginName,
        threshold: this.thresholds.slowOperation
      }
    };
    
    this.alerts.push(alert);
    this.log(`Performance warning: ${alert.message} (${metric.duration.toFixed(2)}ms)`, 'warn');
    
    // Notify other components
    this.notifyPerformanceAlert(alert);
  }

  /**
   * Alert high memory usage
   * @param {Object} memoryUsage Memory usage
   */
  alertHighMemoryUsage(memoryUsage) {
    const alert = {
      type: 'high_memory',
      timestamp: new Date().toISOString(),
      message: 'High memory usage',
      data: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        threshold: this.thresholds.memoryWarning
      }
    };
    
    this.alerts.push(alert);
    this.log(`Memory warning: ${alert.message} (${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB)`, 'warn');
    
    // Notify other components
    this.notifyPerformanceAlert(alert);
  }

  /**
   * Start periodic monitoring
   */
  startPeriodicMonitoring() {
    this.monitoringInterval = setInterval(() => {
      this.checkSystemResources();
      this.cleanupOldAlerts();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Check system resources
   */
  checkSystemResources() {
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    // Record system resource usage
    this.log(`System resources - Memory: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB, Uptime: ${uptime.toFixed(0)}s`, 'debug');
    
    // Check memory usage
    if (memoryUsage.heapUsed > this.thresholds.memoryWarning) {
      this.alertHighMemoryUsage(memoryUsage);
    }
  }

  /**
   * Clean up old metric data
   */
  cleanupOldMetrics() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    
    for (const [key, metric] of this.metrics.entries()) {
      if (metric.endTime && (now - metric.endTime) > maxAge) {
        this.metrics.delete(key);
      }
    }
  }

  /**
   * Clean up old alerts
   */
  cleanupOldAlerts() {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour
    
    this.alerts = this.alerts.filter(alert => {
      return (now - new Date(alert.timestamp).getTime()) < maxAge;
    });
  }

  /**
   * Notify performance alert
   * @param {Object} alert Alert information
   */
  notifyPerformanceAlert(alert) {
    // Here you can notify other components via event system
    // For now, using simple log recording
    this.log(`Performance warning notification: ${alert.type}`, 'warn');
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats() {
    const stats = {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      metricsCount: this.metrics.size,
      alertsCount: this.alerts.length,
      recentAlerts: this.alerts.slice(-5) // Recent 5 alerts
    };
    
    // Calculate average response time
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
   * Get slow operation list
   */
  getSlowOperations(limit = 10) {
    const slowOperations = [];
    
    for (const metric of this.metrics.values()) {
      if (metric.status === 'completed' && metric.duration > this.thresholds.slowOperation) {
        slowOperations.push(metric);
      }
    }
    
    // Sort by duration
    slowOperations.sort((a, b) => b.duration - a.duration);
    
    return slowOperations.slice(0, limit);
  }

  /**
   * Reset performance data
   */
  resetMetrics() {
    this.metrics.clear();
    this.alerts = [];
    this.log('Performance data reset');
  }

  /**
   * Set performance thresholds
   * @param {Object} thresholds New thresholds
   */
  setThresholds(thresholds) {
    this.thresholds = { ...this.thresholds, ...thresholds };
    this.log('Performance thresholds updated');
  }

  /**
   * Get monitoring status
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