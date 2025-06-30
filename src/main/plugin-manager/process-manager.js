const path = require('path');
const { fork } = require('child_process');
const fs = require('fs');
const BaseManager = require('../core/base-manager');

class PluginProcessManager extends BaseManager {
  constructor(appManager) {
    super('PluginProcessManager');
    
    this.appManager = appManager;
    this.logger = appManager.getComponent('logger');
    this.configManager = appManager.getComponent('configManager');
    this.errorHandler = appManager.getComponent('errorHandler');
    this.performanceMonitor = appManager.getComponent('performanceMonitor');
    
    this.pluginsDir = path.join(__dirname, '..', '..', '..', 'plugins');
    this.processes = new Map(); // name -> child_process
    this.pendingRequests = new Map(); // requestId -> { resolve, reject }
    this.requestId = 0;
    this.macTools = null; // 主进程的MacTools实例
    this.resultWindowManager = null; // 结果窗口管理器
    
    this.logger.log('插件进程管理器初始化');
  }

  /**
   * 初始化插件进程管理器
   */
  async initialize(options = {}) {
    try {
      this.performanceMonitor.startTimer('plugin_process_manager_init');
      
      this.macTools = options.macTools;
      this.resultWindowManager = options.resultWindowManager;
      
      // 确保插件目录存在
      if (!fs.existsSync(this.pluginsDir)) {
        fs.mkdirSync(this.pluginsDir, { recursive: true });
        this.logger.log('插件目录不存在，已创建');
      }
      
      this.performanceMonitor.endTimer('plugin_process_manager_init');
      this.logger.log('插件进程管理器初始化完成');
      
    } catch (error) {
      await this.errorHandler.handleError(error, { 
        operation: 'plugin_process_manager_init' 
      });
      throw error;
    }
  }

  /**
   * 销毁插件进程管理器
   */
  async destroy() {
    try {
      await this.stopAll();
      this.processes.clear();
      this.pendingRequests.clear();
      this.logger.log('插件进程管理器已销毁');
      
    } catch (error) {
      await this.errorHandler.handleError(error, { 
        operation: 'plugin_process_manager_destroy' 
      });
    }
  }

  /**
   * 设置结果窗口管理器
   */
  setResultWindowManager(resultWindowManager) {
    this.resultWindowManager = resultWindowManager;
    this.logger.log('结果窗口管理器已设置');
  }

  /**
   * 启动所有插件
   */
  async startAll() {
    try {
      this.performanceMonitor.startTimer('start_all_plugins');
      
      if (!fs.existsSync(this.pluginsDir)) {
        this.logger.log('插件目录不存在，跳过启动');
        return;
      }
      
      const pluginDirs = fs.readdirSync(this.pluginsDir).filter(f => 
        fs.statSync(path.join(this.pluginsDir, f)).isDirectory()
      );
      
      const startedPlugins = [];
      
      for (const dir of pluginDirs) {
        try {
          await this.startPlugin(dir);
          startedPlugins.push(dir);
        } catch (error) {
          await this.errorHandler.handleError(error, { 
            operation: 'start_plugin', 
            pluginDir: dir 
          });
        }
      }
      
      this.performanceMonitor.endTimer('start_all_plugins', null, { 
        pluginCount: startedPlugins.length 
      });
      
      this.logger.log(`插件启动完成，共启动 ${startedPlugins.length} 个插件: ${startedPlugins.join(', ')}`);
      
    } catch (error) {
      await this.errorHandler.handleError(error, { operation: 'start_all_plugins' });
    }
  }

  /**
   * 启动单个插件
   */
  async startPlugin(dirName) {
    try {
      this.performanceMonitor.startTimer('start_plugin', dirName);
      
      const pluginPath = path.join(this.pluginsDir, dirName);
      const metaPath = path.join(pluginPath, 'plugin.json');
      
      if (!fs.existsSync(metaPath)) {
        throw new Error(`插件配置文件不存在: ${metaPath}`);
      }
      
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const mainPath = path.join(pluginPath, meta.main || 'main.js');
      
      if (!fs.existsSync(mainPath)) {
        throw new Error(`插件主文件不存在: ${mainPath}`);
      }
      
      // 如果插件已运行，先停止
      if (this.processes.has(meta.name)) {
        await this.stopPlugin(meta.name);
      }

      const child = fork(mainPath, [], {
        cwd: pluginPath,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc']
      });

      // 设置消息处理
      child.on('message', async (msg) => {
        await this.handlePluginMessage(child, meta, msg);
      });
      
      // 设置进程退出处理
      child.on('exit', (code, signal) => {
        this.logger.log(`插件 ${meta.name} 进程退出 code=${code} signal=${signal}`);
        this.processes.delete(meta.name);
      });
      
      // 设置错误处理
      child.on('error', (error) => {
        this.errorHandler.handleError(error, { 
          operation: 'plugin_process_error', 
          pluginName: meta.name 
        });
      });
      
      this.processes.set(meta.name, child);
      
      // 发送初始化消息
      child.send({ type: 'init', meta });
      
      this.performanceMonitor.endTimer('start_plugin', dirName, { success: true });
      this.logger.log(`插件 ${meta.name} 已启动`);
      
    } catch (error) {
      this.performanceMonitor.endTimer('start_plugin', dirName, { 
        success: false, 
        error: error.message 
      });
      
      await this.errorHandler.handleError(error, { 
        operation: 'start_plugin', 
        pluginDir: dirName 
      });
      throw error;
    }
  }

  /**
   * 处理插件消息
   */
  async handlePluginMessage(child, meta, msg) {
    try {
      if (msg.type === 'result' && msg.id) {
        // 处理插件执行结果
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
        // 处理插件API调用
        try {
          const result = await this.handleApiCall(msg.api, msg.args);
          child.send({
            type: 'api_result',
            id: msg.id,
            result: result
          });
        } catch (error) {
          child.send({
            type: 'api_result',
            id: msg.id,
            error: error.message
          });
        }
      } else if (msg.type === 'show_html_window' && msg.id) {
        // 处理插件请求通用展示HTML窗口
        try {
          const { htmlPath, data, windowOptions } = msg;
          if (this.resultWindowManager && this.resultWindowManager.showHtmlWindow) {
            this.resultWindowManager.showHtmlWindow(htmlPath, data, windowOptions);
            child.send({
              type: 'api_result',
              id: msg.id,
              result: { success: true, message: 'HTML窗口已展示' }
            });
          } else {
            child.send({
              type: 'api_result',
              id: msg.id,
              error: '结果窗口管理器未设置'
            });
          }
        } catch (error) {
          child.send({
            type: 'api_result',
            id: msg.id,
            error: error.message
          });
        }
      } else if (msg.type === 'loaded') {
        this.logger.log(`插件 ${meta.name} 已加载`);
      } else if (msg.type === 'ready') {
        this.logger.log(`插件 ${meta.name} 已就绪`);
      } else if (msg.type === 'log') {
        // 处理插件日志
        const level = msg.level || 'info';
        this.logger.log(`[插件:${meta.name}] ${msg.message}`, level);
      } else if (msg.type === 'error') {
        // 处理插件错误
        await this.errorHandler.handleError(new Error(msg.error), { 
          operation: 'plugin_error', 
          pluginName: meta.name,
          context: msg.context 
        });
      }
      
    } catch (error) {
      await this.errorHandler.handleError(error, { 
        operation: 'handle_plugin_message', 
        pluginName: meta.name,
        messageType: msg.type 
      });
    }
  }

  /**
   * 停止单个插件
   */
  async stopPlugin(name) {
    try {
      const child = this.processes.get(name);
      if (child) {
        child.kill();
        this.processes.delete(name);
        this.logger.log(`插件 ${name} 已停止`);
      }
    } catch (error) {
      await this.errorHandler.handleError(error, { 
        operation: 'stop_plugin', 
        pluginName: name 
      });
    }
  }

  /**
   * 停止所有插件
   */
  async stopAll() {
    try {
      const pluginNames = Array.from(this.processes.keys());
      
      for (const name of pluginNames) {
        await this.stopPlugin(name);
      }
      
      this.logger.log(`所有插件已停止，共停止 ${pluginNames.length} 个插件`);
      
    } catch (error) {
      await this.errorHandler.handleError(error, { operation: 'stop_all_plugins' });
    }
  }

  /**
   * 给插件进程发消息
   */
  sendToPlugin(name, msg) {
    try {
      const child = this.processes.get(name);
      if (child) {
        child.send(msg);
      } else {
        this.logger.log(`插件 ${name} 进程不存在`, 'warn');
      }
    } catch (error) {
      this.errorHandler.handleError(error, { 
        operation: 'send_to_plugin', 
        pluginName: name 
      });
    }
  }

  /**
   * 执行插件
   */
  async executePlugin(pluginName, action, ...args) {
    try {
      this.performanceMonitor.startTimer('execute_plugin', pluginName);
      
      const child = this.processes.get(pluginName);
      if (!child) {
        throw new Error(`插件进程不存在: ${pluginName}`);
      }

      const result = await new Promise((resolve, reject) => {
        const requestId = ++this.requestId;
        
        // 设置超时
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(requestId);
          reject(new Error('插件执行超时'));
        }, 30000); // 30秒超时

        // 保存请求信息
        this.pendingRequests.set(requestId, {
          resolve: (result) => {
            clearTimeout(timeout);
            resolve(result);
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          }
        });

        // 发送执行消息给插件
        child.send({
          type: 'execute',
          id: requestId,
          action: action,
          args: args
        });
      });
      
      this.performanceMonitor.endTimer('execute_plugin', pluginName, { 
        success: true, 
        action 
      });
      
      return result;
      
    } catch (error) {
      this.performanceMonitor.endTimer('execute_plugin', pluginName, { 
        success: false, 
        error: error.message 
      });
      
      await this.errorHandler.handleError(error, { 
        pluginName, 
        operation: 'execute_plugin',
        action,
        args 
      });
      
      throw error;
    }
  }

  /**
   * 处理插件对主进程API的调用
   */
  async handleApiCall(apiName, args) {
    try {
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
          const result = await this.macTools.captureAndOCR();
          return {
            imageData: result.imageData,
            text: result.text
          };
        
        case 'cleanup':
          this.macTools.cleanup();
          return { success: true };
        
        default:
          throw new Error(`未知的API: ${apiName}`);
      }
      
    } catch (error) {
      await this.errorHandler.handleError(error, { 
        operation: 'handle_api_call', 
        apiName,
        args 
      });
      throw error;
    }
  }

  /**
   * 获取运行中的插件列表
   */
  getRunningPlugins() {
    try {
      return Array.from(this.processes.keys()).map(name => ({
        name: name,
        pid: this.processes.get(name).pid,
        status: 'running'
      }));
    } catch (error) {
      this.errorHandler.handleError(error, { operation: 'get_running_plugins' });
      return [];
    }
  }

  /**
   * 获取插件进程管理器状态
   */
  getStatus() {
    return {
      pluginCount: this.processes.size,
      pluginsDir: this.pluginsDir,
      pendingRequests: this.pendingRequests.size,
      macToolsActive: !!this.macTools,
      resultWindowManagerActive: !!this.resultWindowManager,
      runningPlugins: this.getRunningPlugins()
    };
  }
}

module.exports = PluginProcessManager; 