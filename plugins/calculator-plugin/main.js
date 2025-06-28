// 计算器插件主逻辑
class CalculatorPlugin {
  constructor() {
    this.name = '计算器';
    this.description = '简单的计算器功能';
    this.version = '1.0.0';
    this.author = 'oTools';
  }

  // 插件初始化
  async init() {
    console.log('[计算器插件] 初始化完成');
  }

  // 执行计算
  calculate(expression) {
    try {
      console.log(`[计算器插件] 计算表达式: ${expression}`);
      const result = eval(expression);
      return {
        success: true,
        result: result,
        message: '计算成功'
      };
    } catch (error) {
      console.error(`[计算器插件] 计算失败:`, error);
      return {
        success: false,
        error: error.message,
        message: '计算失败'
      };
    }
  }

  // 插件执行入口
  async execute(action, ...args) {
    switch (action) {
      case 'calculate':
        return this.calculate(...args);
      default:
        throw new Error(`未知的操作: ${action}`);
    }
  }

  // 插件清理
  async cleanup() {
    console.log('[计算器插件] 清理完成');
  }
}

// 创建插件实例
const plugin = new CalculatorPlugin();

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
    console.error(`[计算器插件] 处理消息失败:`, error);
    process.send({ 
      type: 'error', 
      id: message.id, 
      error: error.message 
    });
  }
});

// 通知主进程插件已加载
process.send({ type: 'loaded', plugin: plugin.name }); 