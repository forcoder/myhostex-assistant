# 自动展开 MyHostex 助手功能说明

## 当前状态

✅ **功能已实现**：收到新消息时自动展开助手并刷新建议回复的代码已经存在（`Monitor.tick()` 第 691-700 行）

❌ **检测失败**：由于 `MessageReader.getConversationList()` 无法检测到页面上的对话列表，导致无法触发自动展开

## 功能说明

### 自动展开逻辑（已实现）

```javascript
// 在 Monitor.tick() 中
if (newConvs.length > 0) {
  // ... 保存对话 ID ...

  // 自动展开
  const res = await chromeGet(["settings"]);
  if ((res.settings?.autoExpand !== false) && !state.panelExpanded) {
    Panel.expand();
  }

  // 生成 AI 建议
  await Panel.requestSuggestions(effectiveMsgs);

  // 桌面通知
  this.notify(conv);
}
```

### 工作流程

1. 每 5 秒检查一次新消息
2. 如果发现未读对话且不在已知 ID 列表中
3. **自动展开助手面板**
4. 从页面获取消息内容
5. 调用 LLM 生成建议回复
6. 显示桌面通知

## 当前问题

### 核心问题：消息检测失败

`MessageReader.getConversationList()` 返回空数组，无法检测到新消息。

### 可能的原因

1. **DOM 结构不匹配**：页面实际 DOM 结构与预期不符
2. **动态加载**：消息列表是异步加载的
3. **选择器过期**：MyHostex 网站更新了 DOM 结构
4. **Shadow DOM/iframe**：元素在隔离的 DOM 中

## 诊断步骤

### 步骤 1：运行诊断脚本

1. 打开 MyHostex 网站并登录
2. 按 `F12` 打开开发者工具
3. 切换到 Console（控制台）标签
4. 复制 `diagnose-v3.2.0.js` 的内容并粘贴到控制台
5. 查看诊断输出

### 步骤 2：手动检查 DOM

如果诊断脚本未找到元素，手动检查：

1. 在 MyHostex 网站上，右键点击消息列表项
2. 选择"检查元素"
3. 查看 HTML 结构，记录：
   - 消息列表容器的 class 名称
   - 消息列表项的 class 名称
   - 未读标识（badge、unread class 等）
   - 对话 ID 的位置（data-* 属性或 id 属性）

4. 右键点击消息气泡
5. 选择"检查元素"
6. 记录消息气泡的 class 名称和结构

### 步骤 3：实时监控 DOM 变化

在控制台运行：

```javascript
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.addedNodes.length > 0) {
      console.log("🆕 新增节点:", mutation.addedNodes);
    }
  });
});
observer.observe(document.body, { childList: true, subtree: true });
console.log("✅ DOM 观察者已启动，发送一条测试消息...");
```

## 解决方案

### 方案 1：更新 DOM 选择器（推荐）

根据诊断结果，更新 `content.js` 中的 `MessageReader.getConversationList()` 和 `MessageReader.getCurrentMessages()` 的选择器。

**示例**：

如果实际 DOM 结构是：
```html
<div class="MessageListContainer">
  <div class="MessageItem" data-conversation-id="123">
    <span class="MessageSender">张三</span>
    <span class="UnreadBadge">1</span>
  </div>
</div>
```

则更新选择器为：
```javascript
const MessageReader = {
  getConversationList() {
    const selectors = [
      ".MessageListContainer .MessageItem",  // 新增
      // ... 保留其他选择器
    ];
    // ...
  }
};
```

### 方案 2：使用 WebSocket 监听（高级）

MyHostex 可能使用 WebSocket 接收实时消息，可以监听 WebSocket 事件。

### 方案 3：手动触发（临时方案）

如果自动检测暂时无法修复，可以：

1. 点击助手图标手动展开
2. 点击"🔄 刷新"按钮获取建议

此方案已经可用。

## 配置选项

### 禁用自动展开

如果不需要自动展开功能，可以设置：

```javascript
chrome.storage.local.set({ settings: { autoExpand: false } });
```

### 启用自动展开（默认）

```javascript
chrome.storage.local.set({ settings: { autoExpand: true } });
```

## 需要您提供的信息

为了帮助解决检测问题，请提供：

1. **诊断脚本输出**：运行 `diagnose-v3.2.0.js` 的完整控制台输出
2. **DOM 结构截图**：
   - 消息列表的 HTML 结构
   - 消息气泡的 HTML 结构
   - 未读标识的 HTML 结构
3. **页面 URL**：当前所在的 MyHostex 页面路径（如 `/messages`、`/inbox` 等）

## 后续计划

一旦修复了消息检测问题：

✅ 收到新消息时自动展开助手
✅ 自动刷新建议回复
✅ 桌面通知提醒
✅ 智能学习用户回复风格

## 联系支持

如果需要帮助，请提供上述诊断信息，我将帮您修复 DOM 选择器。
