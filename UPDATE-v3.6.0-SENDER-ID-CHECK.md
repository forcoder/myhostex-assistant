# MyHostex 插件 v3.6.0 更新说明

## 问题

**用户反馈**：客服回复"你好"时，WebSocket 消息中的 `thirdparty_tenant_customer.name` 仍然显示为客户名称 `"zBU315567079"`，导致无法通过发件人名称过滤。

## 根本原因分析

MyHostex 的 WebSocket API 设计缺陷：
- `thirdparty_tenant_customer` 字段始终填充的是**客户信息**（name, origin_customer_id 等）
- 即使消息是客服或自动化工具发送的，这个字段也不会变
- `sender_type` 字段也始终为 `"tenant"`，完全不可靠

### WebSocket 消息数据结构分析

**客户发送消息时**：
```json
{
  "new_inquiry": {
    "origin_sender_id": "552721989",
  },
  "thirdparty_tenant_customer": {
    "origin_customer_id": "552721989",
    "name": "zBU315567079"
  }
}
```
- `origin_sender_id` = `origin_customer_id` ✅

**客服回复消息时**：
```json
{
  "new_inquiry": {
    "origin_sender_id": "398674499",  // 客服 ID
  },
  "thirdparty_tenant_customer": {
    "origin_customer_id": "552721989",  // 客户 ID（不变）
    "name": "zBU315567079"  // 客户名称（不变）
  }
}
```
- `origin_sender_id` ≠ `origin_customer_id` ✅

**关键发现**：通过比较 `origin_sender_id` 和 `origin_customer_id` 可以准确判断真实发送方！

## 解决方案

**v3.6.0 修复**：

1. **在 WebSocket 消息解析层面（parseMessage）直接判断发送方**
   - 比较 `origin_sender_id` 和 `origin_customer_id`
   - 如果相等 → 客户发送
   - 如果不相等 → 非客户发送（客服/自动化工具）

2. **传递 `isFromCustomer` 标志到 handleNewInquiry**
   - 在 `handleNewInquiry` 中首先检查这个标志
   - 如果不是客户发送，直接跳过，不生成建议

3. **移除对 DOM 的依赖**
   - 不再需要等待 DOM 渲染
   - 不需要 `isOutgoing` 属性检查
   - 完全基于 WebSocket 数据判断

## 修改内容

### 1. content.js - parseMessage 方法（三种消息类型）

#### 格式1：new_inquiry

**之前（v3.5.0）**：
```javascript
if (contentType === 'new_inquiry') {
  const body = json.content.body;
  const threadId = body?.thread_id || body?.new_inquiry?.thread_id;
  const preview  = body?.text_preview || body?.new_inquiry?.message || '';
  const sender   = body?.thirdparty_tenant_customer?.name || '客人';

  log('🆔 new_inquiry, Thread ID:', threadId, '| 预览:', preview);

  if (threadId) {
    this.handleNewInquiry({ threadId, preview, sender, body });
  }
  return;
}
```

**之后（v3.6.0）**：
```javascript
if (contentType === 'new_inquiry') {
  const body = json.content.body;
  const threadId = body?.thread_id || body?.new_inquiry?.thread_id;
  const preview  = body?.text_preview || body?.new_inquiry?.message || '';

  // 判断真实发送方：比较 origin_sender_id 和 origin_customer_id
  const originSenderId = body?.new_inquiry?.origin_sender_id || body?.origin_sender_id;
  const tenantCustomerId = body?.thirdparty_tenant_customer?.origin_customer_id;
  const senderId = originSenderId || tenantCustomerId;

  let sender = body?.thirdparty_tenant_customer?.name || '客人';
  let isFromCustomer = true;

  // 如果 origin_sender_id 不等于 origin_customer_id，说明不是客户发送的
  if (originSenderId && tenantCustomerId && originSenderId !== tenantCustomerId) {
    isFromCustomer = false;
    log(`🔍 发送方检测: origin_sender_id(${originSenderId}) ≠ origin_customer_id(${tenantCustomerId}), 非客户发送`);
  } else {
    log(`🔍 发送方检测: origin_sender_id(${originSenderId}) == origin_customer_id(${tenantCustomerId}), 客户发送`);
  }

  log('🆔 new_inquiry, Thread ID:', threadId, '| 预览:', preview, '| 是否客户:', isFromCustomer);

  if (threadId) {
    this.handleNewInquiry({ threadId, preview, sender, body, isFromCustomer });
  }
  return;
}
```

#### 格式2：housing_status_notice

**之后（v3.6.0）**：
```javascript
if (contentType === 'housing_status_notice') {
  const body = json.content.body;
  if (body?.type === 'customer_inquiry' || body?.origin_data?.params?.thread_id) {
    const threadId = body?.origin_data?.params?.thread_id;
    const preview  = body?.content || body?.origin_data?.content || '';
    const sender   = preview ? preview.split(':')[0] : '客人';

    // housing_status_notice 类型没有 origin_sender_id 字段，默认为客户发送
    const isFromCustomer = true;

    log('🆔 housing_status_notice(customer_inquiry), Thread ID:', threadId, '| 预览:', preview, '| 是否客户:', isFromCustomer);

    if (threadId) {
      this.handleNewInquiry({ threadId, preview, sender, body, isFromCustomer });
    }
  }
  return;
}
```

#### 格式3：customer_inquiry

**之后（v3.6.0）**：
```javascript
if (contentType === 'customer_inquiry') {
  const body = json.content.body;
  const threadId = body?.thread_id || body?.customer_inquiry?.thread_id;
  const preview  = body?.text_preview || body?.customer_inquiry?.message || '';

  // 判断真实发送方：比较 origin_sender_id 和 origin_customer_id
  const originSenderId = body?.customer_inquiry?.origin_sender_id || body?.origin_sender_id;
  const tenantCustomerId = body?.thirdparty_tenant_customer?.origin_customer_id;

  let sender = body?.thirdparty_tenant_customer?.name || '客人';
  let isFromCustomer = true;

  // 如果 origin_sender_id 不等于 origin_customer_id，说明不是客户发送的
  if (originSenderId && tenantCustomerId && originSenderId !== tenantCustomerId) {
    isFromCustomer = false;
    log(`🔍 发送方检测: origin_sender_id(${originSenderId}) ≠ origin_customer_id(${tenantCustomerId}), 非客户发送`);
  } else {
    log(`🔍 发送方检测: origin_sender_id(${originSenderId}) == origin_customer_id(${tenantCustomerId}), 客户发送`);
  }

  log('🆔 customer_inquiry, Thread ID:', threadId, '| 预览:', preview, '| 是否客户:', isFromCustomer);

  if (threadId) {
    this.handleNewInquiry({ threadId, preview, sender, body, isFromCustomer });
  }
}
```

### 2. content.js - handleNewInquiry 方法

**之前（v3.5.0）**：
```javascript
handleNewInquiry({ threadId, preview, sender, body }) {
  log('✅ 处理新消息 — Thread:', threadId, '| 发件人:', sender, '| 预览:', preview);

  // 再次检查发件人是否为自动化工具（双重保障）
  const isAutoTool = sender && (...);
  if (isAutoTool) {
    log(`⏭️ 跳过自动化工具消息（发件人：${sender}），不生成建议回复`);
    if (!state.panelExpanded) {
      Panel.expand();
    }
    return;
  }
  // ... 后续逻辑
}
```

**之后（v3.6.0）**：
```javascript
handleNewInquiry({ threadId, preview, sender, body, isFromCustomer = true }) {
  log('✅ 处理新消息 — Thread:', threadId, '| 发件人:', sender, '| 预览:', preview, '| 是否客户:', isFromCustomer);

  // 如果 WebSocket 层面已经判断出不是客户发送的，直接跳过
  if (!isFromCustomer) {
    log(`⏭️ WebSocket 层面判断：不是客户发送的消息，不生成建议回复`);
    // 仍然展开面板但不生成建议
    if (!state.panelExpanded) {
      Panel.expand();
    }
    return;
  }

  // 再次检查发件人是否为自动化工具（双重保障）
  const isAutoTool = sender && (...);
  if (isAutoTool) {
    log(`⏭️ 跳过自动化工具消息（发件人：${sender}），不生成建议回复`);
    if (!state.panelExpanded) {
      Panel.expand();
    }
    return;
  }
  // ... 后续逻辑（移除 DOM 检查和重试逻辑）
}
```

### 3. manifest.json - 版本号更新

```json
{
  "version": "3.6.0",
  "description": "接入大模型，结合房间信息（自动抓取）与回复规则，智能生成个性化回复建议，并学习房东回复风格 - v3.6.0 通过比较 origin_sender_id 和 origin_customer_id 直接在 WebSocket 层面判断发送方，解决客服回复被误判问题"
}
```

## 技术细节

### 为什么这个方案更可靠？

1. **无需等待 DOM 渲染**：直接在 WebSocket 消息到达时判断，立即响应
2. **基于数据本身判断**：不依赖页面结构或 CSS 类名
3. **准确的标识符**：`origin_sender_id` 是 MyHostex API 提供的真实发送方 ID
4. **简单的逻辑**：只需要比较两个 ID 是否相等

### 判断逻辑

```
if (origin_sender_id === origin_customer_id) {
  // 客户发送
  isFromCustomer = true
} else {
  // 客服/自动化工具发送
  isFromCustomer = false
}
```

### 保留的发件人名称过滤

虽然主要判断基于 ID 比较，但仍然保留了发件人名称过滤作为双重保障：
- 15088670554、自动化工具：、客服、系统、Hostex、Admin
- 这可以处理某些 edge case（如果 API 数据不完整）

## 测试要点

1. **客户发送消息**（比如 "[微笑]"）：
   - 应该看到：`🔍 发送方检测: origin_sender_id(552721989) == origin_customer_id(552721989), 客户发送`
   - 应该看到：`🆔 new_inquiry ... 是否客户: true`
   - 应该看到：`✅ 处理新消息 ... 是否客户: true`
   - **应该**生成 AI 建议回复

2. **客服回复消息**（比如 "你好"）：
   - 应该看到：`🔍 发送方检测: origin_sender_id(398674499) ≠ origin_customer_id(552721989), 非客户发送`
   - 应该看到：`🆔 new_inquiry ... 是否客户: false`
   - 应该看到：`✅ 处理新消息 ... 是否客户: false`
   - 应该看到：`⏭️ WebSocket 层面判断：不是客户发送的消息，不生成建议回复`
   - **不应该**生成 AI 建议

3. **系统自动消息**：
   - 可能通过发件人名称过滤拦截
   - **不应该**生成 AI 建议

4. **快速连续消息**：
   - 客户发送 → 客服回复 → 客户再发送
   - 确保只有客户发送的消息触发 AI 建议

## 优势

相比 v3.5.0 的 DOM 检查方案：

1. **即时响应**：无需等待 DOM 渲染，建议生成更快
2. **更可靠**：基于 API 数据而非页面结构
3. **更简单**：代码逻辑更清晰，无需重试机制
4. **更稳定**：不受页面 UI 变化影响

## 后续优化方向

如果这个方案仍然有 edge case，可以考虑：

1. 记录所有 `origin_sender_id` 的值，建立白名单/黑名单
2. 通过 `operator_id` 字段判断是否为房东操作
3. 监听更多 WebSocket 消息类型，完善覆盖范围

## 相关文件

- `content.js` - parseMessage 和 handleNewInquiry 方法修改
- `manifest.json` - 版本号更新
- `UPDATE-v3.6.0-SENDER-ID-CHECK.md` - 本文档
