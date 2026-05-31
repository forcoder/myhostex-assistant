// 快速诊断脚本 - 复制到控制台运行
console.log('🔍 快速诊断...\n');

// 1. 检查消息元素
const selectors = [
  '.message-bubble',
  '.chat-message', 
  '[class*="message"]',
  '[class*="chat"]',
  '[class*="bubble"]'
];

console.log('=== 消息元素检查 ===');
selectors.forEach(sel => {
  const els = document.querySelectorAll(sel);
  if (els.length > 0) {
    console.log(`✅ ${sel}: ${els.length} 个`);
    // 显示第一个元素的类名
    console.log(`   类名: "${els[0].className}"`);
  }
});

// 2. 查找包含"微笑"的元素
console.log('\n=== 查找"微笑"消息 ===');
const all = document.querySelectorAll('*');
let found = 0;
all.forEach(el => {
  if (el.textContent?.includes('微笑') && el.children.length === 0) {
    console.log(`[${found}] <${el.tagName}> class="${el.className}"`);
    found++;
    if (found >= 5) return;
  }
});

// 3. 检查父元素
if (found > 0) {
  console.log('\n=== 父元素结构 ===');
  const smileEl = Array.from(all).find(el => 
    el.textContent?.includes('微笑') && el.children.length === 0
  );
  if (smileEl) {
    let parent = smileEl.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
      console.log(`[${i}] <${parent.tagName}> class="${parent.className}"`);
      parent = parent.parentElement;
    }
  }
}

console.log('\n✅ 诊断完成！请把结果发给我。');
