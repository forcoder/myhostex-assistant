# MyHostex 智能回复助手 v3.3.1 - MyHostex 消息结构适配

## 📋 更新概述

**版本号**: 3.3.1  
**发布日期**: 2026-04-05  
**主要功能**: 适配 MyHostex 的 WebSocket 消息结构

---

## 🎯 问题描述

### 用户反馈

> "还是没有监听到用户的新消息，以下是 websocket.ts 的代码，请修复。"

### 问题分析

通过分析 MyHostex 的 `websocket.ts` 代码，发现：

**MyHostex 的 WebSocket 消息结构**：
```typescript
dispatchMessage({
  content: {
    type: "new_inquiry",
    body: {
      new_inquiry: {
        id: 1,
        message: "...",
        thread_id: "...",
      },
      thread_id: "...",
      thread_unread_num: 1,
      thirdparty_tenant_customer: {...},
      thirdparty_host_customer: {...}
    }
  }
})
```

**关键发现**：
1. 消息使用嵌套结构：`message.content.type`
2. 新消息类型：`new_inquiry` 和 `customer_inquiry`
3. 消息包含 `thread_id`，用于标识对话
4. 消息包含 `thread_unread_num`，表示未读数量

**之前的监听器问题**：
- 只检查了顶层的 `type` 字段
- 没有解析 MyHostex 的嵌套消息结构
- 没有处理 `customer_inquiry` 类型

---

## 🔧 解决方案

### 增强消息解析逻辑

**改进点**：

1. **支持嵌套消息结构**
   - 检查 `json.content.type` 而不仅仅是 `json.type`
   - 提取 `json.content.body.thread_id`

2. **支持多种消息类型**
   - `new_inquiry` - 新的房客咨询
   - `customer_inquiry` - 客服消息

3. **提取 Thread ID**
   - 从 `body.new_inquiry.thread_id` 提取
   - 或从 `body.thread_id` 提取
   - 或从其他可能的字段提取

4. **详细日志输出**
   - 记录原始消息内容
   - 记录解析后的 Thread ID
   - 记录消息类型

### 代码实现

```javascript
parseMessage(data) {
  // 检查是否包含 new_inquiry
  if (data.includes('new_inquiry')) {
    log('🔔 检测到新消息信号 (new_inquiry)');
    log('📝 原始消息内容:', data);

    // 解析 JSON 并提取 thread_id
    try {
      const json = JSON.parse(data);
      let threadId = null;

      // MyHostex 的消息结构：{ content: { type: "new_inquiry", body: { ... } } }
      if (json.content && json.content.type === 'new_inquiry') {
        const body = json.content.body;
        threadId = body.new_inquiry?.thread_id || body.thread_id;
        log('🆔 新消息 Thread ID:', threadId);
      }

      // 其他可能的格式
      if (!threadId) {
        threadId = json.thread_id || json.id || json.threadId;
      }

      if (threadId) {
        log('✅ 新消息已确认，Thread ID:', threadId);
        setTimeout(() => Monitor.tick(), 500);
      } else {
        log('⚠️ 未找到 Thread ID，但仍触发检查');
        setTimeout(() => Monitor.tick(), 500);
      }
    } catch (e) {
      log('⚠️ JSON 解析失败，但仍触发检查:', e);
      setTimeout(() => Monitor.tick(), 500);
    }
  }

  // 尝试解析 JSON - 处理其他消息类型
  try {
    const json = JSON.parse(data);

    // 检查 MyHostex 的消息结构
    if (json.content) {
      const type = json.content.type;
      if (type === 'new_inquiry' || type === 'customer_inquiry') {
        log('🔔 MyHostex 消息类型:', type);
        setTimeout(() => Monitor.tick(), 500);
      }
    }

    // 检查直接的 type 字段
    if (json.type === 'new_inquiry' || json.type === 'customer_inquiry' || 
        json.event === 'new_inquiry' || json.action === 'new_inquiry') {
      log('🔔 JSON 格式的新消息信号:', json);
      setTimeout(() => Monitor.tick(), 500);
    }
  } catch (e) {
    // 不是 JSON，忽略
  }
}
```

---

## 📝 修改文件

### 1. content.js

**修改内容**：更新 `WebSocketMonitor.parseMessage()` 方法

**改进点**：
- 支持 MyHostex 的嵌套消息结构（`json.content.type`）
- 支持 `customer_inquiry` 消息类型
- 提取并记录 Thread ID
- 增强日志输出

### 2. manifest.json

**版本号更新**: 3.3.0 → 3.3.1  
**描述更新**: WebSocket 实时监听版本 → MyHostex 消息结构适配版本

---

## 🚀 工作流程

### MyHostex 新消息接收流程

```
1. MyHostex 服务器通过 WebSocket 发送消息
   消息结构：{ content: { type: "new_inquiry", body: {...} } }
   ↓
2. WebSocketMonitor 拦截消息
   ↓
3. 检查消息是否包含 "new_inquiry"
   ↓
4. 解析 JSON，提取 Thread ID
   ↓
5. 记录详细信息（Thread ID、消息类型）
   ↓
6. 触发 Monitor.tick()
   ↓
7. 检查对话列表和未读消息
   ↓
8. 自动展开助手面板
   ↓
9. 生成 AI 建议回复
   ↓
10. 显示桌面通知
```

---

## ✅ 预期日志输出

### 启动时

```
[MyHostex助手] 初始化 v3 (配置持久化版)...
[MyHostex助手] 🔌 WebSocket 监听器已启动
```

### 收到新消息时

```
[MyHostex助手] 🔔 检测到新消息信号 (new_inquiry)
[MyHostex助手] 📝 原始消息内容: {"content":{"type":"new_inquiry","body":{...}}}
[MyHostex助手] 🆔 新消息 Thread ID: thread_123
[MyHostex助手] ✅ 新消息已确认，Thread ID: thread_123
[MyHostex助手] 🚀 触发消息检查
[MyHostex助手] 📋 当前对话数: X
[MyHostex助手] 🔔 检测到新消息: thread_123
[MyHostex助手] 📩 获取到的消息数: 3
[MyHostex助手] 📨 检测到新消息，准备生成建议，消息数量: 3
```

### 收到客服消息时

```
[MyHostex助手] 🔔 检测到新消息信号 (customer_inquiry)
[MyHostex助手] 📝 原始消息内容: {"content":{"type":"customer_inquiry",...}}
[MyHostex助手] 🔔 MyHostex 消息类型: customer_inquiry
```

---

## 🔍 MyHostex 消息类型分析

根据 `websocket.ts` 代码，MyHostex 支持以下消息类型：

### 新消息相关

- **`new_inquiry`** - 新的房客咨询消息
  - 触发条件：客人发送新消息
  - 包含信息：`thread_id`、`thread_unread_num`、`new_inquiry` 对象
  - 处理方法：`handlerNewInquiry()`

- **`customer_inquiry`** - 客服消息
  - 触发条件：客服系统消息
  - 包含信息：`thread_id`、消息内容
  - 处理方法：显示通知

### 其他消息类型

- `clean_unread` - 清除未读消息
- `push_thirdparty_calendar` - 推送日历到第三方
- `update_price_result` - 更新价格结果
- `housing_status_notice` - 房源状态通知
- `v2_syncer_process` - 同步进行中
- `v2_7_syncer_finish` - 同步完成
- 等等...

**插件当前只关注**：`new_inquiry` 和 `customer_inquiry`

---

## 🧪 测试方法

### 方法 1：等待真实的新消息（推荐）

1. **启动插件**
   - 在 `chrome://extensions/` 中重新加载插件
   - 刷新 MyHostex 网站

2. **打开控制台**
   - 按 F12 打开开发者工具
   - 切换到 Console 标签

3. **等待新消息**
   - 等待客人发送新消息
   - 观察控制台日志

4. **预期日志**
   ```
   [MyHostex助手] 🔔 检测到新消息信号 (new_inquiry)
   [MyHostex助手] 📝 原始消息内容: {...}
   [MyHostex助手] 🆔 新消息 Thread ID: xxx
   [MyHostex助手] ✅ 新消息已确认，Thread ID: xxx
   [MyHostex助手] 🚀 触发消息检查
   ```

### 方法 2：手动触发测试

在控制台运行以下代码，模拟 MyHostex 的消息格式：

```javascript
// 模拟 MyHostex 的新消息
const testMessage = JSON.stringify({
  content: {
    type: "new_inquiry",
    body: {
      new_inquiry: {
        id: 1,
        message: "你好，请问房间还有吗？",
        thread_id: "test_thread_123"
      },
      thread_id: "test_thread_123",
      thread_unread_num: 1
    }
  }
});

// 创建一个测试 WebSocket（仅用于触发监听器）
const testWs = new WebSocket('wss://echo.websocket.org');

testWs.addEventListener('open', () => {
  console.log('✅ 测试 WebSocket 已连接');
  
  // 发送模拟消息
  testWs.send(testMessage);
  console.log('✅ 已发送测试消息:', testMessage);
});

testWs.addEventListener('message', (event) => {
  console.log('📨 收到响应:', event.data);
});
```

---

## ⚠️ 故障排查

### 问题 1：仍然检测不到新消息

**可能原因**：
1. WebSocket 监听器未启动
2. 消息格式与预期不符
3. 消息被其他代码拦截

**解决方法**：
1. 检查是否看到 "🔌 WebSocket 监听器已启动" 日志
2. 查看完整的原始消息内容
3. 在控制台运行以下代码，查看实际的 WebSocket 消息：

```javascript
// 监听所有 WebSocket 消息
const OriginalWebSocket = window.WebSocket;

window.WebSocket = function(...args) {
  const ws = new OriginalWebSocket(...args);

  ws.addEventListener('message', (event) => {
    console.log('📨 WebSocket 消息:', event.data);
    
    try {
      const json = JSON.parse(event.data);
      console.log('📋 解析后的 JSON:', json);
      
      if (json.content) {
        console.log('📝 content.type:', json.content.type);
        if (json.content.body) {
          console.log('📝 body:', json.content.body);
        }
      }
    } catch (e) {
      console.log('⚠️ 不是 JSON 格式');
    }
  });

  return ws;
};
```

### 问题 2：检测到消息但没有自动展开

**可能原因**：
1. `Monitor.tick()` 执行失败
2. DOM 轮询失败
3. API 配置错误

**解决方法**：
1. 查看是否有错误日志
2. 检查 `MessageReader.getConversationList()` 是否返回数据
3. 确认 API 配置正确

### 问题 3：Thread ID 为空

**可能原因**：
消息结构中的字段名称与预期不符

**解决方法**：
1. 查看完整的原始消息内容
2. 根据实际的消息结构调整代码
3. 提供完整的消息日志给开发者

---

## 📊 性能对比

### v3.3.0 之前

- ❌ 只检查顶层的 `type` 字段
- ❌ 不支持 MyHostex 的嵌套消息结构
- ❌ 无法提取 Thread ID
- ❌ 不支持 `customer_inquiry` 类型

### v3.3.1

- ✅ 支持嵌套消息结构（`json.content.type`）
- ✅ 提取 Thread ID
- ✅ 支持 `new_inquiry` 和 `customer_inquiry` 类型
- ✅ 详细的日志输出
- ✅ 更健壮的错误处理

---

## 🎉 预期效果

### 修复前（v3.3.0）

- ❌ 无法检测到新消息
- ❌ 控制台可能显示 "检测到新消息信号" 但没有后续操作
- ❌ 无法提取 Thread ID

### 修复后（v3.3.1）

- ✅ 正确检测到 `new_inquiry` 消息
- ✅ 提取并记录 Thread ID
- ✅ 自动展开助手面板
- ✅ 自动生成建议回复
- ✅ 显示桌面通知
- ✅ 支持客服消息（`customer_inquiry`）

---

## 📚 相关文档

- **UPDATE-v3.3.0-WEBSOCKET.md** - WebSocket 实时监听实现
- **WEBSOCKET-TEST.md** - WebSocket 测试指南
- **UPDATE-v3.2.1-CONFIG_FIX.md** - 配置持久化修复

---

## 🔮 后续优化方向

1. **支持更多消息类型**
   - `housing_status_notice` - 房源状态通知
   - `clean_unread` - 清除未读消息
   - 根据需要添加更多类型

2. **智能过滤**
   - 只监听特定类型的消息
   - 避免触发不必要的检查

3. **性能优化**
   - 减少 setTimeout 延迟
   - 优化消息解析逻辑

4. **调试增强**
   - 添加消息统计
   - 提供调试面板

---

## ❓ 常见问题

### Q1: 为什么需要解析 Thread ID？

**A**: Thread ID 用于唯一标识对话，帮助插件：
- 避免重复处理同一条消息
- 跟踪对话状态
- 更精准的消息管理

### Q2: 为什么同时支持 `new_inquiry` 和 `customer_inquiry`？

**A**: 这两种消息都代表新消息：
- `new_inquiry`: 客人发送的新咨询
- `customer_inquiry`: 客服系统消息
- 两者都可能需要用户关注和回复

### Q3: 如果消息格式改变了怎么办？

**A**: 代码已经支持多种消息格式，包括：
- 嵌套结构：`json.content.type`
- 直接结构：`json.type`
- 多种字段名：`thread_id`、`id`、`threadId`

如果格式发生重大变化，可以：
1. 查看完整的原始消息日志
2. 根据实际结构调整解析逻辑
3. 提供日志给开发者进行更新

---

**版本**: 3.3.1  
**更新日期**: 2026-04-05  
**作者**: WorkBuddy Agent
