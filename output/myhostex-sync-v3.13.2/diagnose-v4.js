// MyHostex DOM 诊断工具 v4
// 请复制全部内容到控制台运行

console.log('🔍 开始 DOM 诊断...\n');

// 1. 基础信息
console.log('=== 基础信息 ===');
console.log('当前 URL:', window.location.href);
console.log('页面标题:', document.title);
console.log('Body 类名:', document.body.className);
console.log('');

// 2. 查找消息元素 - 使用更简单的方法
console.log('=== 查找消息相关元素 ===');
const messageSelectors = [
  '.message-item',
  '.chat-message',
  '.conversation-message',
  '[class*="message"]',
  '[class*="chat"]',
  '[class*="conversation"]'
];

messageSelectors.forEach(selector => {
  try {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      console.log(`✅ ${selector}: 找到 ${elements.length} 个元素`);
      // 显示前3个元素的类名和文本
      Array.from(elements).slice(0, 3).forEach((el, idx) => {
        const text = el.textContent?.trim().substring(0, 50) || '(无文本)';
        console.log(`   [${idx}] class="${el.className}" text="${text}"`);
      });
    }
  } catch (e) {
    console.log(`❌ ${selector}: 错误 - ${e.message}`);
  }
});

// 3. 查找输入框
console.log('\n=== 查找输入框 ===');
const inputSelectors = [
  'textarea',
  'input[type="text"]',
  '[contenteditable="true"]',
  '[class*="input"]',
  '[class*="editor"]'
];

inputSelectors.forEach(selector => {
  try {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      console.log(`✅ ${selector}: 找到 ${elements.length} 个元素`);
    }
  } catch (e) {
    console.log(`❌ ${selector}: 错误 - ${e.message}`);
  }
});

// 4. 查找对话列表
console.log('\n=== 查找对话列表 ===');
const listSelectors = [
  '[class*="conversation-list"]',
  '[class*="chat-list"]',
  '[class*="message-list"]',
  '[class*="thread-list"]'
];

listSelectors.forEach(selector => {
  try {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      console.log(`✅ ${selector}: 找到 ${elements.length} 个元素`);
      const text = elements[0].textContent?.trim().substring(0, 100) || '(无文本)';
      console.log(`   文本预览: ${text}`);
    }
  } catch (e) {
    console.log(`❌ ${selector}: 错误 - ${e.message}`);
  }
});

// 5. 查找插件面板
console.log('\n=== 查找插件面板 ===');
const panel = document.getElementById('mha-panel');
if (panel) {
  console.log('✅ 找到插件面板 #mha-panel');
  console.log('   显示状态:', panel.style.display);
} else {
  console.log('❌ 未找到插件面板 #mha-panel');
}

// 6. 查看页面的主要结构
console.log('\n=== 页面主要结构 ===');
const mainContainers = document.querySelectorAll('main, #app, #root, [class*="app"], [class*="container"]');
console.log(`找到 ${mainContainers.length} 个主容器:`);
Array.from(mainContainers).slice(0, 5).forEach((el, idx) => {
  console.log(`[${idx}] <${el.tagName.toLowerCase()}> class="${el.className}" id="${el.id}"`);
});

// 7. 显示包含"你好"、"微笑"等关键字的元素
console.log('\n=== 查找包含关键字的元素 ===');
const keywords = ['你好', '微笑', '双木'];
keywords.forEach(keyword => {
  try {
    const xpath = `//*[contains(text(), '${keyword}')]`;
    const result = document.evaluate(xpath, document, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
    console.log(`✅ 关键字"${keyword}": 找到 ${result.snapshotLength} 个元素`);
    if (result.snapshotLength > 0) {
      for (let i = 0; i < Math.min(3, result.snapshotLength); i++) {
        const el = result.snapshotItem(i);
        console.log(`   [${i}] <${el.tagName.toLowerCase()}> class="${el.className}"`);
      }
    }
  } catch (e) {
    console.log(`❌ 关键字"${keyword}": 错误`);
  }
});

console.log('\n✅ 诊断完成！');
