/**
 * MyHostex 助手 DOM 诊断脚本 (v3.2.0)
 * 将此脚本粘贴到 MyHostex 网站的控制台中运行
 */

(function() {
  console.log("🔍 MyHostex 助手 DOM 诊断开始...\n");

  // 1. 检查消息列表相关元素
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("1️⃣ 检查对话列表/消息列表元素");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const listSelectors = [
    ".inbox-list .conversation-item",
    "[data-testid='conversation-item']",
    ".message-list-item",
    ".conversation-row",
    "li[class*='conversation']",
    "div[class*='inbox'] div[class*='item']",
    "[class*='ConversationItem']",
    "[class*='thread-item']",
    "[class*='message-list'] > li",
    "[class*='message-list'] > div",
    "[class*='InboxList'] > div",
  ];

  console.log("\n尝试找到对话列表容器...");
  let foundSelector = null;
  let foundItems = null;

  for (const sel of listSelectors) {
    const items = document.querySelectorAll(sel);
    if (items.length > 0) {
      console.log(`✅ 找到 ${items.length} 个元素: ${sel}`);
      foundSelector = sel;
      foundItems = items;
      break;
    }
  }

  if (!foundItems) {
    console.log("❌ 未找到对话列表元素");
    console.log("\n尝试更通用的搜索...");
    const allLists = document.querySelectorAll('ul, ol, div[class*="list"], div[class*="List"]');
    console.log(`找到 ${allLists.length} 个列表元素`);

    // 尝试找到包含"消息"、"message"等文本的元素
    const bodyText = document.body.textContent.toLowerCase();
    console.log("\n页面文本中的关键词:");
    ["message", "inbox", "conversation", "对话", "消息", "聊天"].forEach(keyword => {
      if (bodyText.includes(keyword)) {
        console.log(`  - 包含 "${keyword}"`);
      }
    });
  } else {
    console.log("\n找到的第一个对话元素详情:");
    const firstItem = foundItems[0];
    console.log("  HTML:", firstItem.outerHTML.substring(0, 500));
    console.log("  Class names:", firstItem.className);
    console.log("  Data attributes:");
    for (const attr of firstItem.attributes) {
      if (attr.name.startsWith('data-')) {
        console.log(`    ${attr.name}: ${attr.value}`);
      }
    }
    console.log("  Text content:", firstItem.textContent.trim().substring(0, 100));

    // 检查未读状态
    console.log("\n检查未读状态标识:");
    const hasUnreadClass = firstItem.className.toLowerCase().includes('unread');
    const hasBadge = firstItem.querySelector('.badge, [class*="badge"], [class*="unread"]');
    console.log(`  - 包含 'unread' 类名: ${hasUnreadClass}`);
    console.log(`  - 找到 badge 元素: ${!!hasBadge}`);
    if (hasBadge) {
      console.log(`  - Badge HTML: ${hasBadge.outerHTML}`);
    }
  }

  // 2. 检查消息气泡
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("2️⃣ 检查消息气泡/消息内容元素");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const messageSelectors = [
    ".message-bubble",
    ".chat-message",
    "[class*='message-item']",
    "[class*='MessageItem']",
    "[data-testid='message']",
    "[class*='msg']",
    "[class*='MessageBubble']",
    "[class*='ChatMessage']",
  ];

  console.log("\n尝试找到消息气泡...");
  let foundMessages = null;

  for (const sel of messageSelectors) {
    const items = document.querySelectorAll(sel);
    if (items.length > 0) {
      console.log(`✅ 找到 ${items.length} 个消息气泡: ${sel}`);
      foundMessages = items;
      break;
    }
  }

  if (foundMessages) {
    console.log("\n第一个消息气泡详情:");
    const firstMsg = foundMessages[0];
    console.log("  HTML:", firstMsg.outerHTML.substring(0, 500));
    console.log("  Class names:", firstMsg.className);
    console.log("  Text content:", firstMsg.textContent.trim().substring(0, 100));

    // 检查发送方向标识
    console.log("\n检查发送方向标识:");
    const isOutgoing =
      firstMsg.classList.contains("outgoing") ||
      firstMsg.classList.contains("sent") ||
      firstMsg.classList.contains("self");
    console.log(`  - 是否为发出的消息: ${isOutgoing}`);
    console.log(`  - 所有类名: ${firstMsg.className}`);
  } else {
    console.log("❌ 未找到消息气泡元素");
  }

  // 3. 检查输入框和发送按钮
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("3️⃣ 检查输入框和发送按钮");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const inputs = document.querySelectorAll('textarea, input[type="text"], div[contenteditable="true"]');
  console.log(`找到 ${inputs.length} 个输入元素:`);

  inputs.forEach((input, idx) => {
    console.log(`\n输入元素 #${idx + 1}:`);
    console.log(`  标签: ${input.tagName}`);
    console.log(`  Class: ${input.className}`);
    console.log(`  Placeholder: ${input.getAttribute('placeholder')}`);
    console.log(`  ID: ${input.id}`);
    if (input.contentEditable === "true") {
      console.log(`  ContentEditable: true`);
      console.log(`  Text: ${input.textContent.trim().substring(0, 50)}`);
    } else {
      console.log(`  Value: ${input.value.substring(0, 50)}`);
    }
  });

  const buttons = document.querySelectorAll('button');
  console.log(`\n找到 ${buttons.length} 个按钮:`);
  let sendButtons = [];

  buttons.forEach((btn, idx) => {
    const text = btn.textContent.trim();
    if (text.includes('发送') || text.includes('Send') || text.includes('提交') || btn.className.includes('send')) {
      sendButtons.push({ idx, text, className: btn.className });
      console.log(`\n发送按钮 #${sendButtons.length}:`);
      console.log(`  文本: ${text}`);
      console.log(`  Class: ${btn.className}`);
      console.log(`  ID: ${btn.id}`);
    }
  });

  // 4. 监控 DOM 变化
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("4️⃣ 建议：监控 DOM 变化");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  console.log("\n💡 如果您希望实时观察 DOM 变化，请运行以下命令:");
  console.log(`
    // 创建一个观察者，当 DOM 发生变化时输出日志
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length > 0) {
          console.log("🆕 新增节点:", mutation.addedNodes);
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log("✅ DOM 观察者已启动，等待新消息...");
  `);

  // 5. 生成建议
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("5️⃣ 诊断建议");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  console.log("\n基于以上诊断结果，建议:");

  if (!foundItems) {
    console.log("\n🔴 严重问题：未找到对话列表元素");
    console.log("   可能的原因:");
    console.log("   1. DOM 结构与预期不符");
    console.log("   2. 元素是动态加载的，可能需要等待页面完全加载");
    console.log("   3. 元素在 iframe 或 shadow DOM 中");
    console.log("\n   建议:");
    console.log("   1. 截图整个页面，查看消息列表的实际 HTML 结构");
    console.log("   2. 右键点击消息列表项 -> 检查元素，查看实际的 class 和 data 属性");
    console.log("   3. 使用浏览器开发工具的 Elements 面板手动查找消息列表容器");
  } else if (foundItems.length === 0) {
    console.log("\n🟡 警告：找到了选择器但没有找到元素");
    console.log("   可能是页面加载不完全或消息列表为空");
    console.log("   建议：刷新页面并重新运行此诊断脚本");
  } else {
    console.log("\n✅ 找到了对话列表元素");
    console.log("   建议更新 MessageReader.getConversationList() 中的选择器");
    console.log(`   使用选择器: ${foundSelector}`);
  }

  if (!foundMessages) {
    console.log("\n🟡 警告：未找到消息气泡元素");
    console.log("   这可能导致无法获取当前对话的消息内容");
    console.log("   建议：右键点击消息气泡 -> 检查元素，查看实际的 class 名称");
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ 诊断完成");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
})();
