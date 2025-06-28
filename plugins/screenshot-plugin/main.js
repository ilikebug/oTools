const screenshot = require('screenshot-desktop');
const path = require('node:path');
const { app } = require('electron');

// 截图插件主逻辑
class ScreenshotPlugin {
  constructor() {
    this.name = '屏幕截图';
    this.description = '屏幕截图功能，支持全屏截图';
    this.version = '1.0.0';
    this.author = 'oTools';
  }

  // 插件初始化
  async init() {
    console.log('[截图插件] 初始化完成');
  }

  // 执行截图
  async takeScreenshot() {
    try {
      console.log('[截图插件] 开始截图');
      const imgPath = path.join(app.getPath('temp'), `screenshot-${Date.now()}.png`);
      await screenshot({ filename: imgPath });
      
      const response = {
        success: true,
        path: imgPath,
        message: '截图成功'
      };
      
      console.log(`[截图插件] 截图完成，保存至: ${imgPath}`);
      return response;
    } catch (error) {
      console.error(`[截图插件] 截图失败:`, error);
      return {
        success: false,
        error: error.message,
        message: '截图失败'
      };
    }
  }

  // 插件执行入口
  async execute(action, ...args) {
    switch (action) {
      case 'takeScreenshot':
        return await this.takeScreenshot(...args);
      default:
        throw new Error(`未知的操作: ${action}`);
    }
  }

  // 插件清理
  async cleanup() {
    console.log('[截图插件] 清理完成');
  }
}

// 创建插件实例
const plugin = new ScreenshotPlugin();

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
    console.error(`[截图插件] 处理消息失败:`, error);
    process.send({ 
      type: 'error', 
      id: message.id, 
      error: error.message 
    });
  }
});

// 通知主进程插件已加载
process.send({ type: 'loaded', plugin: plugin.name }); 