const { ipcRenderer } = require('electron');

// 截图OCR插件主逻辑
class ScreenshotOCRPlugin {
  constructor() {
    this.name = 'screenshot-ocr';
    this.version = '1.0.0';
    this.description = '截图OCR识别插件';
    this.author = 'oTools';
    this.pendingRequests = new Map();
    this.init();
  }

  init() {    
    // 监听来自主进程的消息
    process.on('message', async (msg) => {
      
      if (msg.type === 'init') {
        // 插件初始化
        this.sendMessage({ type: 'loaded', name: this.name });
        this.sendMessage({ type: 'ready', name: this.name });
      } else if (msg.type === 'execute') {
        // 执行插件功能
        await this.execute(msg.action, msg.args, msg.id);
      } else if (msg.type === 'api_result') {
        // 处理API调用结果
        this.handleApiResult(msg);
      }
    });
  }

  // 发送消息给主进程
  sendMessage(message) {
    if (process.send) {
      process.send(message);
    }
  }

  // 调用主进程API
  async callMainProcessAPI(apiName, args = []) {
    return new Promise((resolve, reject) => {
      const requestId = Date.now() + Math.random();
      
      // 保存回调函数
      this.pendingRequests.set(requestId, { resolve, reject });
      
      // 发送API调用请求
      this.sendMessage({
        type: 'api_call',
        id: requestId,
        api: apiName,
        args: args
      });
    });
  }

  // 处理API调用结果
  handleApiResult(msg) {
    const request = this.pendingRequests.get(msg.id);
    if (request) {
      this.pendingRequests.delete(msg.id);
      if (msg.error) {
        request.reject(new Error(msg.error));
      } else {
        request.resolve(msg.result);
      }
    }
  }

  // 通用显示HTML窗口
  async showHtmlWindow(htmlPath, data = {}, windowOptions = {}) {
    return new Promise((resolve, reject) => {
      const requestId = Date.now() + Math.random();
      this.pendingRequests.set(requestId, { resolve, reject });
      this.sendMessage({
        type: 'show_html_window',
        id: requestId,
        htmlPath,
        data,
        windowOptions
      });
    });
  }

  // 执行插件功能
  async execute(action = 'default', args = [], requestId) {
    try {
      console.log(`[${this.name}] 执行动作: ${action}`);
      
      switch (action) {
        case 'capture_and_ocr':
          return await this.captureAndOCR(requestId);
        case 'default':
        default:
          return await this.captureAndOCR(requestId);
      }
    } catch (error) {
      console.error(`[${this.name}] 执行失败:`, error);
      this.sendMessage({
        type: 'result',
        id: requestId,
        error: error.message
      });
    }
  }

  // 截图并OCR识别
  async captureAndOCR(requestId) {
    try {
      console.log(`[${this.name}] 开始截图并OCR识别...`);
      // 调用主进程的截图并OCR功能
      const result = await this.callMainProcessAPI('captureAndOCR');
      if (result && result.imageData && result.text !== undefined) {
        // 通用显示HTML窗口
        await this.showHtmlWindow(
          'result-viewer.html',
          { imageData: result.imageData, text: result.text },
          { title: 'OCR结果', width: 900, height: 800 }
        );
        this.sendMessage({
          type: 'result',
          id: requestId,
          result: {
            success: true,
            message: '截图并OCR识别成功，结果窗口已显示',
            data: {
              imageData: result.imageData,
              text: result.text
            }
          }
        });
      } else {
        throw new Error('截图或OCR识别失败');
      }
    } catch (error) {
      console.error(`[${this.name}] 截图并OCR识别失败:`, error);
      this.sendMessage({
        type: 'result',
        id: requestId,
        error: error.message
      });
    }
  }
}

// 创建插件实例
const plugin = new ScreenshotOCRPlugin(); 