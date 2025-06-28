module.exports = {
  name: '示例插件',
  description: '这是一个示例插件，展示插件系统的基本功能',
  version: '1.0.0',
  author: 'ILikeBug',
  
  // 插件执行入口
  async execute(...args) {
    try {
      console.log('示例插件执行中...', args);
      
      // 模拟一些处理逻辑
      const result = {
        message: '示例插件执行成功！',
        timestamp: new Date().toISOString(),
        args: args
      };
      
      return {
        success: true,
        result: result,
        message: '示例插件执行完成'
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        message: `插件执行失败: ${error.message}`
      };
    }
  }
}; 