# 更新日志 v3.1.0 - 配置持久化功能

## 🆕 新功能

### 自动保存和加载配置

插件现在会自动保存所有配置，即使重新加载插件或重启浏览器，配置也不会丢失。

#### 保存的配置包括：

1. **AI 配置**
   - API Key
   - 模型名称（deepseek-chat、gpt-4o 等）
   - Temperature 参数
   - Max Tokens 参数

2. **AI 对话历史**
   - 每次生成的建议记录
   - 客人消息与 AI 建议的对应关系
   - 建议是否被使用
   - 最多保留 100 条历史记录

3. **统计数据**
   - 总生成次数
   - 总发送次数
   - 总回复次数

4. **其他配置**
   - 房源列表
   - 房产信息
   - 回复规则
   - 用户风格
   - 知识库

## 🔧 技术实现

### ConfigManager 模块

新增 `ConfigManager` 对象，提供以下功能：

```javascript
ConfigManager.load()        // 加载保存的配置
ConfigManager.save(config)  // 保存配置
ConfigManager.saveAIHistory(history)  // 保存 AI 历史记录
ConfigManager.updateStats(stats)       // 更新统计数据
ConfigManager.reset()                 // 重置为默认配置
```

### 配置存储结构

```javascript
{
  apiKey: 'your-api-key',
  model: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 500,
  systemPrompt: '你是一个专业的民宿房东...',
  aiHistory: [
    {
      id: 1234567890,
      timestamp: '2026-04-05T14:53:50.574Z',
      guestMessage: '你好，请问房间还有吗？',
      suggestions: ['回复1', '回复2', '回复3'],
      used: true
    }
  ],
  userStyle: null,
  stats: {
    totalGenerated: 150,
    totalSent: 120,
    totalReplies: 120
  },
  version: '1.0'
}
```

## 📦 更新说明

### 插件安装/更新时

1. **首次安装**：使用默认配置初始化
2. **插件更新**：自动合并新旧配置，保留用户设置
3. **重新加载**：自动加载之前保存的所有配置

### 配置加载流程

1. 插件启动时自动加载保存的配置
2. 如果保存了 API Key，自动应用到 AI 配置
3. 控制台输出加载的配置信息（便于调试）

### 数据保存时机

1. **生成建议后**：自动保存到 AI 历史记录
2. **发送回复后**：更新统计数据，标记建议为"已使用"
3. **配置修改后**：立即保存到 chrome.storage

## 💡 使用提示

### 查看保存的配置

在浏览器控制台中输入：

```javascript
// 查看完整配置
chrome.storage.local.get('mha_config', (res) => console.log(res.mha_config));

// 查看统计信息
chrome.storage.local.get('mha_config', (res) => console.log(res.mha_config?.stats));

// 查看 AI 历史记录
chrome.storage.local.get('mha_config', (res) => console.log(res.mha_config?.aiHistory));
```

### 清除配置

如果需要重置所有配置，在控制台中输入：

```javascript
chrome.storage.local.remove('mha_config', () => console.log('✅ 配置已清除'));
```

### 导出/导入配置

```javascript
// 导出配置
chrome.storage.local.get('mha_config', (res) => {
  const json = JSON.stringify(res.mha_config, null, 2);
  navigator.clipboard.writeText(json);
  console.log('✅ 配置已复制到剪贴板');
});

// 导入配置
const config = JSON.parse(/* 粘贴配置 JSON */);
chrome.storage.local.set({ mha_config: config }, () => console.log('✅ 配置已导入'));
```

## 🐛 修复的问题

### v3.0.0 - v3.0.1 的遗留问题

- ✅ 修复了"一键智能回复"无法发送消息的问题
- ✅ 优化了输入框和发送按钮的选择器

## 🔍 调试信息

插件启动时会在控制台输出以下信息：

```
[MyHostex助手] 初始化 v3 (配置持久化版)...
📦 已加载配置: {hasApiKey: true, model: "deepseek-chat", historyCount: 45, stats: {...}}
✅ AI 配置已从保存的配置中加载
```

## 📝 注意事项

1. **配置存储位置**：所有配置保存在 `chrome.storage.local` 中
2. **历史记录限制**：AI 历史记录最多保留 100 条，旧记录自动删除
3. **版本兼容性**：插件更新时自动合并新旧配置，不会丢失数据
4. **多设备同步**：当前配置仅保存在本地浏览器，不会跨设备同步

## 🚀 升级步骤

1. 打开 Chrome 扩展管理页面（`chrome://extensions/`）
2. 找到 "MyHostex 智能回复助手"
3. 点击刷新按钮 🔄
4. 刷新 MyHostex 网站
5. 插件会自动加载之前保存的配置

---

**版本**: 3.1.0
**更新日期**: 2026-04-05
