// MyHostex DOM 诊断工具 v3.11.1
// 使用方法：在 MyHostex 对话页面打开控制台，粘贴此脚本并回车

(function() {
  console.log('🔍 MyHostex DOM 诊断工具启动...\n');
  
  // 1. 检查当前页面
  console.log('=== 1. 当前页面信息 ===');
  console.log('URL:', window.location.href);
  console.log('Title:', document.title);
  console.log('Body classes:', document.body.className);
  
  // 2. 检查消息列表容器
  console.log('\n=== 2. 消息列表容器 ===');
  const possibleContainers = [
    '.message-list',
    '.chat-list',
    '.conversation-messages',
    '[class*="message-list"]',
    '[class*="chat-container"]',
    '[class*="message-container"]',
    '[id*="message"]',
    '[id*="chat"]',
  ];
  
  possibleContainers.forEach(sel => {
    const el = document.querySelector(sel);
    if (el) {
      console.log('✅ 找到容器:', sel);
      console.log('   子元素数量:', el.children.length);
      console.log('   HTML (前200字符):', el.outerHTML.substring(0, 200));
    }
  });
  
  // 3. 检查所有可能的消息元素
  console.log('\n=== 3. 消息元素 ===');
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
  
  messageSelectors.forEach(sel => {
    const items = document.querySelectorAll(sel);
    if (items.length > 0) {
      console.log(`✅ 找到 ${items.length} 个消息元素: ${sel}`);
      console.log('   第一个元素的 HTML (前300字符):', items[0].outerHTML.substring(0, 300));
      console.log('   第一个元素的类名:', items[0].className);
      console.log('   第一个元素的 dataset:', items[0].dataset);
    }
  });
  
  // 4. 检查消息方向判断类
  console.log('\n=== 4. 消息方向判断 ===');
  messageSelectors.forEach(sel => {
    const items = document.querySelectorAll(sel);
    items.forEach((item, idx) => {
      if (idx >= 3) return; // 只检查前3个
      const hasOutgoing = item.classList.contains('outgoing') || 
                       item.classList.contains('sent') || 
                       item.classList.contains('self');
      console.log(`消息 ${idx}: ${sel}, 是否是发送消息: ${hasOutgoing}`);
    });
  });
  
  // 5. 检查文本内容
  console.log('\n=== 5. 消息文本内容 ===');
  messageSelectors.forEach(sel => {
    const items = document.querySelectorAll(sel);
    items.forEach((item, idx) => {
      if (idx >= 3) return;
      const text = item.textContent?.trim() || '';
      console.log(`消息 ${idx}: "${text.substring(0, 50)}"`);
    });
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
      console.log('   类型:', el.tagName);
      console.log('   Placeholder:', el.placeholder);
      console.log('   Class:', el.className);
    }
  });
  
  // 7. 检查对话列表
  console.log('\n=== 7. 对话列表 ===');
  const convSelectors = [
    '.inbox-list .conversation-item',
    '[class*="conversation-item"]',
    '[data-testid="conversation-item"]',
    '.message-list-item',
  ];
  
  convSelectors.forEach(sel => {
    const items = document.querySelectorAll(sel);
    if (items.length > 0) {
      console.log(`✅ 找到 ${items.length} 个对话项: ${sel}`);
      console.log('   第一个元素的 HTML (前300字符):', items[0].outerHTML.substring(0, 300));
    }
  });
  
  // 8. 检查房源信息
  console.log('\n=== 8. 房源信息 ===');
  const housingSelectors = [
    '[class*="housing"]',
    '[class*="property"]',
    '[class*="room"]',
    '[class*="房源"]',
  ];
  
  housingSelectors.forEach(sel => {
    const items = document.querySelectorAll(sel);
    if (items.length > 0) {
      console.log(`✅ 找到 ${items.length} 个房源元素: ${sel}`);
      items.forEach((item, idx) => {
        if (idx >= 2) return;
        console.log(`   房源 ${idx}: ${item.textContent?.trim()}`);
      });
    }
  });
  
  console.log('\n🔍 诊断完成！');
})();
