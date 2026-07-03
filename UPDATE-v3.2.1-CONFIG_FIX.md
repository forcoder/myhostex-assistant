# MyHostex 智能回复助手 v3.2.1 - 配置持久化修复

## 更新时间
2026-04-05

## 问题现象

用户反馈：刷新 Chrome 插件后，AI 相关的配置丢失了。

## 根本原因

插件存在**两套配置系统**，导致保存和读取的配置键不一致：

1. **popup.js** - 配置界面保存配置时使用 `aiConfig` 键
2. **content.js** - ConfigManager 读取配置时使用 `mha_config` 键

**问题流程**：
1. 用户在配置界面（popup）保存 API Key → 保存到 `aiConfig`
2. 刷新插件 → content.js 初始化
3. content.js 的 ConfigManager 读取 `mha_config` → 找不到配置
4. 结果：配置丢失，回到默认状态

## 解决方案

**统一配置存储策略**：

1. **保存时**：popup.js 同时保存到 `aiConfig` 和 `mha_config`
2. **读取时**：popup.js 和 content.js 都从两个地方读取并合并
3. **优先级**：`mha_config` > `aiConfig` > 默认配置

## 修改文件

### 1. popup.js

**修改 1 - 保存 AI 配置时同时保存两份**（第 124-145 行）：

```javascript
document.getElementById("btn-save-ai").addEventListener("click", async () => {
  const provider = providerSel.value;
  const baseUrl  = document.getElementById("ai-base-url").value.trim();
  const apiKey   = document.getElementById("ai-api-key").value.trim();
  const model    = document.getElementById("ai-model").value.trim();
  const maxSugg  = parseInt(document.getElementById("ai-max-suggestions").value, 10);
  const lang     = document.getElementById("ai-lang").value;

  if (!apiKey) { showStatus("status-msg", "❌ 请填写 API Key", "err"); return; }

  const aiConfig = { provider, baseUrl, apiKey, model, maxSuggestions: maxSugg, lang };

  // ✅ 修复：保存到两个地方，确保配置不丢失
  await chrome.storage.local.set({
    aiConfig, // 供 popup 使用
    mha_config: {
      apiKey,
      model,
      provider,
      baseUrl,
      temperature: 0.9,
      maxTokens: 200,
      maxSuggestions: maxSugg,
      lang
    } // 供 content.js 的 ConfigManager 使用
  });
  showStatus("status-msg", "✅ AI 配置已保存");
});
```

**修改 2 - 初始化时从两个地方读取**（第 874-891 行）：

```javascript
async function init() {
  const data = await chrome.storage.local.get([
    "aiConfig", "rooms", "propInfo", "replyRules", "userStyle", "settings", "knowledgeBase", "mha_config",
  ]);

  // ✅ 修复：AI 配置 - 优先从 aiConfig 读取，如果没有则从 mha_config 读取
  const ai = data.aiConfig || data.mha_config || {};
  if (ai.provider) {
    providerSel.value = ai.provider;
    providerSel.dispatchEvent(new Event("change"));
  }
  if (ai.baseUrl) document.getElementById("ai-base-url").value = ai.baseUrl;
  if (ai.apiKey)  document.getElementById("ai-api-key").value  = ai.apiKey;
  if (ai.model)   document.getElementById("ai-model").value    = ai.model;
  if (ai.maxSuggestions) document.getElementById("ai-max-suggestions").value = ai.maxSuggestions;
  if (ai.lang)    document.getElementById("ai-lang").value     = ai.lang;
  if (ai.apiKey)  setApiStatus("ok", "已配置");
  // ...
}
```

### 2. content.js

**修改 ConfigManager.load() 方法**（第 786-799 行）：

```javascript
async load() {
  try {
    // ✅ 修复：优先从 mha_config 读取，如果没有则从 aiConfig 读取
    const stored = await chromeGet(['mha_config', 'aiConfig']);
    const mhaConfig = stored.mha_config || {};
    const aiConfig = stored.aiConfig || {};

    // 合并配置，mha_config 优先
    if (mhaConfig.apiKey) {
      log('📦 已从 mha_config 加载配置');
      return { ...this.defaultConfig, ...mhaConfig };
    } else if (aiConfig.apiKey) {
      log('📦 已从 aiConfig 加载配置');
      return {
        ...this.defaultConfig,
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        temperature: aiConfig.temperature || this.defaultConfig.temperature,
        maxTokens: aiConfig.maxTokens || this.defaultConfig.maxTokens,
        maxSuggestions: aiConfig.maxSuggestions || this.defaultConfig.maxSuggestions,
      };
    }
  } catch (e) {
    log('⚠️ 加载配置失败:', e);
  }
  return { ...this.defaultConfig };
}
```

### 3. manifest.json

**更新版本号**：
```json
{
  "version": "3.2.1",
  "description": "接入大模型，结合房间信息（自动抓取）与回复规则，智能生成个性化回复建议，并学习房东回复风格 - v3.2.1 配置持久化修复版本"
}
```

## 配置存储结构

修复后，配置会同时保存到两个键：

### aiConfig 键（popup 专用）

```javascript
{
  "provider": "deepseek",
  "baseUrl": "",
  "apiKey": "sk-xxx",
  "model": "deepseek-chat",
  "maxSuggestions": 5,
  "lang": "auto"
}
```

### mha_config 键（content.js ConfigManager 专用）

```javascript
{
  "apiKey": "sk-xxx",
  "model": "deepseek-chat",
  "provider": "deepseek",
  "baseUrl": "",
  "temperature": 0.9,
  "maxTokens": 200,
  "maxSuggestions": 5,
  "lang": "auto",
  "systemPrompt": "你是一位经验丰富的民宿房东...",
  "aiHistory": [...],
  "userStyle": {...},
  "stats": {...},
  "version": "1.0"
}
```

## 升级步骤

1. **重新加载插件**
   - 打开 `chrome://extensions/`
   - 找到 "MyHostex 智能回复助手"
   - 点击刷新按钮 🔄

2. **重新配置（如果配置丢失）**
   - 点击插件图标
   - 进入"🤖 AI 配置"标签
   - 填写 API Key 和其他配置
   - 点击"保存 AI 配置"

3. **验证配置持久化**
   - 打开 MyHostex 网站
   - 按 F12 打开控制台
   - 查看日志：`📦 已从 mha_config 加载配置`
   - 刷新插件
   - 再次打开 MyHostex 网站
   - 查看日志：配置应该自动加载

## 验证方法

### 方法 1：查看控制台日志

打开 MyHostex 网站的控制台，应该看到：

```
初始化 v3 (配置持久化版)...
📦 已从 mha_config 加载配置
📦 已加载配置: {hasApiKey: true, model: "deepseek-chat", historyCount: 0, stats: {...}}
✅ AI 配置已从保存的配置中加载
```

### 方法 2：查看 chrome.storage

在控制台运行：

```javascript
chrome.storage.local.get(['mha_config', 'aiConfig'], (res) => {
  console.log('mha_config:', res.mha_config);
  console.log('aiConfig:', res.aiConfig);
});
```

应该看到两个配置对象，且都包含 `apiKey`。

### 方法 3：刷新测试

1. 配置 API Key
2. 刷新插件
3. 打开 MyHostex 网站
4. 点击助手面板的"🔄 刷新"按钮
5. 应该能看到 AI 生成的建议（不是本地回退建议）

## 回退方案

如果修复后仍有问题，可以：

```javascript
// 清除所有配置
chrome.storage.local.clear(() => {
  console.log('✅ 所有配置已清除');
});

// 重新配置
```

## 常见问题

### Q: 为什么刷新插件后配置还是丢失？

A: 可能的原因：
1. 插件没有正确重新加载
2. 修改后没有保存文件
3. 浏览器缓存问题

**解决方法**：
1. 确认文件已修改并保存
2. 在 `chrome://extensions/` 中完全移除插件
3. 重新加载插件
4. 重新配置

### Q: 为什么有两个配置键？

A: 历史原因。插件早期版本使用 `aiConfig`，后来引入 ConfigManager 后使用 `mha_config`。为了兼容性和数据安全，现在两个键都会保存和读取。

### Q: 可以只使用一个配置键吗？

A: 可以，但不推荐。使用两个键有以下好处：
1. **容错性**：如果一个键的数据损坏，另一个可能还正常
2. **兼容性**：支持旧版本的配置格式
3. **灵活性**：popup 和 content.js 可以有不同的配置需求

## 技术细节

### 配置优先级

```
mha_config (最高) > aiConfig > defaultConfig (最低)
```

### 数据流

**保存流程**：
```
用户点击保存 → popup.js
  ├→ 保存到 aiConfig (popup 使用)
  └→ 保存到 mha_config (content.js 使用)
```

**读取流程**：
```
popup.js 初始化 → 读取 aiConfig 或 mha_config
content.js 初始化 → ConfigManager.load() 读取 mha_config 或 aiConfig
```

## 相关文件

- `popup.js` - 配置界面和保存逻辑
- `content.js` - ConfigManager 配置管理
- `manifest.json` - v3.2.1

## 更新历史

### v3.2.1 (2026-04-05)
- ✅ 修复配置持久化问题
- ✅ 同时保存到 aiConfig 和 mha_config
- ✅ 支持从两个地方读取配置

### v3.2.0
- ✅ 智能消息获取功能
- ✅ 手动触发时自动获取页面消息

### v3.1.3
- ✅ 增强调试日志
- ✅ DOM 诊断工具

### v3.1.2
- ✅ 自然对话风格
- ✅ 优化 AI 参数

### v3.1.0
- ✅ 配置持久化功能（引入 ConfigManager）
