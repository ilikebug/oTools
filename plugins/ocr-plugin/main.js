const Tesseract = require('tesseract.js');

// OCR插件主逻辑
class OCRPlugin {
  constructor() {
    this.name = 'OCR文字识别';
    this.description = '图片文字识别功能，支持中英文识别';
    this.version = '1.0.0';
    this.author = 'oTools';
  }

  // 插件初始化
  async init() {
    console.log('[OCR插件] 初始化完成');
  }

  // 执行OCR识别
  async performOCR(imagePath) {
    try {
      console.log(`[OCR插件] 开始识别图片: ${imagePath}`);
      const result = await Tesseract.recognize(imagePath, 'chi_sim+eng', {
        logger: m => console.log(`[OCR插件] ${m.status}: ${m.progress}`)
      });
      
      const response = {
        success: true,
        text: result.data.text,
        confidence: result.data.confidence,
        message: '识别成功'
      };
      
      console.log(`[OCR插件] 识别完成，置信度: ${result.data.confidence}`);
      return response;
    } catch (error) {
      console.error(`[OCR插件] 识别失败:`, error);
      return {
        success: false,
        error: error.message,
        message: '识别失败'
      };
    }
  }

  // 插件执行入口
  async execute(action, ...args) {
    switch (action) {
      case 'performOCR':
        return await this.performOCR(...args);
      default:
        throw new Error(`未知的操作: ${action}`);
    }
  }

  // 插件清理
  async cleanup() {
    console.log('[OCR插件] 清理完成');
  }
}

// 创建插件实例
const plugin = new OCRPlugin();

// 处理主进程消息
process.on('message', async (message) => {
  try {
    if (message.type === 'init') {
      await plugin.init();
      process.send({ type: 'ready', plugin: plugin.name });
    } else if (message.type === 'execute') {
      const result = await plugin.execute(message.action, ...message.args);
      process.send({ type: 'result', id: message.id, result });
    } else if (message.type === 'cleanup') {
      await plugin.cleanup();
      process.send({ type: 'cleanup-complete' });
      process.exit(0);
    }
  } catch (error) {
    console.error(`[OCR插件] 处理消息失败:`, error);
    process.send({ 
      type: 'error', 
      id: message.id, 
      error: error.message 
    });
  }
});

// 通知主进程插件已加载
process.send({ type: 'loaded', plugin: plugin.name }); 