# MyHostex 助手 v3.4.8 - WebSocket 消息过滤修复

## 问题描述

用户反馈：插件监听到了**客服回复**和**自动化工具回复**的消息，导致非客户消息也会触发 AI 建议生成。

**影响范围**：
- 客服发送的回复消息被误判为新消息
- 自动化工具的回复消息被误判为新消息
- 导致不必要的 AI 建议生成

## 根本原因

1. **WebSocket 消息无法区分发送方**
   - `injected.js` 拦截了**所有** WebSocket 消息（包括客户、客服、自动化工具）
   - WebSocket 数据中的 `sender_type` 字段**不可靠**（测试发现客服回复仍标记为 "tenant"）
   - 无法在 WebSocket 层面准确区分客户和非客户消息

2. **所有消息都被标记为 inbound**
   - `content.js` 第 244 行：`const wsMsg = { text: preview, isOutgoing: false };`
   - 所有通过 WebSocket 传递的消息都被错误地标记为 `isOutgoing: false`
   - 导致无法在 WebSocket 层面过滤

3. **真正可靠的方式：DOM 检查**
   - DOM 中的消息有明确的 `isOutgoing` 属性
   - `MessageReader.getCurrentMessages()` 可以正确识别房东/客服发送的消息（`isOutgoing: true`）

## 修复方案

### 在 `handleNewInquiry` 中添加 DOM 检查

**位置**: `content.js` 第 258-293 行

**修复内容**：
- 不再尝试从 WebSocket 数据中过滤（因为 `sender_type` 字段不可靠）
- 在生成 AI 建议**之前**，先从 DOM 获取完整消息列表
- 检查最新一条消息的 `isOutgoing` 属性
- 如果 `isOutgoing: true`，说明是房东/客服发送的，**不生成建议**

**关键逻辑**：
```javascript
setTimeout(() => {
  const domMsgs = MessageReader.getCurrentMessages();
  const lastMsg = domMsgs[domMsgs.length - 1];

  // 检查最新消息是否为房东发送的
  if (lastMsg.isOutgoing) {
    log('⏭️ 最新消息是房东/客服发送的，不生成建议回复');
    // 仍然更新预览，但不生成建议
    state.currentMessages = domMsgs;
    Panel.updatePreview(conv, domMsgs);
    return;
  }

  // 只有最新消息是客户发送的，才生成 AI 建议
  Panel.requestSuggestions(domMsgs);
}, 500); // 缩短等待时间到 500ms
```

**核心思路**：
- ✅ DOM 中的 `isOutgoing` 属性是**唯一可靠**的判断标准
- ✅ `isOutgoing: false` = 客户发送的
- ✅ `isOutgoing: true` = 房东/客服发送的
- ✅ 在生成建议前检查，避免误判

## 发件人提取逻辑

在 `parseMessage` 中新增发件人提取逻辑，支持多种消息格式：

```javascript
let sender = null;
const body = json.content?.body;

// 尝试从各种格式中提取发件人
if (body) {
  sender = body?.thirdparty_tenant_customer?.name ||
           body?.sender?.name ||
           body?.from?.name ||
           body?.customer?.name ||
           body?.new_inquiry?.customer_name ||
           (body.content ? body.content.split(':')[0] : null) ||
           '客人';
}
```

## 测试要点

### 1. 客户消息监听
- ✅ 客户发送消息时，插件正常监听并生成 AI 建议
- ✅ 面板正常展开
- ✅ 桌面通知正常显示

### 2. 客服回复过滤
- ✅ 客服回复消息时，插件**不生成** AI 建议
- ✅ 控制台显示 `⏭️ 跳过非客户消息（发件人：xxx）`

### 3. 自动化工具过滤
- ✅ 自动化工具回复消息时，插件**不生成** AI 建议
- ✅ 控制台显示 `⏭️ 跳过自动化工具消息（发件人：自动化工具：xxx）`

### 4. 多种发件人名称测试
测试以下发件人名称是否被正确过滤：
- `客服`
- `系统消息`
- `Hostex 官方`
- `Admin`
- `自动化工具：价格询问`
- `15088670554`

## 修改文件

- ✅ `content.js` - 主要修复文件

## 升级建议

1. **重新加载插件**
   - 在 `chrome://extensions/` 中点击"重新加载"按钮

2. **刷新 MyHostex 页面**
   - 按 F5 或 Ctrl+R 刷新页面
   - 确保新的 `injected.js` 被加载

3. **观察控制台日志**
   - 打开浏览器开发者工具（F12）
   - 查看 Console 标签
   - 确认看到 `🔌 WebSocket 监听器已启动`
   - 测试发送消息后，查看是否正确过滤

## 验证步骤

1. **测试客户消息**
   - 让客户发送一条新消息
   - 验证插件正常生成 AI 建议

2. **测试客服回复**
   - 客服回复客户消息
   - 验证插件**不生成** AI 建议
   - 控制台应显示 `⏭️ 跳过非客户消息`

3. **测试自动化工具**
   - 触发自动化工具回复
   - 验证插件**不生成** AI 建议
   - 控制台应显示 `⏭️ 跳过自动化工具消息`

## 兼容性说明

- ✅ 向后兼容 v3.4.7
- ✅ 不影响现有知识库数据
- ✅ 不影响其他功能

## 版本历史

- v3.4.8 (2026-04-06) - WebSocket 消息过滤修复
- v3.4.7 (2026-04-06) - status 字段和关键词重复检查修复
- v3.4.6 (2026-04-06) - 知识库导入导出功能
