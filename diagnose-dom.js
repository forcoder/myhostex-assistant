/**
 * MyHostex 网站诊断脚本
 * 在 MyHostex 网站的控制台运行此脚本，检查 DOM 结构
 */

console.log("=== MyHostex 网站诊断 ===");

// 1. 检查对话列表元素
console.log("\n1. 检查对话列表元素：");
const selectors = [
  ".inbox-list .conversation-item",
  "[data-testid='conversation-item']",
  ".message-list-item",
  ".conversation-row",
  "li[class*='conversation']",
  "div[class*='inbox'] div[class*='item']",
  "[class*='ConversationItem']",
  "[class*='thread-item']",
];

selectors.forEach(sel => {
  const items = document.querySelectorAll(sel);
  if (items.length > 0) {
    console.log(`✅ 找到 ${items.length} 个元素: ${sel}`);
    console.log("   第一个元素:", items[0]);
    console.log("   第一个元素的类名:", items[0].className);
    console.log("   第一个元素的 dataset:", items[0].dataset);
  }
});

// 2. 检查未读标记
console.log("\n2. 检查未读标记：");
document.querySelectorAll("[class*='conversation'], [class*='thread'], [class*='message'], li, div").forEach((el, i) => {
  if (i > 20) return; // 只检查前20个元素
  
  const hasUnreadClass = el.classList.contains('unread') || 
                        el.className.includes('unread');
  const hasUnreadBadge = el.querySelector('.unread-badge, .badge, [class*="unread"], [class*="badge"]');
  
  if (hasUnreadClass || hasUnreadBadge) {
    console.log("✅ 发现可能的未读元素:", {
      tag: el.tagName,
      className: el.className,
      dataset: el.dataset,
      textContent: el.textContent?.substring(0, 50)
    });
  }
});

// 3. 检查消息气泡
console.log("\n3. 检查消息气泡：");
const msgSelectors = [
  ".message-bubble",
  ".chat-message",
  "[class*='message-item']",
  "[class*='MessageItem']",
  "[data-testid='message']",
  "[class*='msg']",
];

msgSelectors.forEach(sel => {
  const items = document.querySelectorAll(sel);
  if (items.length > 0) {
    console.log(`✅ 找到 ${items.length} 个消息元素: ${sel}`);
    console.log("   第一个元素:", items[0]);
    console.log("   第一个元素的类名:", items[0].className);
    console.log("   第一个元素是否是发送消息:", 
      items[0].classList.contains("outgoing") || 
      items[0].classList.contains("sent") || 
      items[0].classList.contains("self"));
  }
});

// 4. 检查输入框
console.log("\n4. 检查输入框：");
const inputSelectors = [
  ".ant-input[placeholder*='message' i]",
  ".ant-input[placeholder*='撰写']",
  "textarea[placeholder*='message' i]",
  "textarea[placeholder*='撰写']",
  "textarea[placeholder*='回复']",
  "textarea[placeholder*='输入']",
  "div[contenteditable='true'][class*='editor']",
  "div[contenteditable='true'][class*='input']",
  "div[contenteditable='true'][class*='reply']",
  ".reply-input textarea",
  ".message-composer textarea",
  "textarea",
];

inputSelectors.forEach(sel => {
  const items = document.querySelectorAll(sel);
  if (items.length > 0) {
    console.log(`✅ 找到 ${items.length} 个输入框: ${sel}`);
    console.log("   第一个输入框:", items[0]);
    console.log("   placeholder:", items[0].placeholder);
  }
});

// 5. 分析页面结构
console.log("\n5. 页面结构分析：");
console.log("当前页面 URL:", window.location.href);
console.log("页面标题:", document.title);
console.log("body 的类名:", document.body.className);

// 查找可能的容器
const possibleContainers = [
  "div[class*='inbox']",
  "div[class*='message']",
  "div[class*='chat']",
  "div[class*='conversation']",
  "section[class*='inbox']",
  "aside[class*='sidebar']",
];

possibleContainers.forEach(sel => {
  const items = document.querySelectorAll(sel);
  if (items.length > 0) {
    console.log(`✅ 找到 ${items.length} 个容器: ${sel}`);
  }
});

// 6. 列出所有可能相关的元素
console.log("\n6. 列出所有可能相关的元素（前30个）：");
const allElements = document.querySelectorAll('*');
let count = 0;
allElements.forEach(el => {
  if (count >= 30) return;
  
  const className = el.className || '';
  const datasetId = el.dataset.id || el.dataset.conversationId || '';
  
  if (className.includes('conversation') || 
      className.includes('message') ||
      className.includes('chat') ||
      className.includes('inbox') ||
      className.includes('thread') ||
      datasetId) {
    console.log({
      tag: el.tagName,
      className: className.substring(0, 50),
      dataset: el.dataset,
      text: el.textContent?.substring(0, 30)
    });
    count++;
  }
});

console.log("\n=== 诊断完成 ===");
console.log("\n请将以上输出复制并发送给开发者，以便进一步诊断问题。");
