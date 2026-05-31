# MyHostex 助手 v3.3.2 - WebSocket 拦截修复

**发布日期**: 2026-04-05

## 🐛 问题描述

用户反馈：插件仍然无法监听到新的用户消息。

**关键线索**：
- 控制台显示 `websocket.service.ts:150 new_inquiry`（MyHostex 自身的日志）
- 但我们的插件**没有**任何 `🔔 检测到新消息信号` 的输出
- 说明 WebSocket 监听器**完全没有拦截到消息**

## 🔍 根本原因分析

### 1. WebSocket 拦截逻辑缺陷

**v3.3.1 的问题**：
```javascript
// ❌ 错误的实现
init() {
  const OriginalWebSocket = window.WebSocket;

  window.WebSocket = function(...args) {
    const ws = new OriginalWebSocket(...args);

    // 问题：使用 this.handleMessage，但 this 指向错误
    ws.addEventListener('message', (event) => {
      this.handleMessage(event);  // ❌ this 可能不指向 WebSocketMonitor
      if (originalOnMessage) {
        originalOnMessage.call(ws, event);
      }
    });

    return ws;
  };
}
```

### 2. WebSocket 原型链缺失

**问题**：
- 重写了 `window.WebSocket` 构造函数
- 但**没有复制原型属性**（`CONNECTING`, `OPEN`, `CLOSING`, `CLOSED`）
- 导致部分代码检查 WebSocket 状态时失败

### 3. 缺少调试日志

**问题**：
- 不知道 WebSocket 连接是否被成功拦截
- 不知道消息是否被接收到
- 无法定位问题所在

## ✅ v3.3.2 修复方案

### 1. 修复 WebSocket 拦截逻辑

**核心改进**：
```javascript
init() {
  if (this.hasInitialized) {
    log('⚠️ WebSocket 监听器已初始化，跳过重复初始化');
    return;
  }

  // 保存原始 WebSocket 构造函数
  this.originalWebSocket = window.WebSocket;

  // 重写 WebSocket 构造函数
  window.WebSocket = function(...args) {
    const ws = new WebSocketMonitor.originalWebSocket(...args);

    console.log('[MyHostex助手] 🔗 新的 WebSocket 连接建立:', args[0]);

    // ✅ 使用 WebSocketMonitor 直接调用，避免 this 指向问题
    ws.addEventListener('message', (event) => {
      WebSocketMonitor.handleMessage(event, args[0]);
    });

    // 拦截发送（用于调试）
    const originalSend = ws.send.bind(ws);
    ws.send = function(data) {
      console.log('[MyHostex助手] 📤 WebSocket 发送:', typeof data === 'string' ? data.slice(0, 200) : '[Binary]');
      return originalSend(data);
    };

    return ws;
  };

  // ✅ 复制原型属性
  window.WebSocket.prototype = this.originalWebSocket.prototype;
  window.WebSocket.CONNECTING = this.originalWebSocket.CONNECTING;
  window.WebSocket.OPEN = this.originalWebSocket.OPEN;
  window.WebSocket.CLOSING = this.originalWebSocket.CLOSING;
  window.WebSocket.CLOSED = this.originalWebSocket.CLOSED;

  this.hasInitialized = true;
  log('🔌 WebSocket 监听器已启动 (拦截模式)');
}
```

**关键改进点**：
1. ✅ 使用 `WebSocketMonitor.handleMessage` 而不是 `this.handleMessage`
2. ✅ 添加 `hasInitialized` 标志，避免重复初始化
3. ✅ 完整复制 WebSocket 原型链和状态常量
4. ✅ 添加 WebSocket 连接建立日志

### 2. 增强调试日志

**所有消息都会输出**：
```javascript
handleMessage(event, url) {
  try {
    const data = typeof event.data === 'string'
      ? event.data
      : (event.data instanceof Blob
          ? event.data.text()
          : String(event.data));

    // ✅ 打印所有收到的消息
    console.log('[MyHostex助手] 📥 WebSocket 消息接收:', typeof data === 'string' ? data.slice(0, 300) : '[Binary]');

    // 异步处理 Blob 数据
    if (event.data instanceof Blob) {
      event.data.text().then(text => {
        this.parseMessage(text, url);
      });
    } else {
      this.parseMessage(data, url);
    }
  } catch (e) {
    log('⚠️ WebSocket 消息解析失败:', e);
  }
}
```

**日志类型**：
- `🔗 新的 WebSocket 连接建立` - WebSocket 连接建立
- `📤 WebSocket 发送` - 发送的消息
- `📥 WebSocket 消息接收` - 接收的消息（所有消息）
- `🔔 检测到新消息信号` - 检测到 new_inquiry
- `✅ 新消息已确认` - 确认新消息并触发检查

### 3. 改进 parseMessage 方法

```javascript
parseMessage(data, url) {
  // ✅ 检查两种消息类型
  if (data.includes('new_inquiry') || data.includes('customer_inquiry')) {
    log('🔔 检测到新消息信号 (new_inquiry/customer_inquiry)');
    log('📝 原始消息内容:', data.slice(0, 500));

    try {
      const json = JSON.parse(data);
      let threadId = null;

      // ✅ 处理 new_inquiry
      if (json.content && json.content.type === 'new_inquiry') {
        const body = json.content.body;
        threadId = body.new_inquiry?.thread_id || body.thread_id;
        log('🆔 新消息 Thread ID:', threadId);
      }

      // ✅ 处理 customer_inquiry
      if (json.content && json.content.type === 'customer_inquiry') {
        const body = json.content.body;
        threadId = body.customer_inquiry?.thread_id || body.thread_id;
        log('🆔 新消息 Thread ID (customer):', threadId);
      }

      // ✅ 触发消息检查
      setTimeout(() => {
        log('🚀 触发消息检查');
        Monitor.tick();
      }, 500);
    } catch (e) {
      log('⚠️ JSON 解析失败，但仍触发检查:', e);
      setTimeout(() => {
        log('🚀 触发消息检查');
        Monitor.tick();
      }, 500);
    }
  }
}
```

## 📋 测试步骤

### 1. 清除插件缓存

1. 打开 Chrome 扩展页面：`chrome://extensions/`
2. 找到 "MyHostex 智能回复助手"
3. 点击"重新加载"按钮

### 2. 测试 WebSocket 拦截

1. 刷新 MyHostex 页面
2. 打开控制台（F12）
3. 查看日志输出

**预期日志**：
```
[MyHostex助手] 初始化 v3 (配置持久化版)...
[MyHostex助手] 🔌 WebSocket 监听器已启动 (拦截模式)
[MyHostex助手] 🔗 新的 WebSocket 连接建立: wss://...
```

### 3. 测试新消息监听

1. 让客户发送一条新消息
2. 查看控制台日志

**预期日志**：
```
[MyHostex助手] 📥 WebSocket 消息接收: {"content":{"type":"new_inquiry",...}}
[MyHostex助手] 🔔 检测到新消息信号 (new_inquiry/customer_inquiry)
[MyHostex助手] 🆔 新消息 Thread ID: xxx
[MyHostex助手] ✅ 新消息已确认，Thread ID: xxx
[MyHostex助手] 🚀 触发消息检查
```

### 4. 调试问题

如果仍然无法监听，检查以下日志：

**问题 1：没有 "WebSocket 连接建立" 日志**
- 说明 WebSocket 重写失败
- 可能原因：MyHostex 在插件加载前已建立连接
- 解决：刷新页面（确保插件先加载）

**问题 2：有 "连接建立" 但没有 "消息接收"**
- 说明连接成功但没有消息
- 检查网络标签，确认 WebSocket 是否有数据传输

**问题 3：有 "消息接收" 但没有 "检测到新消息信号"**
- 说明拦截成功但消息格式不匹配
- 查看完整的消息内容，调整 parseMessage 逻辑

## 🎯 关键改进总结

| 改进项 | v3.3.1 | v3.3.2 |
|--------|--------|--------|
| WebSocket 拦截 | ❌ this 指向错误 | ✅ 使用静态引用 |
| 原型链复制 | ❌ 缺失 | ✅ 完整复制 |
| 重复初始化 | ❌ 无保护 | ✅ hasInitialized 标志 |
| 调试日志 | ❌ 不完整 | ✅ 完整日志链 |
| 消息类型 | ✅ 支持 2 种 | ✅ 支持 2 种 |
| 错误处理 | ✅ 基础处理 | ✅ 增强处理 |

## 📞 反馈渠道

如果问题仍然存在，请提供以下信息：

1. **完整控制台日志**（包含所有 `[MyHostex助手]` 开头的日志）
2. **WebSocket 连接 URL**（从 "新的 WebSocket 连接建立" 日志获取）
3. **接收到的消息内容**（从 "WebSocket 消息接收" 日志获取）
4. **MyHostex 页面 URL**（确认是否为正确的域名）

## 🔗 相关文档

- [v3.3.0 - WebSocket 实时监听](./UPDATE-v3.3.0-WEBSOCKET.md)
- [v3.3.1 - MyHostex 消息结构适配](./UPDATE-v3.3.1-MYHOSTEX-MESSAGE.md)
- [WebSocket 测试指南](./WEBSOCKET-TEST.md)
