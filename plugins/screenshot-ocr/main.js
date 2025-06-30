// 截图OCR插件主逻辑
class ScreenshotOCRPlugin {
  constructor() {
    this.name = 'screenshot-ocr';
    this.version = '1.0.0';
    this.description = '截图OCR识别插件';
    this.author = 'oTools';
    this.pendingRequests = new Map();
    this.pluginMeta = null;
    this.MessageType = null;
    this.MessageStatus = null;
    this.initialize();
  }

  initialize() {
    // 监听来自主进程的消息
    process.on('message', async (msg) => {
      if (!msg || !msg.type) return;
      // 插件的第一次通信必须是 'system:init'
      if (msg.type === 'system:init') {
        this.handleInit(msg);
        return;
      }

      // 如果尚未初始化，则忽略其他消息
      if (!this.MessageType) {
        return;
      }

      switch (msg.type) {
        case this.MessageType.REQUEST.PLUGIN_EXECUTE:
          await this.execute(msg.data.action, msg.data.args, msg.id);
          break;
        case this.MessageType.RESPONSE.SUCCESS:
          console.log('11111111', msg)
        case this.MessageType.RESPONSE.ERROR:
          this.handleApiResponse(msg);
          break;
      }
    });
  }

  handleInit(msg) {
    this.pluginMeta = msg.data.meta;
    const { MessageType, MessageStatus } = msg.data.messageProtocol;
    this.MessageType = MessageType;
    this.MessageStatus = MessageStatus;
    // 插件初始化成功，发送 'ready' 消息
    this.sendMessage(this.createEvent(this.MessageType.EVENT.PLUGIN_READY, { name: this.name }));
  }

  // region Message Creation Helpers
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  createRequest(type, data = {}, id = null) {
    return {
      type,
      id: id || this.generateId(),
      timestamp: Date.now(),
      data,
      version: '1.0',
      status: this.MessageStatus.PENDING
    };
  }

  createResponse(requestId, success, data = null, error = null) {
    return {
      type: success ? this.MessageType.RESPONSE.SUCCESS : this.MessageType.RESPONSE.ERROR,
      id: requestId,
      timestamp: Date.now(),
      data,
      error,
      version: '1.0',
      status: success ? this.MessageStatus.COMPLETED : this.MessageStatus.FAILED
    };
  }

  createEvent(type, data = {}) {
    return {
      type,
      id: this.generateId(),
      timestamp: Date.now(),
      data,
      version: '1.0',
      isEvent: true
    };
  }
  // endregion
  
  // 发送消息给主进程
  sendMessage(message) {
    if (process.send) {
      process.send(message);
    }
  }

  // 调用主进程API
  async callMainProcessApi(apiName, args = []) {
    return new Promise((resolve, reject) => {
      const request = this.createRequest(this.MessageType.REQUEST.API_CALL, { api: apiName, args });
      // 保存回调函数
      this.pendingRequests.set(request.id, { resolve, reject });
      // 发送API调用请求
      this.sendMessage(request);
    });
  }

  // 处理API调用结果
  handleApiResponse(msg) {
    const request = this.pendingRequests.get(msg.id);
    if (request) {
      this.pendingRequests.delete(msg.id);
      if (msg.type === this.MessageType.RESPONSE.ERROR) {
        request.reject(new Error(msg.error));
      } else {
        request.resolve(msg.data);
      }
    }
  }

  // 通用显示HTML窗口
  async showHtmlWindow(htmlPath, data = {}, windowOptions = {}) {
    return new Promise((resolve, reject) => {
      const request = this.createRequest(this.MessageType.REQUEST.WINDOW_SHOW, {
        htmlPath,
        data,
        windowOptions
      });
      // 保存回调函数
      this.pendingRequests.set(request.id, { resolve, reject });
      // 发送API调用请求
      this.sendMessage(request);
    });
  }

  // 执行插件功能
  async execute(action = 'default', args = [], requestId) {
    try {
      console.log(`[${this.name}] 执行动作: ${action}`);
      
      switch (action) {
        case 'default':
          return await this.captureAndOCR(requestId);
        default:
          return await this.captureAndOCR(requestId);
      }
    } catch (error) {
      console.error(`[${this.name}] 执行失败:`, error);
      this.sendMessage(this.createResponse(requestId, false, null, error.message));
    }
  }

  // 截图并OCR识别
  async captureAndOCR(requestId) {
    try {
      console.log(`[${this.name}] 开始截图并OCR识别...`);
      // 调用主进程的截图并OCR功能
      const result = await this.callMainProcessApi('captureAndOCR');
      if (result && result.imageData && result.text !== undefined) {
        // 通用显示HTML窗口
        await this.showHtmlWindow(
          '/Users/zhangye/Project/NodejsProject/oTools/plugins/screenshot-ocr/result-viewer.html',
          { imageData: result.imageData, text: result.text },
          { title: 'OCR结果', width: 900, height: 800 }
        );
        this.sendMessage(this.createResponse(requestId, true, {
          success: true,
          message: '截图并OCR识别成功，结果窗口已显示',
          data: {
            imageData: result.imageData,
            text: result.text
          }
        }));
      } else {
        throw new Error('截图或OCR识别失败');
      }
    } catch (error) {
      console.error(`[${this.name}] 截图并OCR识别失败:`, error);
      this.sendMessage(this.createResponse(requestId, false, null, error.message));
    }
  }
}

// 创建插件实例
const plugin = new ScreenshotOCRPlugin(); 