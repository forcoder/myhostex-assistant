# 配置 API Key 指南

## 🎯 为什么需要 API Key？

配置 API Key 后，插件可以使用 AI 模型生成更智能、更个性化的回复建议，而不是使用固定的本地模板。

## 📝 支持的 AI 服务

目前支持以下 AI 服务：

1. **DeepSeek**（推荐）
   - 性价比高
   - 中文支持好
   - API Key 获取地址：https://platform.deepseek.com/

2. **其他兼容 OpenAI 的服务**
   - 任何兼容 OpenAI API 格式的服务都可以

## 🔄 配置步骤

### 方法 1：通过控制台配置（快速）

1. 在 MyHostex 网站打开控制台（F12）
2. 粘贴以下代码，替换 `YOUR_API_KEY` 为你的实际 API Key：

```javascript
// 配置 DeepSeek API
chrome.storage.local.set({
  aiConfig: {
    apiKey: "YOUR_DEEPSEEK_API_KEY_HERE",
    model: "deepseek-chat",
    temperature: 0.9,
    maxTokens: 200,
    maxSuggestions: 5
  },
  mha_config: {
    apiKey: "YOUR_DEEPSEEK_API_KEY_HERE",
    model: "deepseek-chat",
    temperature: 0.9,
    maxTokens: 200
  }
}, () => {
  console.log("✅ API Key 已配置");
});
```

3. 刷新页面，重新测试

### 方法 2：通过配置文件配置（推荐用于长期使用）

1. 在控制台执行：

```javascript
// 检查当前配置
chrome.storage.local.get('mha_config', (res) => {
  console.log("当前配置:", res.mha_config);
});

// 配置 API Key
chrome.storage.local.set({
  mha_config: {
    ...res.mha_config,
    apiKey: "YOUR_DEEPSEEK_API_KEY_HERE",
    model: "deepseek-chat",
    temperature: 0.9,
    maxTokens: 200
  }
}, () => {
  console.log("✅ 配置已更新");
});
```

### 方法 3：通过插件界面配置（如果已实现）

等待插件更新，添加配置界面后，可以直接在界面中输入 API Key。

## 🔑 获取 API Key

### DeepSeek API Key

1. 访问：https://platform.deepseek.com/
2. 注册/登录账号
3. 进入"API Keys"页面
4. 点击"创建 API Key"
5. 复制生成的 API Key

**注意**：
- API Key 是敏感信息，请妥善保管
- 不要分享 API Key 给他人
- 建议设置 API Key 的使用限制

## 🧪 测试 API Key

配置完成后，在控制台测试：

```javascript
// 测试 API Key 是否配置成功
chrome.storage.local.get('mha_config', (res) => {
  console.log("API Key:", res.mha_config?.apiKey ? "✅ 已配置" : "❌ 未配置");
  console.log("模型:", res.mha_config?.model);
});

// 手动生成建议（带消息）
Panel.requestSuggestions([
  {text: "你好，请问房间还有吗？", isOutgoing: false}
], true);
```

如果看到日志中显示：
```
🤖 AI Config - apiKey: true model: "deepseek-chat"
🎨 开始调用 LLM 生成建议...
✅ LLM 生成成功，建议数量: 3
```

说明 API Key 配置成功！

## 💰 费用说明

### DeepSeek 定价（参考）

- **输入**: ¥1 / 1M tokens（约 70 万汉字）
- **输出**: ¥2 / 1M tokens（约 35 万汉字）

**估算**：
- 每次生成 3 条建议，约消耗 200-500 tokens
- 生成 1000 次，约消耗 200,000-500,000 tokens
- 费用约：¥0.2 - ¥0.5

**结论**：非常便宜，几乎可以忽略不计

## 🚫 如果没有 API Key怎么办？

没关系！插件内置了本地回退建议引擎，可以正常使用。

### 本地回退的特点

- ✅ 无需配置，开箱即用
- ✅ 支持常见场景（问候、询价、预订等）
- ✅ 响应速度快
- ❌ 建议比较固定，不够智能
- ❌ 不能根据具体上下文生成建议

### 如何手动传递消息？

即使没有 API Key，你也可以手动生成建议：

```javascript
// 生成针对"你好"的建议
Panel.requestSuggestions([
  {text: "你好", isOutgoing: false}
], true);

// 生成针对"房间还有吗"的建议
Panel.requestSuggestions([
  {text: "请问房间还有吗？", isOutgoing: false}
], true);

// 生成针对"多少钱"的建议
Panel.requestSuggestions([
  {text: "房租多少钱？", isOutgoing: false}
], true);
```

## 🔧 高级配置

### 调整建议数量

```javascript
chrome.storage.local.set({
  aiConfig: {
    apiKey: "YOUR_API_KEY",
    model: "deepseek-chat",
    maxSuggestions: 5  // 生成 5 条建议
  }
});
```

### 调整创造性

```javascript
chrome.storage.local.set({
  aiConfig: {
    apiKey: "YOUR_API_KEY",
    model: "deepseek-chat",
    temperature: 0.9  // 0.0-1.0，越高越有创造性
  }
});
```

### 调整回复长度

```javascript
chrome.storage.local.set({
  aiConfig: {
    apiKey: "YOUR_API_KEY",
    model: "deepseek-chat",
    maxTokens: 200  // 最多 200 个字符
  }
});
```

## ❓ 常见问题

### Q: API Key 会保存在哪里？

**A**: 保存在 Chrome 的本地存储（`chrome.storage.local`），只保存在你的浏览器中，不会上传到任何服务器。

### Q: 多个浏览器可以用同一个 API Key 吗？

**A**: 可以，DeepSeek API Key 没有限制使用设备的数量，只需要控制总用量即可。

### Q: 如何检查 API 使用量？

**A**: 登录 DeepSeek 平台，在"用量统计"页面查看详细的使用情况和费用。

### Q: API Key 会过期吗？

**A**: DeepSeek API Key 不会过期，但建议定期更换以保证安全。

---

**建议**：配置 API Key，体验更智能的回复建议！
