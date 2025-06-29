const path = require('path');
const { fork } = require('child_process');
const fs = require('fs');

class PluginProcessManager {
  constructor(pluginsDir, macTools = null) {
    this.pluginsDir = pluginsDir;
    this.processes = new Map(); // name -> child_process
    this.pendingRequests = new Map(); // requestId -> { resolve, reject }
    this.requestId = 0;
    this.macTools = macTools; // 主进程的MacTools实例
    this.resultWindowManager = null; // 结果窗口管理器
  }

  // 设置结果窗口管理器
  setResultWindowManager(resultWindowManager) {
    this.resultWindowManager = resultWindowManager;
  }

  // 启动所有插件
  startAll() {
    try {
      if (!fs.existsSync(this.pluginsDir)) {
        return;
      }
      const pluginDirs = fs.readdirSync(this.pluginsDir).filter(f => fs.statSync(path.join(this.pluginsDir, f)).isDirectory());
      for (const dir of pluginDirs) {
        this.startPlugin(dir);
      }
    } catch (error) {
      console.error('启动插件时出错:', error);
    }
  }

  // 启动单个插件
  startPlugin(dirName) {
    const pluginPath = path.join(this.pluginsDir, dirName);
    const metaPath = path.join(pluginPath, 'plugin.json');
    if (!fs.existsSync(metaPath)) return;
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const mainPath = path.join(pluginPath, meta.main || 'main.js');
    if (!fs.existsSync(mainPath)) return;
    if (this.processes.has(meta.name)) {
      this.stopPlugin(meta.name);
    }

    const child = fork(mainPath, [], {
      cwd: pluginPath,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    child.on('message', async (msg) => {
      
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
        console.log(`[插件:${meta.name}] 已加载`);
      } else if (msg.type === 'ready') {
        console.log(`[插件:${meta.name}] 已就绪`);
      }
    });
    child.on('exit', (code, signal) => {
      console.log(`[插件:${meta.name}] 进程退出 code=${code} signal=${signal}`);
      this.processes.delete(meta.name);
    });
    this.processes.set(meta.name, child);
    // 可选：初始化消息
    child.send({ type: 'init', meta });
    console.log(`[插件:${meta.name}] 已启动`);
  }

  // 停止单个插件
  stopPlugin(name) {
    const child = this.processes.get(name);
    if (child) {
      child.kill();
      this.processes.delete(name);
      console.log(`[插件:${name}] 已停止`);
    }
  }

  // 停止所有插件
  stopAll() {
    for (const name of this.processes.keys()) {
      this.stopPlugin(name);
    }
  }

  // 给插件进程发消息
  sendToPlugin(name, msg) {
    const child = this.processes.get(name);
    if (child) {
      child.send(msg);
    }
  }

  // 执行插件
  async executePlugin(pluginName, action, ...args) {
    const child = this.processes.get(pluginName);
    if (!child) {
      throw new Error(`插件进程不存在: ${pluginName}`);
    }

    return new Promise((resolve, reject) => {
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
  }

  // 处理插件对主进程API的调用
  async handleApiCall(apiName, args) {
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
      
      case 'cleanupTempFiles':
        this.macTools.cleanup();
        return { success: true };
      
      default:
        throw new Error(`未知的API: ${apiName}`);
    }
  }

  // 获取运行中的插件列表
  getRunningPlugins() {
    return Array.from(this.processes.keys());
  }
}

module.exports = PluginProcessManager; 