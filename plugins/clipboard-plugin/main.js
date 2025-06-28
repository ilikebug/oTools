const { clipboard } = require('electron');

// 剪贴板插件主逻辑
class ClipboardPlugin {
  constructor() {
    this.name = '剪贴板管理';
    this.description = '剪贴板管理功能，支持读取、写入和清空剪贴板';
    this.version = '1.0.0';
    this.author = 'oTools';
  }

  // 插件初始化
  async init() {
    console.log('[剪贴板插件] 初始化完成');
  }

  // 读取剪贴板
  getClipboard() {
    try {
      const text = clipboard.readText();
      console.log('[剪贴板插件] 读取剪贴板内容');
      return {
        success: true,
        text: text,
        message: '读取成功'
      };
    } catch (error) {
      console.error(`[剪贴板插件] 读取失败:`, error);
      return {
        success: false,
        error: error.message,
        message: '读取失败'
      };
    }
  }

  // 写入剪贴板
  setClipboard(text) {
    try {
      clipboard.writeText(text);
      console.log(`[剪贴板插件] 写入剪贴板: ${text.substring(0, 50)}...`);
      return {
        success: true,
        message: '写入成功'
      };
    } catch (error) {
      console.error(`[剪贴板插件] 写入失败:`, error);
      return {
        success: false,
        error: error.message,
        message: '写入失败'
      };
    }
  }

  // 清空剪贴板
  clearClipboard() {
    try {
      clipboard.clear();
      console.log('[剪贴板插件] 清空剪贴板');
      return {
        success: true,
        message: '清空成功'
      };
    } catch (error) {
      console.error(`[剪贴板插件] 清空失败:`, error);
      return {
        success: false,
        error: error.message,
        message: '清空失败'
      };
    }
  }

  // 插件执行入口
  async execute(action, ...args) {
    switch (action) {
      case 'getClipboard':
        return this.getClipboard(...args);
      case 'setClipboard':
        return this.setClipboard(...args);
      case 'clearClipboard':
        return this.clearClipboard(...args);
      default:
        throw new Error(`未知的操作: ${action}`);
    }
  }

  // 插件清理
  async cleanup() {
    console.log('[剪贴板插件] 清理完成');
  }
}

// 创建插件实例
const plugin = new ClipboardPlugin();

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
    console.error(`[剪贴板插件] 处理消息失败:`, error);
    process.send({ 
      type: 'error', 
      id: message.id, 
      error: error.message 
    });
  }
});

// 通知主进程插件已加载
process.send({ type: 'loaded', plugin: plugin.name }); 