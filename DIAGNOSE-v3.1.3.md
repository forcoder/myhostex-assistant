# MyHostex 智能回复助手 v3.1.3 - 诊断指南

## 🔍 问题诊断

根据截图和控制台日志，插件已经成功初始化并加载配置，但没有检测到新消息。这可能是以下原因之一：

### 可能的原因

1. **DOM 结构不匹配**：MyHostex 网站的 DOM 结构与预期不同
2. **未读消息检测失败**：网站使用不同的方式标记未读消息
3. **消息 ID 冲突**：消息 ID 已经被记录在 `knownIds` 中
4. **消息列表为空**：`MessageReader.getConversationList()` 没有找到任何对话

## 🛠️ 诊断步骤

### 步骤 1：运行 DOM 诊断脚本

1. 在 MyHostex 网站页面打开控制台（F12）
2. 打开 `diagnose-dom.js` 文件（在插件目录下）
3. 复制脚本内容，粘贴到控制台，按回车执行
4. 将所有输出复制并发送给开发者

**或者直接复制以下脚本到控制台：**

```javascript
// 快速诊断：检查是否有对话元素
console.log("=== 快速诊断 ===");
const allDivs = document.querySelectorAll('div');
let conversationCount = 0;
allDivs.forEach(div => {
  const className = div.className || '';
  if (className.includes('conversation') || 
      className.includes('message') ||
      className.includes('chat')) {
    conversationCount++;
  }
});
console.log("✅ 找到", conversationCount, "个可能的对话/消息元素");

// 检查未读标记
const unreadElements = document.querySelectorAll('[class*="unread"]');
console.log("✅ 找到", unreadElements.length, "个包含 'unread' 的元素");
unreadElements.forEach((el, i) => {
  if (i < 5) {
    console.log("  未读元素:", el.className);
  }
});

// 检查当前 URL
console.log("当前页面:", window.location.href);
```

### 步骤 2：检查新日志输出

重新加载插件后，控制台应该显示：

```
📋 当前对话数: X 未读数: Y
📋 所有对话ID: [...]
📋 未读对话: [...]
📋 已知ID: [...]
```

**如果没有看到这些日志**，说明 `getConversationList()` 没有找到任何对话元素。

**如果看到对话数 > 0 但未读数 = 0**，说明网站没有用 `unread` 类名标记未读消息。

### 步骤 3：手动触发建议生成

即使自动检测失败，你也可以手动生成建议：

```javascript
// 方法 1：使用模拟消息
Panel.requestSuggestions([
  {text: "你好，请问房间还有吗？", isOutgoing: false}
], true);

// 方法 2：清除已知 ID，强制重新检测
Monitor.knownIds.clear();
Monitor.tick();

// 方法 3：手动设置当前消息并生成
state.currentMessages = [
  {text: "你好，请问房间还有吗？", isOutgoing: false}
];
Panel.requestSuggestions(state.currentMessages, true);
```

### 步骤 4：检查网站状态

确认以下几点：

1. **页面是否正确**：你在 MyHostex 的消息/对话页面吗？
   - URL 应该包含 `/messages` 或 `/inbox` 或类似路径
   
2. **是否有新消息**：页面上确实有未读的消息吗？
   - 查看网站本身是否有未读标记（红点、粗体文字等）

3. **是否需要登录**：如果你刚登录，页面可能需要加载时间

## 📊 调试日志分析

### 情况 1：完全没有日志输出

**原因**：`Monitor.tick()` 没有执行或立即出错

**解决方案**：
```javascript
// 手动触发一次 tick
Monitor.tick();
```

### 情况 2：看到日志但对话数 = 0

**原因**：DOM 选择器找不到元素

**解决方案**：运行 `diagnose-dom.js` 脚本，找到正确的选择器

### 情况 3：对话数 > 0 但未读数 = 0

**原因**：未读检测逻辑不匹配网站

**解决方案**：
```javascript
// 检查实际使用的未读标记
const items = document.querySelectorAll('[class*="conversation"], li');
items.forEach(el => {
  console.log("元素类名:", el.className);
  console.log("  包含 unread:", el.className.includes('unread'));
});
```

### 情况 4：有未读但新对话数 = 0

**原因**：所有对话都在 `knownIds` 中

**解决方案**：
```javascript
// 清除已知的 ID
Monitor.knownIds.clear();
```

## 🎯 临时解决方案

如果自动检测一直不工作，可以使用以下方法：

### 方法 1：使用"生成建议"按钮

1. 点击一个有消息的对话
2. 手动点击面板中的"生成建议"按钮
3. 查看生成的建议

### 方法 2：手动设置消息

```javascript
// 设置当前消息
state.currentMessages = [
  {text: "客人说的话", isOutgoing: false}
];

// 生成建议
Panel.requestSuggestions(state.currentMessages, true);
```

### 方法 3：检查配置

```javascript
// 检查 API Key 是否正确配置
chrome.storage.local.get('mha_config', (res) => {
  console.log("配置:", res.mha_config);
  console.log("有 API Key:", !!res.mha_config?.apiKey);
});
```

## 📝 反馈信息

如果问题仍然存在，请提供以下信息：

1. **控制台完整日志**（从初始化开始的全部输出）
2. **诊断脚本输出**（运行 `diagnose-dom.js` 的结果）
3. **当前页面 URL**
4. **网站是否有未读消息的截图**
5. **浏览器版本**：Chrome 版本号

## 🔧 开发者操作

如果你是开发者，可以：

1. 修改 `MessageReader.getConversationList()` 中的选择器
2. 更新 `hasUnread` 检测逻辑
3. 添加更多调试日志

---

**版本**: 3.1.3  
**更新时间**: 2026-04-05  
**主要更新**: 增强诊断能力，添加 DOM 结构检查脚本
