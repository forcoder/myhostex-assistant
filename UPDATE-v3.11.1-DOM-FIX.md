# v3.11.1 修复 DOM 选择器失效问题

## 问题描述

用户反馈插件无法自动回复，控制台日志显示：
- ✅ WebSocket 监听正常
- ✅ 发送方判断正确（`origin_sender_id == origin_customer_id`，客户发送）
- ❌ **DOM 始终获取不到消息**（`DOM 获取消息数: 0`）

日志示例：
```
📩 DOM 获取消息数: 0
❌ 仍然没有 DOM 消息，跳过建议生成（可能是客服回复）
```

## 根本原因

`getCurrentMessages()` 方法中的 DOM 选择器都无法匹配到 MyHostex 页面的消息元素，可能的原因：
1. MyHostex 更新了页面结构
2. 当前不在对话页面
3. DOM 渲染延迟

## 解决方案

### 1. 增强 DOM 选择器（content.js:412-460）

**改进前**：
- 只有 6 个固定选择器
- 如果都匹配不到，直接返回空数组

**改进后**：
- 添加更多可能的选择器：
  - `[class*='message-body']`
  - `[class*='chat-bubble']`
  - `[class*='message-content']`
- 如果所有选择器都失败，使用**通用查找方法**：
  - 遍历所有 DOM 元素
  - 查找包含文本的元素（1-500 字符）
  - 排除包含大量子元素的容器
- 添加详细日志，显示使用的选择器和找到的元素数量

### 2. 延长等待时间和重试次数（content.js:272-350）

**改进前**：
- 首次延迟：2000ms
- 重试延迟：1000ms
- 重试次数：1 次

**改进后**：
- 首次延迟：3000ms（增加 50%）
- 重试延迟：2000ms（增加 100%）
- 重试次数：2 次（增加到 3 次尝试）

**总等待时间**：最多 7 秒（3000ms + 2000ms + 2000ms）

## 代码改进详情

### getCurrentMessages 方法增强

```javascript
getCurrentMessages() {
  const selectors = [
    ".message-bubble",
    ".chat-message",
    "[class*='message-item']",
    "[class*='MessageItem']",
    "[data-testid='message']",
    "[class*='msg']",
    // 新增选择器
    "[class*='message-body']",
    "[class*='chat-bubble']",
    "[class*='message-content']",
  ];
  let items = [];
  for (const sel of selectors) {
    items = document.querySelectorAll(sel);
    if (items.length > 0) {
      log(`✅ 使用选择器 ${sel} 找到 ${items.length} 条消息`);
      break;
    }
  }

  // 新增：通用查找方法
  if (items.length === 0) {
    log(`⚠️ 所有选择器都匹配不到，尝试通用查找...`);
    const allElements = document.querySelectorAll('*');
    const potentialMessages = [];
    
    allElements.forEach(el => {
      const text = el.textContent?.trim() || '';
      if (text.length > 1 && text.length < 500) {
        if (el.children.length < 5) {
          potentialMessages.push({ el, text });
        }
      }
    });
    
    items = potentialMessages.map(item => item.el);
    if (items.length > 0) {
      log(`✅ 通用查找找到 ${items.length} 个潜在消息元素`);
    }
  }

  // ... 其余逻辑
  log(`📊 最终获取到 ${messages.length} 条消息`);
  return messages;
}
```

### 延迟重试逻辑增强

```javascript
// 首次尝试：延迟 3000ms
setTimeout(() => {
  const domMsgs = MessageReader.getCurrentMessages();
  if (domMsgs.length > 0) {
    // 处理消息
  } else {
    // 第一次重试：延迟 2000ms
    setTimeout(() => {
      const retryDomMsgs = MessageReader.getCurrentMessages();
      if (retryDomMsgs.length > 0) {
        // 处理消息
      } else {
        // 第二次重试：延迟 2000ms
        setTimeout(() => {
          const retry2DomMsgs = MessageReader.getCurrentMessages();
          if (retry2DomMsgs.length > 0) {
            // 处理消息
          } else {
            // 最终失败
            Panel.showToast('⚠️ 无法获取消息详情，跳过建议生成');
          }
        }, 2000);
      }
    }, 2000);
  }
}, 3000);
```

## 预期效果

### 1. 更强的 DOM 容错性
- 即使 MyHostex 更新页面结构，通用查找方法也能找到消息元素
- 多重选择器确保至少有一个能匹配

### 2. 更长的等待时间
- 从 3 秒增加到 7 秒，确保 DOM 有足够时间渲染
- 3 次重试机制，提高成功率

### 3. 更详细的日志
- 显示使用的具体选择器
- 显示找到的消息数量
- 方便排查问题

### 4. 更友好的错误提示
- 用户能看到"⚠️ 无法获取消息详情，跳过建议生成"
- 而不是一直显示"等待新消息"

## 测试要点

1. **正常场景**：客户发送消息后，应该在 3-7 秒内看到建议
2. **慢速场景**：即使 DOM 渲染较慢，7 秒后也应该获取到消息
3. **页面结构变化**：即使 MyHostex 更新页面结构，通用查找方法也能工作
4. **日志检查**：
   - 应该看到 `✅ 使用选择器 xxx 找到 x 条消息`
   - 或者 `✅ 通用查找找到 x 个潜在消息元素`
   - 最后应该看到 `📊 最终获取到 x 条消息`

## 修改文件

- content.js:412-460 - getCurrentMessages 方法增强
- content.js:272-350 - 延迟重试逻辑增强
- manifest.json - 版本更新至 3.11.1

## 后续优化建议

如果问题仍然存在，考虑：
1. 使用 MutationObserver 监听 DOM 变化
2. 添加手动触发建议生成的按钮
3. 从 WebSocket 消息中直接提取消息内容（绕过 DOM）
