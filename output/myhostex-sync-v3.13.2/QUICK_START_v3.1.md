# MyHostex 智能回复助手 v3.1.0 - 快速使用指南

## 🎯 核心新功能

**配置持久化** - 所有设置自动保存，无需重复配置！

## 📦 升级步骤（3 步）

### 1️⃣ 打开扩展管理
```
在浏览器地址栏输入：chrome://extensions/
```

### 2️⃣ 重新加载插件
找到 "MyHostex 智能回复助手"，点击刷新按钮 🔄

### 3️⃣ 刷新网站
刷新 MyHostex 网站即可，配置会自动恢复

---

## ✨ 自动保存的内容

| 配置项 | 说明 | 示例 |
|--------|------|------|
| API Key | AI 模型的访问密钥 | `sk-xxxxx` |
| 模型名称 | 使用的 AI 模型 | `deepseek-chat`, `gpt-4o` |
| Temperature | 随机性参数 | `0.7` |
| 对话历史 | AI 生成记录 | 最多 100 条 |
| 统计数据 | 使用统计 | 生成/发送次数 |

---

## 🔍 验证配置已加载

打开 MyHostex 网站，按 F12 打开控制台，应该看到：

```
[MyHostex助手] 初始化 v3 (配置持久化版)...
📦 已加载配置: {hasApiKey: true, model: "deepseek-chat", ...}
✅ AI 配置已从保存的配置中加载
```

---

## 💻 调试命令

### 查看所有配置
```javascript
chrome.storage.local.get('mha_config', (res) => console.log(res.mha_config));
```

### 查看统计信息
```javascript
chrome.storage.local.get('mha_config', (res) => console.table(res.mha_config?.stats));
```

### 查看 AI 历史记录
```javascript
chrome.storage.local.get('mha_config', (res) => console.table(res.mha_config?.aiHistory));
```

### 导出配置（备份）
```javascript
chrome.storage.local.get('mha_config', (res) => {
  navigator.clipboard.writeText(JSON.stringify(res.mha_config, null, 2));
  console.log('✅ 配置已复制到剪贴板');
});
```

### 清除配置（重置）
```javascript
chrome.storage.local.remove('mha_config', () => console.log('✅ 配置已清除'));
```

---

## 📝 配置结构说明

```javascript
{
  apiKey: "sk-xxxxxx",           // 你的 API Key
  model: "deepseek-chat",         // AI 模型
  temperature: 0.7,               // 随机性（0-1，越高越随机）
  maxTokens: 500,                // 最大生成长度
  systemPrompt: "你是一个...",     // 系统提示词
  aiHistory: [                    // AI 对话历史
    {
      id: 1234567890,
      timestamp: "2026-04-05T14:53:50.574Z",
      guestMessage: "你好，请问房间还有吗？",
      suggestions: ["回复1", "回复2", "回复3"],
      used: true
    }
  ],
  stats: {                       // 统计数据
    totalGenerated: 150,          // 总生成次数
    totalSent: 120,              // 总发送次数
    totalReplies: 120            // 总回复次数
  }
}
```

---

## 🎨 主要改进

### v3.0.1 → v3.1.0

- ✅ 新增配置持久化功能
- ✅ 自动保存 AI 对话历史
- ✅ 自动保存统计数据
- ✅ 自动恢复所有配置
- ✅ 无需重复设置 API Key
- ✅ 插件更新不丢失配置

---

## ⚙️ 使用场景

### 场景 1：首次使用
1. 打开插件弹窗，设置 API Key
2. 配置会自动保存
3. 以后无需重复设置

### 场景 2：重启浏览器
1. 打开 MyHostex 网站
2. 配置会自动加载
3. 直接使用，无需设置

### 场景 3：更新插件
1. 更新插件版本
2. 配置会自动合并
3. 不会丢失任何设置

### 场景 4：多设备使用
1. 在 A 电脑导出配置（使用导出命令）
2. 在 B 电脑导入配置
3. 跨设备同步设置

---

## 📄 相关文档

- `UPDATE-v3.1.0.md` - 详细更新说明
- `CONFIG_PERSISTENCE.md` - 配置持久化完整文档
- `TROUBLESHOOTING.md` - 故障排除指南

---

## 🆘 常见问题

### Q: 配置保存在哪里？
A: 保存在 Chrome 的 `chrome.storage.local` 中，不会跨设备同步。

### Q: 历史记录会保留多久？
A: 最多保留 100 条，旧记录会自动删除。

### Q: 如何查看历史记录？
A: 使用调试命令 `chrome.storage.local.get('mha_config', ...)` 查看。

### Q: 如何备份配置？
A: 使用导出命令，将配置复制到剪贴板后保存为文本文件。

### Q: 更新插件会丢失配置吗？
A: 不会，插件更新时会自动合并新旧配置，保留所有设置。

---

**享受自动化的智能回复体验吧！** 🎉
