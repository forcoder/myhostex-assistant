# MyHostex 智能回复助手 v3.3.0 - WebSocket 监听测试

## 📋 测试目的

验证 WebSocket 监听器是否正常工作，能够捕获 `new_inquiry` 消息。

---

## 🔧 测试步骤

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
   [MyHostex助手] 初始化 v3 (配置持久化版)...
   [MyHostex助手] 🔌 WebSocket 监听器已启动
   [MyHostex助手] 🔔 检测到新消息信号 (new_inquiry)
   [MyHostex助手] 📝 消息内容: {"type":"new_inquiry",...}
   [MyHostex助手] 🚀 触发消息检查
   [MyHostex助手] 📋 当前对话数: X
   [MyHostex助手] 🔔 检测到新消息: XXX
   ```

---

### 方法 2：手动触发 WebSocket 消息

如果不想等待真实消息，可以使用以下代码模拟：

```javascript
// 在控制台运行以下代码，模拟 WebSocket 消息

// 1. 创建一个测试 WebSocket（仅用于触发监听器）
const testWs = new WebSocket('wss://echo.websocket.org');

// 2. 监听连接成功
testWs.addEventListener('open', () => {
  console.log('✅ 测试 WebSocket 已连接');
  
  // 3. 发送包含 "new_inquiry" 的消息
  testWs.send('{"type":"new_inquiry","data":"test"}');
  console.log('✅ 已发送测试消息');
});

// 4. 监听响应（可选）
testWs.addEventListener('message', (event) => {
  console.log('📨 收到响应:', event.data);
});
```

**预期结果**：
- 应该在控制台看到 `[MyHostex助手] 🔔 检测到新消息信号 (new_inquiry)`
- 如果自动展开功能正常，助手面板会自动展开
- 会自动生成建议回复

---

### 方法 3：检查 WebSocket 监听器状态

在控制台运行以下代码，检查 WebSocket 监听器是否正常工作：

```javascript
// 检查 WebSocket 是否被拦截
const OriginalWebSocket = window.WebSocket;

if (OriginalWebSocket.toString().includes('function WebSocket(')) {
  console.log('✅ WebSocket 构造函数已被重写');
} else {
  console.log('⚠️ WebSocket 构造函数未被重写');
}

// 检查是否有 WebSocket 连接
if (window.chrome && window.chrome.runtime) {
  console.log('✅ Chrome 扩展环境正常');
} else {
  console.log('⚠️ Chrome 扩展环境异常');
}
```

---

## 🔍 调试日志说明

### 正常启动日志

```
[MyHostex助手] 初始化 v3 (配置持久化版)...
[MyHostex助手] 🔌 WebSocket 监听器已启动
```

### WebSocket 消息拦截日志

```
[WebSocketMonitor] 发送: {...}  // 如果拦截到发送的消息
```

### 新消息检测日志

```
[MyHostex助手] 🔔 检测到新消息信号 (new_inquiry)
[MyHostex助手] 📝 消息内容: {...}
[MyHostex助手] 🚀 触发消息检查
```

### 消息检查日志

```
[MyHostex助手] 📋 当前对话数: 5
[MyHostex助手] 🔔 检测到新消息: conv_123
[MyHostex助手] 📩 获取到的消息数: 3
[MyHostex助手] 📨 检测到新消息，准备生成建议，消息数量: 3
```

---

## ⚠️ 故障排查

### 问题 1：看不到 "WebSocket 监听器已启动"

**可能原因**：
- 初始化失败
- JavaScript 错误
- 插件未正确加载

**解决方法**：
1. 刷新页面
2. 检查控制台是否有错误
3. 重新加载插件

---

### 问题 2：检测到 new_inquiry 但没有触发后续操作

**可能原因**：
- `Monitor.tick()` 执行失败
- DOM 轮询失败
- API 配置错误

**解决方法**：
1. 查看是否有错误日志
2. 检查 `MessageReader.getConversationList()` 是否返回数据
3. 确认 API 配置正确

---

### 问题 3：看到 WebSocket 消息但没有检测到 new_inquiry

**可能原因**：
- 消息格式与预期不符
- `new_inquiry` 关键字在 JSON 中被其他字符包围

**解决方法**：
1. 检查实际的消息内容
2. 修改 `parseMessage` 方法以适应新的消息格式
3. 提供完整的消息日志给开发者

---

## 📊 性能监控

### 查看 WebSocket 消息数量

```javascript
// 在控制台运行，统计 WebSocket 消息数量
let messageCount = 0;
const OriginalWebSocket = window.WebSocket;

// 临时计数器
const countMessages = (ws) => {
  const originalOnMessage = ws.addEventListener;
  ws.addEventListener('message', () => {
    messageCount++;
    console.log(`📊 WebSocket 消息数: ${messageCount}`);
  });
};

console.log('✅ WebSocket 消息计数器已启动');
```

---

## 🎯 成功标准

WebSocket 监听功能正常工作的标志：

1. ✅ **启动成功**：看到 "🔌 WebSocket 监听器已启动" 日志
2. ✅ **消息拦截**：收到 WebSocket 消息时能看到日志
3. ✅ **新消息检测**：能检测到 `new_inquiry` 消息
4. ✅ **自动展开**：助手面板自动展开
5. ✅ **建议生成**：自动生成 AI 建议回复
6. ✅ **桌面通知**：收到桌面通知

---

## 📝 反馈信息

如果测试失败，请提供以下信息：

1. **控制台日志**：完整的 `[MyHostex助手]` 开头的日志
2. **错误信息**：任何红色的错误信息
3. **WebSocket 消息**：实际的 WebSocket 消息内容
4. **页面状态**：当前在 MyHostex 的哪个页面

---

## 🚀 下一步

测试成功后：

1. 等待真实的客户消息
2. 观察自动展开和建议生成功能
3. 验证桌面通知是否正常
4. 检查建议回复的质量

---

**版本**: 3.3.0  
**更新日期**: 2026-04-05
