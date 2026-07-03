# MyHostex 插件 v3.5.0 更新说明

## 问题

v3.4.9 版本中，通过 DOM 检查消息方向（`isOutgoing` 属性）的方案在实际环境中失效。

**现象**：
- WebSocket 消息到达时，控制台显示 `📩 DOM 获取消息数: 0`
- DOM 中还没有渲染最新消息，无法判断消息方向
- 所有消息（客户发送、客服回复、系统消息）都触发了 AI 建议生成

**根本原因**：
WebSocket 消息到达时，页面 JavaScript 还未完成 DOM 渲染。v3.4.9 方案中设置的 500ms 延迟不够，DOM 中查询不到最新消息。

## 解决方案

**v3.5.0 修复**：

1. **增加延迟时间**：从 500ms 增加到 2000ms，给 DOM 更多时间渲染
2. **添加重试机制**：如果第一次检查时 DOM 为空，再等待 1000ms 后重试一次
3. **添加系统消息检测**：检查消息内容是否包含"系统"、"不支持"、"消息拓展"等关键词
4. **双重保障**：在 `isOutgoing` 检查之外，再添加系统消息内容过滤

## 修改内容

### 1. content.js - handleNewInquiry 方法（第 215-265 行）

**之前（v3.4.9）**：
```javascript
// 先从 DOM 获取完整消息列表，检查最新消息是否为房东/客服发送的
setTimeout(() => {
  const domMsgs = MessageReader.getCurrentMessages();
  log('📩 DOM 获取消息数:', domMsgs.length);

  if (domMsgs.length > 0) {
    const lastMsg = domMsgs[domMsgs.length - 1];
    log(`📝 最新消息 - 内容: "${lastMsg.text.substring(0, 30)}", 是否为房东发送: ${lastMsg.isOutgoing}`);

    if (lastMsg.isOutgoing) {
      log(`⏭️ 最新消息是房东/客服发送的，不生成建议回复`);
      state.currentMessages = domMsgs;
      Panel.updatePreview(conv, domMsgs);
      return;
    }

    state.currentMessages = domMsgs;
    Panel.updatePreview(conv, domMsgs);
    log('🤖 最新消息是客户发送的，开始生成建议，当前消息:', domMsgs);
    Panel.requestSuggestions(domMsgs);
  } else {
    // 如果 DOM 中没有消息，回退到使用 WebSocket 预览消息
    log('⚠️ DOM 中没有消息，使用 WebSocket 预览消息');
    Panel.requestSuggestions(msgs);
  }
}, 500); // 缩短等待时间到 500ms
```

**之后（v3.5.0）**：
```javascript
// 先从 DOM 获取完整消息列表，检查最新消息是否为房东/客服发送的
// 增加延迟时间到 2000ms，确保 DOM 有足够时间渲染
setTimeout(() => {
  const domMsgs = MessageReader.getCurrentMessages();
  log('📩 DOM 获取消息数:', domMsgs.length);

  if (domMsgs.length > 0) {
    // 检查最新一条消息是否为房东发送的
    const lastMsg = domMsgs[domMsgs.length - 1];
    log(`📝 最新消息 - 内容: "${lastMsg.text.substring(0, 30)}", 是否为房东发送: ${lastMsg.isOutgoing}`);

    if (lastMsg.isOutgoing) {
      log(`⏭️ 最新消息是房东/客服发送的，不生成建议回复`);
      state.currentMessages = domMsgs;
      Panel.updatePreview(conv, domMsgs);
      return;
    }

    // 再次检查发件人名称，作为双重保障
    const lastSender = lastMsg.text.substring(0, 30);
    const isSystemMessage = lastSender.includes('系统') || lastSender.includes('不支持') ||
                           lastSender.includes('暂不支持') || lastSender.includes('消息拓展');

    if (isSystemMessage) {
      log(`⏭️ 最新消息是系统消息，不生成建议回复`);
      state.currentMessages = domMsgs;
      Panel.updatePreview(conv, domMsgs);
      return;
    }

    state.currentMessages = domMsgs;
    Panel.updatePreview(conv, domMsgs);
    log('🤖 最新消息是客户发送的，开始生成建议，当前消息:', domMsgs);
    Panel.requestSuggestions(domMsgs);
  } else {
    // 如果 DOM 中没有消息，尝试等待更长时间
    log('⚠️ DOM 中没有消息，再等待 1000ms...');
    setTimeout(() => {
      const retryDomMsgs = MessageReader.getCurrentMessages();
      log('📩 重试 - DOM 获取消息数:', retryDomMsgs.length);
      if (retryDomMsgs.length > 0) {
        const lastMsg = retryDomMsgs[retryDomMsgs.length - 1];
        log(`📝 最新消息 - 内容: "${lastMsg.text.substring(0, 30)}", 是否为房东发送: ${lastMsg.isOutgoing}`);

        if (lastMsg.isOutgoing) {
          log(`⏭️ 最新消息是房东/客服发送的，不生成建议回复`);
          state.currentMessages = retryDomMsgs;
          Panel.updatePreview(conv, retryDomMsgs);
          return;
        }

        state.currentMessages = retryDomMsgs;
        Panel.updatePreview(conv, retryDomMsgs);
        log('🤖 最新消息是客户发送的，开始生成建议，当前消息:', retryDomMsgs);
        Panel.requestSuggestions(retryDomMsgs);
      } else {
        // 仍然没有 DOM 消息，回退到使用 WebSocket 预览消息（但不生成建议）
        log('❌ 仍然没有 DOM 消息，跳过建议生成（可能是客服回复）');
        state.currentMessages = msgs;
        Panel.updatePreview(conv, msgs);
      }
    }, 1000);
  }
}, 2000); // 增加等待时间到 2000ms
```

### 2. manifest.json - 版本号更新

```json
{
  "version": "3.5.0",
  "description": "接入大模型，结合房间信息（自动抓取）与回复规则，智能生成个性化回复建议，并学习房东回复风格 - v3.5.0 增加 DOM 等待时间到 2000ms 并添加重试逻辑，确保消息方向检测准确"
}
```

## 技术细节

### 为什么需要更长的延迟时间？

WebSocket 消息的到达时机早于页面 DOM 渲染：

1. WebSocket 收到新消息通知（`new_inquiry`）
2. 插件的 `parseMessage` 立即捕获消息并触发 `handleNewInquiry`
3. 页面的 Angular/React 框架开始处理消息并渲染到 DOM
4. 插件在 500ms 后尝试从 DOM 获取消息 → **失败（DOM 还没渲染）**

**v3.5.0 方案**：
- 延迟 2000ms → 给框架更多时间完成渲染
- 如果仍然为空 → 再等待 1000ms 重试
- 如果重试仍然为空 → 假设是非客户消息（客服/系统），不生成建议

### 系统消息识别

通过消息内容特征识别系统消息：
- 包含"系统"关键词
- 包含"不支持"、"暂不支持"
- 包含"消息拓展"

这些消息通常是 MyHostex 平台自动发送的系统通知，不需要 AI 生成建议回复。

## 测试要点

1. **客户发送消息**：
   - 应该能看到 "🤖 最新消息是客户发送的，开始生成建议" 日志
   - 面板展开并生成 AI 建议回复

2. **客服回复消息**：
   - DOM 应该能获取到消息（延迟后）
   - `lastMsg.isOutgoing` 应该为 `true`
   - 应该看到 "⏭️ 最新消息是房东/客服发送的，不生成建议回复" 日志
   - **不应该**生成 AI 建议

3. **系统自动消息**（如"暂不支持的消息拓展类型"）：
   - DOM 应该能获取到消息
   - 应该看到 "⏭️ 最新消息是系统消息，不生成建议回复" 日志
   - **不应该**生成 AI 建议

4. **快速连续消息**：
   - 测试客户发送、客服回复、客户再发送的场景
   - 确保只有客户发送的消息触发 AI 建议

## 风险评估

- **风险**：2000ms 的延迟可能导致建议生成慢于预期
- **缓解**：用户仍然可以手动点击"生成建议"按钮获取即时建议
- **收益**：确保消息方向检测准确，避免错误触发 AI 建议

## 后续优化方向

如果 2000ms 延迟仍然不够，可以考虑：

1. 使用 `MutationObserver` 监听 DOM 变化，当新消息元素插入时立即触发检查
2. 在 WebSocket 消息中寻找更可靠的发送方标识（如果 MyHostex API 提供）
3. 使用更复杂的消息去重和方向判断逻辑

## 相关文件

- `content.js` - 核心修复文件
- `manifest.json` - 版本号更新
- `UPDATE-v3.5.0-DOM-RETRY.md` - 本文档
