# MyHostex 智能回复助手 v3.2.0 - 自动展开功能说明

## 更新时间
2026-04-05

## 用户需求
> "如果收到新消息，请自动展开myHostex助手，并刷新建议回复。"

## 功能状态

### ✅ 已实现的功能

**自动展开和刷新建议回复**：当检测到新消息时，插件会自动：
1. 展开助手面板
2. 从页面获取最新消息
3. 调用 LLM 生成建议回复
4. 显示桌面通知

**代码位置**：`content.js` 的 `Monitor.tick()` 方法（第 691-700 行）

```javascript
// 自动展开
const res = await chromeGet(["settings"]);
if ((res.settings?.autoExpand !== false) && !state.panelExpanded) {
  Panel.expand();
}

// 生成 AI 建议
await Panel.requestSuggestions(effectiveMsgs);

// 桌面通知
this.notify(conv);
```

### ⚠️ 当前问题

**消息检测失败**：由于 `MessageReader.getConversationList()` 无法找到页面上的对话列表，导致无法触发自动展开功能。

**错误表现**：
- 控制台没有显示 `📋 当前对话数` 日志
- 插件始终显示"等待新消息…"
- 新消息来临时不会自动展开

## 新增文件

### 1. diagnose-v3.2.0.js - 增强版 DOM 诊断工具

**功能**：
- 检查对话列表/消息列表元素
- 检查消息气泡元素
- 检查输入框和发送按钮
- 提供实时 DOM 变化监控代码
- 生成诊断建议

**使用方法**：
1. 打开 MyHostex 网站
2. 按 F12 打开开发者工具
3. 复制脚本内容到 Console
4. 查看诊断输出

### 2. AUTO_EXPAND_GUIDE.md - 自动展开功能详细指南

**内容**：
- 当前功能状态说明
- 工作流程详解
- 问题原因分析
- 诊断步骤（3 个步骤）
- 解决方案（3 种方案）
- 配置选项说明

## 下一步行动

### 需要用户提供的信息

为了修复消息检测问题，请提供：

1. **诊断脚本输出**
   - 在 MyHostex 页面运行 `diagnose-v3.2.0.js`
   - 复制完整的控制台输出

2. **DOM 结构信息**
   - 右键点击消息列表项 → 检查元素
   - 截图或复制 HTML 结构
   - 关注：class 名称、data-* 属性、ID

3. **页面 URL**
   - 当前所在的 MyHostex 页面路径

### 预期修复流程

1. 用户运行诊断脚本
2. 提供诊断结果和 DOM 结构
3. 更新 `MessageReader` 中的 DOM 选择器
4. 测试自动展开功能
5. 验证建议回复生成

## 临时解决方案

如果自动检测暂时无法工作，可以：

1. **手动展开**：点击助手图标（💬）
2. **手动刷新**：点击面板中的"🔄 刷新"按钮

此功能已经可用，可以正常生成建议回复。

## 配置选项

### 启用/禁用自动展开

```javascript
// 启用自动展开（默认）
chrome.storage.local.set({ settings: { autoExpand: true } });

// 禁用自动展开
chrome.storage.local.set({ settings: { autoExpand: false } });
```

## 相关文件

- `content.js` - 主要功能实现
- `diagnose-v3.2.0.js` - DOM 诊断脚本（新增）
- `AUTO_EXPAND_GUIDE.md` - 详细使用指南（新增）
- `manifest.json` - v3.2.0

## 技术细节

### 消息检测机制

```javascript
const Monitor = {
  knownIds: new Set(),  // 记录已处理的对话 ID

  async tick() {
    // 1. 获取对话列表
    const convs = MessageReader.getConversationList();

    // 2. 筛选未读对话
    const unread = convs.filter((c) => c.hasUnread);

    // 3. 查找新对话
    const newConvs = unread.filter((c) => c.id && !this.knownIds.has(c.id));

    // 4. 触发自动展开和建议生成
    if (newConvs.length > 0) {
      // 自动展开
      Panel.expand();
      // 生成建议
      await Panel.requestSuggestions(messages);
    }
  }
};
```

### DOM 选择器策略

使用多级回退策略，尝试多个常见选择器：

```javascript
const selectors = [
  ".inbox-list .conversation-item",
  "[data-testid='conversation-item']",
  ".message-list-item",
  // ... 更多选择器
];
```

## 常见问题

**Q: 为什么不自动展开？**

A: 可能的原因：
1. 消息检测失败（最常见）
2. 自动展开功能被禁用
3. 对话 ID 为空
4. 面板已经展开

**Q: 如何确认消息检测是否工作？**

A: 打开控制台，查看是否有 `📋 当前对话数` 日志。如果有日志显示对话数为 0，说明检测失败。

**Q: 可以手动触发建议生成吗？**

A: 可以。点击助手图标展开面板，然后点击"🔄 刷新"按钮即可。

## 更新历史

### v3.2.0 (2026-04-05)
- ✅ 确认自动展开功能已实现
- ⚠️ 诊断消息检测失败问题
- 📝 创建增强版诊断脚本
- 📝 创建详细使用指南

### v3.1.3 (之前)
- 增加调试日志
- 智能消息获取功能

### v3.1.2
- 调整 AI 参数（temperature 0.9, maxTokens 200）
- 更新系统提示词为自然风格
- 更新本地回退模板

### v3.1.1
- 增加详细调试日志
- 诊断消息检测问题

### v3.1.0
- LLM 集成
- 用户风格学习
- 配置持久化

## 联系与支持

如需帮助，请提供：
1. 诊断脚本输出
2. DOM 结构截图
3. 控制台错误信息
