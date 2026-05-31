# MyHostex 智能回复助手 v3.1.1 - 调试指南

## 🐛 问题描述

**问题**：有新消息进来后，建议回复还是显示"等待新消息"，没有监听到新消息。

## 🔍 调试步骤

### 1. 重新加载插件

1. 打开 `chrome://extensions/`
2. 找到 "MyHostex 智能回复助手"
3. 点击刷新按钮 🔄

### 2. 打开控制台

1. 刷新 MyHostex 网站
2. 按 `F12` 打开开发者工具
3. 切换到 "Console" 标签页

### 3. 触发问题

1. 等待新消息进来，或者自己发送一条测试消息
2. 观察控制台输出

## 📋 日志说明

### 正常流程的日志

如果一切正常，你应该看到以下日志：

```
[MyHostex助手] 初始化 v3 (配置持久化版)...
📦 已加载配置: {hasApiKey: true, model: "deepseek-chat", historyCount: 45, stats: {...}}
✅ AI 配置已从保存的配置中加载
[MyHostex助手] 📨 检测到新消息，准备生成建议，消息数量: 3
[MyHostex助手] 📨 最新消息: {text: "你好，请问房间还有吗？", isOutgoing: false}
[MyHostex助手] 🔍 requestSuggestions 被调用, messages: 3 force: false
[MyHostex助手] 🚀 开始生成建议，消息数量: 3
[MyHostex助手] 📦 已加载配置，API Key: true
[MyHostex助手] 🤖 AI Config - apiKey: true model: "deepseek-chat"
[MyHostex助手] 🎨 开始调用 LLM 生成建议...
[MyHostex助手] ✅ LLM 生成成功，建议数量: 3
[MyHostex助手] 🎉 准备渲染建议，数量: 3
[MyHostex助手] 🎨 renderSuggestions 被调用，list.length: 3 fromAI: true
[MyHostex助手] ✅ 已渲染 3 条建议
[MyHostex助手] 📝 AI 历史记录已保存
[MyHostex助手] 💾 配置已保存
[MyHostex助手] ✅ 建议渲染完成
```

### 异常情况分析

#### 情况 1：没有看到"检测到新消息"日志

**可能原因**：
- 消息没有正确识别为"未读"
- 消息 ID 与 `knownIds` 冲突

**解决方案**：
```javascript
// 在控制台执行，清除已知的消息 ID
chrome.storage.local.get('mha_config', (res) => {
  console.log("当前配置:", res.mha_config);
});
```

#### 情况 2：看到"检测到新消息"但没有"requestSuggestions"日志

**可能原因**：
- `requestSuggestions` 函数被跳过（正在生成中）
- 消息为空

**解决方案**：
```javascript
// 手动触发建议生成
const messages = [{text: "测试消息", isOutgoing: false}];
Panel.requestSuggestions(messages, true);
```

#### 情况 3：看到"开始生成建议"但没有"LLM 生成成功"

**可能原因**：
- API Key 未设置或无效
- 网络问题
- API 调用失败

**解决方案**：
```javascript
// 检查 API Key
chrome.storage.local.get('aiConfig', (res) => {
  console.log("AI Config:", res.aiConfig);
});
```

#### 情况 4：看到"渲染建议"但建议列表还是"等待新消息"

**可能原因**：
- DOM 元素未正确找到
- `sugList` 引用错误

**解决方案**：
```javascript
// 检查 DOM 结构
console.log("建议列表元素:", Panel.sugList);
console.log("面板根元素:", Panel.root);
```

## 🔧 手动触发建议生成

如果自动生成失败，可以手动触发：

```javascript
// 方法 1：使用当前消息
const messages = MessageReader.getCurrentMessages();
Panel.requestSuggestions(messages, true);

// 方法 2：使用测试消息
Panel.requestSuggestions([
  {text: "你好，请问房间还有吗？", isOutgoing: false}
], true);
```

## 📊 检查状态变量

```javascript
// 查看当前状态
console.log("状态变量:", {
  isGenerating: state.isGenerating,
  panelExpanded: state.panelExpanded,
  currentMessages: state.currentMessages,
  currentConversation: state.currentConversation,
  suggestions: state.suggestions
});
```

## 🧪 测试场景

### 场景 1：新消息自动触发

1. 确保面板已收起
2. 发送或接收新消息
3. 观察是否自动展开并生成建议

### 场景 2：手动点击"生成建议"按钮

1. 切换到已有消息的对话
2. 点击面板中的"生成建议"按钮
3. 观察是否成功生成

### 场景 3：面板展开时的持续更新

1. 展开面板
2. 接收新消息
3. 观察是否自动更新预览和建议

## 💡 常见问题

### Q: 为什么总是显示"等待新消息"？

**A**: 初始状态就是"等待新消息"，只有当新消息进来时才会生成建议。如果一直显示这个，说明没有检测到新消息。

### Q: API Key 配置正确但还是不生成建议？

**A**: 检查控制台日志，看是否显示"LLM 生成成功"。如果没有，可能是：
- API Key 格式错误
- 网络问题
- API 服务不可用

### Q: 本地回退建议也不显示？

**A**: 检查 `FallbackEngine.getSuggestions()` 是否返回了建议列表。在控制台执行：

```javascript
const testMsgs = [{text: "测试消息", isOutgoing: false}];
const fallback = FallbackEngine.getSuggestions(testMsgs, 3);
console.log("本地回退建议:", fallback);
```

## 📝 反馈信息

如果问题仍然存在，请提供以下信息：

1. 控制台的完整日志输出
2. API Key 是否已配置
3. 网络连接是否正常
4. 是否有错误信息

---

**版本**: 3.1.1  
**更新内容**: 增加详细的调试日志，方便排查问题
