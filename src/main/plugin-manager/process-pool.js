const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const BaseManager = require('../core/base-manager');
const { MessageBuilder, MessageType } = require('../core/message-protocol');

/**
 * 进程状态枚举
 */
const ProcessStatus = {
  IDLE: 'idle',
  BUSY: 'busy',
  STARTING: 'starting',
  ERROR: 'error',
  TERMINATED: 'terminated'
};

/**
 * 插件进程池管理器
 * 实现插件的懒加载和进程复用
 */
class PluginProcessPool extends BaseManager {
  constructor(options = {}) {
    super('PluginProcessPool');
    
    this.maxProcesses = options.maxProcesses || 5;
    this.processTimeout = options.processTimeout || 30000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    
    this.processes = new Map(); // name -> ProcessInfo
    this.pendingRequests = new Map(); // requestId -> RequestInfo
    this.requestQueue = []; // 等待队列
    this.requestId = 0;
    
    this.macTools = options.macTools;
    this.resultWindowManager = options.resultWindowManager;
  }

  /**
   * 初始化进程池
   */
  async onInitialize(options) {
    this.log(`进程池初始化，最大进程数: ${this.maxProcesses}`);
    
    // 设置进程清理定时器
    this.setupCleanupTimer();
    
    this.log('进程池初始化完成');
  }

  /**
   * 销毁进程池
   */
  async onDestroy() {
    this.log('开始销毁进程池...');
    
    // 停止所有进程
    for (const [name, processInfo] of this.processes) {
      await this.terminateProcess(name);
    }
    
    // 清理等待队列
    this.requestQueue = [];
    this.pendingRequests.clear();
    
    this.log('进程池销毁完成');
  }

  /**
   * 获取插件进程
   * @param {string} pluginName 插件名称
   * @param {boolean} forceNew 是否强制创建新进程
   */
  async getProcess(pluginName, forceNew = false) {
    // 检查是否已有进程
    if (!forceNew && this.processes.has(pluginName)) {
      const processInfo = this.processes.get(pluginName);
      
      if (processInfo.status === ProcessStatus.IDLE) {
        // 空闲进程，直接使用
        processInfo.status = ProcessStatus.BUSY;
        this.log(`复用空闲进程: ${pluginName}`);
        return processInfo;
      } else if (processInfo.status === ProcessStatus.BUSY) {
        // 忙碌进程，加入等待队列
        return this.queueRequest(pluginName);
      }
    }

    // 检查进程数量限制
    if (this.processes.size >= this.maxProcesses) {
      this.log(`达到最大进程数限制 (${this.maxProcesses})，加入等待队列`);
      return this.queueRequest(pluginName);
    }

    // 创建新进程
    return await this.createProcess(pluginName);
  }

  /**
   * 创建新进程
   * @param {string} pluginName 插件名称
   */
  async createProcess(pluginName) {
    try {
      this.log(`创建新进程: ${pluginName}`);
      
      const processInfo = {
        name: pluginName,
        status: ProcessStatus.STARTING,
        process: null,
        createTime: Date.now(),
        lastUsed: Date.now(),
        requestCount: 0,
        errorCount: 0,
        retryCount: 0
      };

      // 创建子进程
      const pluginPath = path.join(__dirname, '..', '..', '..', 'plugins', pluginName);
      const metaPath = path.join(pluginPath, 'plugin.json');
      
      if (!fs.existsSync(metaPath)) {
        throw new Error(`插件配置文件不存在: ${metaPath}`);
      }
      
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const mainPath = path.join(pluginPath, meta.main || 'main.js');
      
      if (!fs.existsSync(mainPath)) {
        throw new Error(`插件主文件不存在: ${mainPath}`);
      }

      const child = fork(mainPath, [], {
        cwd: pluginPath,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc']
      });

      processInfo.process = child;

      // 设置进程事件监听
      this.setupProcessEventListeners(processInfo);

      // 发送初始化消息
      child.send(MessageBuilder.createSystemMessage(MessageType.SYSTEM.INIT, { meta }));

      // 等待进程就绪
      await this.waitForProcessReady(processInfo);

      // 更新状态
      processInfo.status = ProcessStatus.IDLE;
      this.processes.set(pluginName, processInfo);

      this.log(`进程创建成功: ${pluginName}`);
      return processInfo;

    } catch (error) {
      this.log(`创建进程失败 ${pluginName}: ${error.message}`, 'error');
      
      // 重试逻辑
      if (this.shouldRetry(pluginName)) {
        this.log(`准备重试创建进程: ${pluginName}`);
        await this.delay(this.retryDelay);
        return await this.createProcess(pluginName);
      }
      
      throw error;
    }
  }

  /**
   * 设置进程事件监听
   * @param {Object} processInfo 进程信息
   */
  setupProcessEventListeners(processInfo) {
    const { process: child, name } = processInfo;

    child.on('message', async (msg) => {
      await this.handleProcessMessage(processInfo, msg);
    });

    child.on('exit', (code, signal) => {
      this.handleProcessExit(processInfo, code, signal);
    });

    child.on('error', (error) => {
      this.handleProcessError(processInfo, error);
    });
  }

  /**
   * 处理进程消息
   * @param {Object} processInfo 进程信息
   * @param {Object} msg 消息
   */
  async handleProcessMessage(processInfo, msg) {
    const { name } = processInfo;

    try {
      if (msg.type === 'result' && msg.id) {
        // 处理执行结果
        const request = this.pendingRequests.get(msg.id);
        if (request) {
          this.pendingRequests.delete(msg.id);
          if (msg.error) {
            request.reject(new Error(msg.error));
          } else {
            request.resolve(msg.result);
          }
        }
      } else if (msg.type === 'api_call' && msg.id) {
        // 处理API调用
        await this.handleApiCall(processInfo, msg);
      } else if (msg.type === 'show_html_window' && msg.id) {
        // 处理HTML窗口显示请求
        await this.handleHtmlWindowRequest(processInfo, msg);
      } else if (msg.type === 'loaded' || msg.type === 'ready') {
        // 进程状态更新
        this.log(`进程状态更新 ${name}: ${msg.type}`);
      }
    } catch (error) {
      this.log(`处理进程消息失败 ${name}: ${error.message}`, 'error');
    }
  }

  /**
   * 处理进程退出
   * @param {Object} processInfo 进程信息
   * @param {number} code 退出码
   * @param {string} signal 退出信号
   */
  handleProcessExit(processInfo, code, signal) {
    const { name } = processInfo;
    
    this.log(`进程退出 ${name}: code=${code}, signal=${signal}`);
    
    processInfo.status = ProcessStatus.TERMINATED;
    this.processes.delete(name);
    
    // 处理等待中的请求
    this.handleProcessTermination(name);
  }

  /**
   * 处理进程错误
   * @param {Object} processInfo 进程信息
   * @param {Error} error 错误
   */
  handleProcessError(processInfo, error) {
    const { name } = processInfo;
    
    this.log(`进程错误 ${name}: ${error.message}`, 'error');
    
    processInfo.status = ProcessStatus.ERROR;
    processInfo.errorCount++;
    
    // 处理等待中的请求
    this.handleProcessTermination(name);
  }

  /**
   * 处理进程终止
   * @param {string} pluginName 插件名称
   */
  handleProcessTermination(pluginName) {
    // 重新处理等待队列中的请求
    this.requestQueue = this.requestQueue.filter(request => {
      if (request.pluginName === pluginName) {
        // 重新尝试获取进程
        this.getProcess(pluginName).then(processInfo => {
          this.executeRequest(request, processInfo);
        }).catch(error => {
          request.reject(error);
        });
        return false; // 从队列中移除
      }
      return true;
    });
  }

  /**
   * 等待进程就绪
   * @param {Object} processInfo 进程信息
   */
  async waitForProcessReady(processInfo) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`进程启动超时: ${processInfo.name}`));
      }, this.processTimeout);

      const checkReady = (msg) => {
        if (msg.type === 'ready') {
          clearTimeout(timeout);
          resolve();
        }
      };

      processInfo.process.once('message', checkReady);
    });
  }

  /**
   * 执行插件请求
   * @param {Object} request 请求信息
   * @param {Object} processInfo 进程信息
   */
  async executeRequest(request, processInfo) {
    const { id, action, args } = request;
    const { process: child, name } = processInfo;

    try {
      processInfo.status = ProcessStatus.BUSY;
      processInfo.lastUsed = Date.now();
      processInfo.requestCount++;

      // 发送执行消息
      child.send(MessageBuilder.createRequest(MessageType.REQUEST.PLUGIN_EXECUTE, {
        action,
        args
      }, id));

      this.log(`执行插件请求 ${name}: ${action}`);

    } catch (error) {
      processInfo.status = ProcessStatus.IDLE;
      request.reject(error);
    }
  }

  /**
   * 处理API调用
   * @param {Object} processInfo 进程信息
   * @param {Object} msg 消息
   */
  async handleApiCall(processInfo, msg) {
    const { process: child, name } = processInfo;

    try {
      const result = await this.callMainProcessAPI(msg.api, msg.args);
      child.send(MessageBuilder.createResponse(msg.id, true, result));
    } catch (error) {
      child.send(MessageBuilder.createResponse(msg.id, false, null, error.message));
    }
  }

  /**
   * 处理HTML窗口请求
   * @param {Object} processInfo 进程信息
   * @param {Object} msg 消息
   */
  async handleHtmlWindowRequest(processInfo, msg) {
    const { process: child, name } = processInfo;

    try {
      const { htmlPath, data, windowOptions } = msg;
      
      if (this.resultWindowManager && this.resultWindowManager.showHtmlWindow) {
        this.resultWindowManager.showHtmlWindow(htmlPath, data, windowOptions);
        child.send(MessageBuilder.createResponse(msg.id, true, { success: true }));
      } else {
        child.send(MessageBuilder.createResponse(msg.id, false, null, '结果窗口管理器未设置'));
      }
    } catch (error) {
      child.send(MessageBuilder.createResponse(msg.id, false, null, error.message));
    }
  }

  /**
   * 调用主进程API
   * @param {string} apiName API名称
   * @param {Array} args 参数
   */
  async callMainProcessAPI(apiName, args) {
    if (!this.macTools) {
      throw new Error('MacTools未初始化');
    }

    switch (apiName) {
      case 'captureScreenRegion':
        const imageBuffer = await this.macTools.captureScreenRegion();
        return imageBuffer.toString('base64');
      
      case 'performOCR':
        const [imageBase64] = args;
        const imageBuffer2 = Buffer.from(imageBase64, 'base64');
        return await this.macTools.performOCR(imageBuffer2);
      
      case 'captureAndOCR':
        const imageBuffer3 = await this.macTools.captureScreenRegion();
        const ocrResult = await this.macTools.performOCR(imageBuffer3);
        return {
          imageData: imageBuffer3.toString('base64'),
          text: ocrResult
        };
      
      default:
        throw new Error(`未知的API: ${apiName}`);
    }
  }

  /**
   * 将请求加入队列
   * @param {string} pluginName 插件名称
   */
  queueRequest(pluginName) {
    return new Promise((resolve, reject) => {
      const request = {
        id: ++this.requestId,
        pluginName,
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.requestQueue.push(request);
      this.log(`请求已加入队列: ${pluginName} (队列长度: ${this.requestQueue.length})`);
    });
  }

  /**
   * 处理等待队列
   */
  async processQueue() {
    if (this.requestQueue.length === 0) {
      return;
    }

    const request = this.requestQueue.shift();
    
    try {
      const processInfo = await this.getProcess(request.pluginName);
      await this.executeRequest(request, processInfo);
    } catch (error) {
      request.reject(error);
    }
  }

  /**
   * 终止进程
   * @param {string} pluginName 插件名称
   */
  async terminateProcess(pluginName) {
    const processInfo = this.processes.get(pluginName);
    if (!processInfo) {
      return;
    }

    try {
      if (processInfo.process) {
        processInfo.process.kill();
      }
      this.processes.delete(pluginName);
      this.log(`进程已终止: ${pluginName}`);
    } catch (error) {
      this.log(`终止进程失败 ${pluginName}: ${error.message}`, 'error');
    }
  }

  /**
   * 设置清理定时器
   */
  setupCleanupTimer() {
    setInterval(() => {
      this.cleanupIdleProcesses();
      this.processQueue();
    }, 30000); // 每30秒清理一次
  }

  /**
   * 清理空闲进程
   */
  cleanupIdleProcesses() {
    const now = Date.now();
    const maxIdleTime = 5 * 60 * 1000; // 5分钟

    for (const [name, processInfo] of this.processes) {
      if (processInfo.status === ProcessStatus.IDLE && 
          (now - processInfo.lastUsed) > maxIdleTime) {
        this.log(`清理空闲进程: ${name}`);
        this.terminateProcess(name);
      }
    }
  }

  /**
   * 检查是否应该重试
   * @param {string} pluginName 插件名称
   */
  shouldRetry(pluginName) {
    const processInfo = this.processes.get(pluginName);
    if (!processInfo) {
      return true;
    }
    return processInfo.retryCount < this.retryAttempts;
  }

  /**
   * 延迟函数
   * @param {number} ms 毫秒数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取进程池状态
   */
  getPoolStatus() {
    const status = {
      totalProcesses: this.processes.size,
      maxProcesses: this.maxProcesses,
      queueLength: this.requestQueue.length,
      pendingRequests: this.pendingRequests.size,
      processes: {}
    };

    for (const [name, processInfo] of this.processes) {
      status.processes[name] = {
        status: processInfo.status,
        requestCount: processInfo.requestCount,
        errorCount: processInfo.errorCount,
        lastUsed: processInfo.lastUsed,
        uptime: Date.now() - processInfo.createTime
      };
    }

    return status;
  }

  /**
   * 获取管理器状态
   */
  getStatus() {
    const baseStatus = super.getStatus();
    const poolStatus = this.getPoolStatus();
    
    return {
      ...baseStatus,
      pool: poolStatus
    };
  }
}

module.exports = PluginProcessPool; 