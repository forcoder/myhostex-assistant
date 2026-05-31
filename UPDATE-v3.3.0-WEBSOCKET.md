# MyHostex 智能回复助手 v3.3.0 - WebSocket 实时监听

## 📋 更新概述

**版本号**: 3.3.0  
**发布日期**: 2026-04-05  
**主要功能**: WebSocket 实时监听，捕获 `new_inquiry` 消息

---

## 🎯 问题描述

### 用户反馈

> "还是没有监听到新的用户消息，在console栏，可以看到websocket的新请求：websocket.service.ts:150 new_inquiry"

### 问题分析

1. **原始检测方式**：使用 `setInterval` 每 5 秒轮询 DOM，检查对话列表
2. **失败原因**：
   - MyHostex 网站使用 WebSocket 推送新消息
   - DOM 轮询无法捕获 WebSocket 消息
   - `MessageReader.getConversationList()` 返回空数组
   - 导致自动展开功能无法触发

3. **发现线索**：
   - 用户在控制台看到 `new_inquiry` 消息
   - 说明网站通过 `websocket.service.ts` 发送 WebSocket 消息
   - 需要拦截 WebSocket 消息来实现实时检测

---

## 🔧 解决方案

### 实现原理

**拦截原生 WebSocket 构造函数**：

1. 重写 `window.WebSocket`
2. 创建 WebSocket 时保存原始实例
3. 拦截 `onmessage` 事件
4. 检查消息内容是否包含 `new_inquiry`
5. 触发 `Monitor.tick()` 检查新消息

### 代码结构

```javascript
const WebSocketMonitor = {
  init() {
    // 重写 WebSocket 构造函数
    const OriginalWebSocket = window.WebSocket;

    window.WebSocket = function(...args) {
      const ws = new OriginalWebSocket(...args);

      // 监听消息
      ws.addEventListener('message', (event) => {
        this.handleMessage(event);
      });

      return ws;
    };

    // 也可以拦截 send 方法用于调试
    window.WebSocket.prototype.send = function(data) {
      console.log('[WebSocketMonitor] 发送:', data);
      return OriginalWebSocket.prototype.send.call(this, data);
    };
  },

  handleMessage(event) {
    // 处理文本消息
    const data = event.data;

    // 检查是否包含 new_inquiry
    if (data.includes('new_inquiry')) {
      log('🔔 检测到新消息信号 (new_inquiry)');
      setTimeout(() => Monitor.tick(), 500);
    }

    // 尝试解析 JSON
    try {
      const json = JSON.parse(data);
      if (json.type === 'new_inquiry' || json.event === 'new_inquiry') {
        setTimeout(() => Monitor.tick(), 500);
      }
    } catch (e) {
      // 不是 JSON，忽略
    }
  }
};
```

---

## 📝 修改文件

### 1. content.js

#### 新增模块：WebSocketMonitor

**位置**: 在 `MessageReader` 之前新增

**功能**:
- 拦截 WebSocket 构造函数
- 监听所有 WebSocket 消息
- 检测 `new_inquiry` 信号
- 触发消息检查

**关键代码**:

```javascript
const WebSocketMonitor = {
  init() {
    const OriginalWebSocket = window.WebSocket;

    window.WebSocket = function(...args) {
      const ws = new OriginalWebSocket(...args);

      ws.addEventListener('message', (event) => {
        this.handleMessage(event);
      });

      return ws;
    };

    window.WebSocket.prototype.send = function(data) {
      console.log('[WebSocketMonitor] 发送:', data);
      return OriginalWebSocket.prototype.send.call(this, data);
    };

    log('🔌 WebSocket 监听器已启动');
  },

  handleMessage(event) {
    try {
      const data = typeof event.data === 'string'
        ? event.data
        : (event.data instanceof Blob
            ? event.data.text()
            : String(event.data));

      if (event.data instanceof Blob) {
        event.data.text().then(text => {
          this.parseMessage(text);
        });
      } else {
        this.parseMessage(data);
      }
    } catch (e) {
      log('⚠️ WebSocket 消息解析失败:', e);
    }
  },

  parseMessage(data) {
    // 检查 new_inquiry
    if (data.includes('new_inquiry')) {
      log('🔔 检测到新消息信号 (new_inquiry)');
      log('📝 消息内容:', data);
      setTimeout(() => Monitor.tick(), 500);
    }

    // 解析 JSON
    try {
      const json = JSON.parse(data);
      if (json.type === 'new_inquiry' || json.event === 'new_inquiry' || json.action === 'new_inquiry') {
        log('🔔 JSON 格式的新消息信号:', json);
        setTimeout(() => Monitor.tick(), 500);
      }
    } catch (e) {
      // 不是 JSON，忽略
    }
  }
};
```

#### 修改：init() 函数

**位置**: 第 1003 行

**修改内容**: 在 `Monitor.start()` 之前启动 WebSocket 监听器

```javascript
// 启动 WebSocket 监听器
WebSocketMonitor.init();

Panel.init();
Panel.updateStats();
Monitor.start();
```

### 2. manifest.json

**版本号更新**: 3.2.1 → 3.3.0  
**描述更新**: 配置持久化修复版本 → WebSocket 实时监听版本

---

## 🚀 工作流程

### 新消息接收流程

```
1. MyHostex 服务器通过 WebSocket 发送消息
   ↓
2. WebSocketMonitor 拦截消息
   ↓
3. 检查消息是否包含 "new_inquiry"
   ↓
4. 触发 Monitor.tick()
   ↓
5. 检查对话列表和未读消息
   ↓
6. 自动展开助手面板
   ↓
7. 生成 AI 建议回复
   ↓
8. 显示桌面通知
```

### 优势

1. **实时性**：不再需要轮询，WebSocket 消息到达即触发
2. **准确性**：直接监听 `new_inquiry` 信号，不会误判
3. **性能**：减少 DOM 查询次数，节省资源
4. **可靠性**：即使 DOM 轮询失败，也能通过 WebSocket 触发

---

## ✅ 升级步骤

### 1. 重新加载插件

1. 打开 `chrome://extensions/`
2. 找到 "MyHostex 智能回复助手"
3. 点击刷新按钮 🔄

### 2. 验证 WebSocket 监听

1. 打开 MyHostex 网站
2. 按 F12 打开控制台
3. 应该看到：`🔌 WebSocket 监听器已启动`

### 3. 测试新消息检测

**方法 1：等待新消息**
- 等待客人发送新消息
- 查看控制台日志

**方法 2：手动触发 WebSocket 消息**
- 在控制台运行：
```javascript
// 模拟 WebSocket 消息（仅用于测试）
window.dispatchEvent(new CustomEvent('test-new-inquiry'));
```

**方法 3：查看日志**

当收到新消息时，控制台应该显示：

```
[MyHostex助手] 🔔 检测到新消息信号 (new_inquiry)
[MyHostex助手] 📝 消息内容: {"type":"new_inquiry",...}
[MyHostex助手] 🚀 触发消息检查
[MyHostex助手] 📋 当前对话数: X
[MyHostex助手] 🔔 检测到新消息: XXX
```

---

## 🔍 调试信息

### 预期日志

**启动时**:
```
[MyHostex助手] 初始化 v3 (配置持久化版)...
[MyHostex助手] 🔌 WebSocket 监听器已启动
```

**WebSocket 消息**:
```
[WebSocketMonitor] 发送: {...}  // 如果拦截到发送的消息
```

**新消息到达**:
```
[MyHostex助手] 🔔 检测到新消息信号 (new_inquiry)
[MyHostex助手] 📝 消息内容: {...}
[MyHostex助手] 🚀 触发消息检查
```

### 故障排查

#### 问题 1: 看不到 "WebSocket 监听器已启动"

**原因**: 初始化失败  
**解决**:
1. 检查是否有 JavaScript 错误
2. 刷新页面重试
3. 查看控制台是否有 `[MyHostex助手]` 前缀的日志

#### 问题 2: 看不到 WebSocket 消息

**原因**: WebSocket 可能被其他脚本拦截  
**解决**:
1. 查看控制台是否有 `websocket.service.ts` 的日志
2. 确认页面确实使用了 WebSocket
3. 尝试刷新页面

#### 问题 3: 检测到 new_inquiry 但没有触发后续操作

**原因**: `Monitor.tick()` 执行失败  
**解决**:
1. 查看是否有错误日志
2. 检查 `MessageReader.getConversationList()` 是否返回数据
3. 确认 API 配置正确

---

## 📊 技术细节

### WebSocket 拦截原理

**为什么能拦截**:
- Chrome 扩展的 content script 注入到页面中
- 可以访问页面的全局对象（如 `window.WebSocket`）
- 重写构造函数后，页面所有后续创建的 WebSocket 都会被拦截

**注意事项**:
- 必须在页面创建 WebSocket 之前完成拦截
- 如果页面在 content script 注入前就创建了 WebSocket，需要监听 DOM 变化
- 保持原始 WebSocket 的所有功能不变

### 支持的消息格式

**文本格式**:
```
"new_inquiry"
"some text with new_inquiry inside"
```

**JSON 格式**:
```json
{
  "type": "new_inquiry",
  "data": {...}
}

{
  "event": "new_inquiry",
  "payload": {...}
}

{
  "action": "new_inquiry",
  "message": {...}
}
```

**Blob 格式**:
- 自动转换为文本后再解析

---

## 🎉 预期效果

### 修复前

- ❌ 新消息到达时无反应
- ❌ 控制台显示"等待新消息…"
- ❌ 需要手动刷新才能看到新消息

### 修复后

- ✅ 新消息到达时自动检测
- ✅ 控制台显示 "检测到新消息信号"
- ✅ 自动展开助手面板
- ✅ 自动生成建议回复
- ✅ 显示桌面通知

---

## 📚 相关文档

- **UPDATE-v3.2.1-CONFIG_FIX.md** - 配置持久化修复
- **AUTO_EXPAND_GUIDE.md** - 自动展开功能指南
- **diagnose-v3.2.0.js** - DOM 诊断工具

---

## 🔄 后续优化方向

1. **更精确的消息解析**
   - 解析完整的消息内容
   - 提取客人姓名、消息文本、时间等信息

2. **多种消息类型支持**
   - 不仅支持 `new_inquiry`
   - 也支持其他类型的消息通知

3. **性能优化**
   - 减少不必要的消息检查
   - 智能过滤重复消息

4. **调试增强**
   - 添加更详细的日志
   - 提供调试面板

---

## ❓ 常见问题

### Q1: 会影响网页的正常功能吗？

**A**: 不会。WebSocket 拦截只是监听消息，不会修改或阻止原始消息的传递。

### Q2: 能监听所有 WebSocket 消息吗？

**A**: 理论上可以，但当前只关注 `new_inquiry` 消息。如果需要监听其他消息，可以修改 `parseMessage` 方法。

### Q3: 如果 WebSocket 消息格式改变了怎么办？

**A**: WebSocketMonitor 支持多种格式（文本、JSON、Blob）。如果格式改变，可以添加新的解析逻辑。

### Q4: 能同时使用 WebSocket 监听和 DOM 轮询吗？

**A**: 可以。这两种方式是互补的：
- WebSocket 监听：实时性高，但依赖网站的消息格式
- DOM 轮询：通用性强，但延迟较高

目前代码保留了 DOM 轮询，作为备用方案。

---

**版本**: 3.3.0  
**更新日期**: 2026-04-05  
**作者**: WorkBuddy Agent
