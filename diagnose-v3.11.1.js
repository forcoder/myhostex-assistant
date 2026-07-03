// MyHostex 插件诊断工具 v3.11.1
// 使用方法：在 MyHostex 对话页面打开控制台，粘贴此脚本并回车

(function() {
  console.log('🔍 MyHostex 插件诊断工具启动...\n');
  
  // 1. 检查插件是否已加载
  console.log('=== 1. 插件加载状态 ===');
  console.log('__mha_panel__ 存在:', typeof window.__mha_panel__ !== 'undefined');
  console.log('content script 是否加载:', document.querySelector('#myhostex-assistant-panel') !== null);
  
  // 检查所有可能的插件标记
  const pluginMarkers = [
    'window.__mha_panel__',
    'window.MyHostexAssistant',
    'window.MHA',
  ];
  
  pluginMarkers.forEach(marker => {
    try {
      const val = eval(marker);
      console.log(`✅ ${marker}:`, typeof val);
    } catch (e) {
      console.log(`❌ ${marker}: 不存在`);
    }
  });
  
  // 2. 检查当前页面
  console.log('\n=== 2. 当前页面信息 ===');
  console.log('URL:', window.location.href);
  console.log('Title:', document.title);
  console.log('Body classes:', document.body.className);
  
  // 3. 检查 DOM 选择器
  console.log('\n=== 3. DOM 选择器测试 ===');
  const messageSelectors = [
    '.message-bubble',
    '.chat-message',
    '[class*="message-item"]',
    '[class*="MessageItem"]',
    '[data-testid="message"]',
    '[class*="msg"]',
    '[class*="MessageBubble"]',
    '[class*="ChatMessage"]',
  ];
  
  let foundMessages = null;
  let foundSelector = null;
  
  messageSelectors.forEach(sel => {
    const items = document.querySelectorAll(sel);
    if (items.length > 0) {
      console.log(`✅ 找到 ${items.length} 个消息元素: ${sel}`);
      if (!foundMessages) {
        foundMessages = items;
        foundSelector = sel;
      }
    }
  });
  
  if (!foundMessages) {
    console.log('❌ 没有找到任何消息元素！');
  }
  
  // 4. 检查消息内容
  if (foundMessages) {
    console.log('\n=== 4. 消息内容 ===');
    foundMessages.forEach((item, idx) => {
      if (idx >= 5) return;
      const text = item.textContent?.trim() || '';
      const classes = item.className;
      const hasOutgoing = classes.includes('outgoing') || 
                       classes.includes('sent') || 
                       classes.includes('self');
      console.log(`消息 ${idx}: "${text.substring(0, 60)}" | 发送: ${hasOutgoing}`);
    });
  }
  
  // 5. 检查插件面板
  console.log('\n=== 5. 插件面板 ===');
  const panelSelectors = [
    '#myhostex-assistant-panel',
    '[id*="mha"]',
    '[class*="myhostex"]',
    '[class*="assistant-panel"]',
  ];
  
  panelSelectors.forEach(sel => {
    const el = document.querySelector(sel);
    if (el) {
      console.log('✅ 找到面板:', sel);
      console.log('   面板 HTML (前200字符):', el.outerHTML.substring(0, 200));
    }
  });
  
  // 6. 检查输入框
  console.log('\n=== 6. 输入框 ===');
  const inputSelectors = [
    'textarea[placeholder*="输入"]',
    'textarea[placeholder*="请输入"]',
    'input[placeholder*="输入"]',
    'input[placeholder*="请输入"]',
    '.chat-input',
    '.message-input',
    '[class*="input"]',
    '[contenteditable="true"]',
  ];
  
  inputSelectors.forEach(sel => {
    const el = document.querySelector(sel);
    if (el) {
      console.log('✅ 找到输入框:', sel);
      console.log('   标签:', el.tagName);
      console.log('   Placeholder:', el.placeholder);
    }
  });
  
  // 7. 测试建议生成（如果可以找到相关对象）
  console.log('\n=== 7. 测试建议生成 ===');
  
  // 方法1：尝试从 Chrome Extension API 调用
  console.log('尝试通过 Chrome Extension API 调用...');
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    const testMessages = [
      { text: "你好，请问房间还有吗？", isOutgoing: false }
    ];
    
    chrome.runtime.sendMessage(
      { type: 'MYHOSTEX_GENERATE_SUGGESTIONS', messages: testMessages },
      (response) => {
        if (chrome.runtime.lastError) {
          console.log('❌ Chrome API 调用失败:', chrome.runtime.lastError.message);
        } else {
          console.log('✅ Chrome API 调用成功:', response);
        }
      }
    );
  } else {
    console.log('❌ Chrome Extension API 不可用');
  }
  
  // 8. 总结
  console.log('\n=== 8. 诊断总结 ===');
  if (foundMessages && foundMessages.length > 0) {
    console.log(`✅ 找到 ${foundMessages.length} 条消息，选择器: ${foundSelector}`);
    console.log('✅ DOM 选择器正常工作');
  } else {
    console.log('❌ 没有找到消息，DOM 选择器可能失效');
  }
  
  if (document.querySelector('#myhostex-assistant-panel')) {
    console.log('✅ 插件面板已加载');
  } else {
    console.log('❌ 插件面板未加载');
  }
  
  console.log('\n🔍 诊断完成！');
  
  // 9. 提供修复建议
  console.log('\n=== 9. 修复建议 ===');
  
  if (!foundMessages || foundMessages.length === 0) {
    console.log('⚠️ 问题：DOM 选择器失效');
    console.log('🔧 建议：');
    console.log('   1. 截图控制台输出发送给开发者');
    console.log('   2. 检查是否在正确的对话页面');
    console.log('   3. 尝试刷新页面');
  }
  
  if (!document.querySelector('#myhostex-assistant-panel')) {
    console.log('⚠️ 问题：插件面板未加载');
    console.log('🔧 建议：');
    console.log('   1. 检查插件是否已启用');
    console.log('   2. 重新加载插件（chrome://extensions）');
    console.log('   3. 刷新 MyHostex 页面');
  }
  
  // 返回诊断结果
  return {
    hasMessages: foundMessages && foundMessages.length > 0,
    hasPanel: document.querySelector('#myhostex-assistant-panel') !== null,
    messageCount: foundMessages ? foundMessages.length : 0,
    selector: foundSelector,
  };
})();
