// 测试插件加载
const PluginManager = require('./src/main/plugin-manager');

async function testPlugins() {
  console.log('开始测试插件加载...');
  
  const pluginManager = new PluginManager(null);
  
  // 等待插件加载
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const plugins = pluginManager.getPluginsList();
  console.log('\n已加载的插件:');
  plugins.forEach(plugin => {
    console.log(`- ${plugin.name} (${plugin.type})`);
    console.log(`  图标: ${plugin.icon}`);
    console.log(`  短名称: ${plugin.shortName}`);
    console.log(`  描述: ${plugin.description}`);
  });
  
  const builtinPlugins = plugins.filter(plugin => plugin.type === 'builtin');
  console.log(`\n内置插件数量: ${builtinPlugins.length}`);
  
  if (builtinPlugins.length > 0) {
    console.log('\n快捷功能按钮:');
    builtinPlugins.forEach(plugin => {
      console.log(`- ${plugin.shortName} (${plugin.icon})`);
    });
  }
  
  console.log('\n测试完成！');
}

testPlugins(); 