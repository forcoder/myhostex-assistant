# MyHostex 插件 v3.7.0 更新说明

## 需求

**用户反馈**：AI 生成的建议回复需要根据客户咨询的房源来定制。

从用户提供的截图看到，对话列表中每个对话都关联了具体的房源信息：
- zBU315567079 的咨询关联的是 **"波韵5街6号"**
- 翁浓仲 的咨询关联的是 **"5街35"**
- 姜家恒 的咨询关联的是 **"波韵5街3+5号"**

## 问题

之前的版本中，插件虽然从对话列表中提取了对话信息，但是**没有提取房源信息**。在生成 AI 建议时，LLM 不知道客户咨询的是哪个具体房源，只能生成通用的回复，不够准确和个性化。

## 解决方案

**v3.7.0 修复**：

1. **从对话列表中提取房源信息**
   - 在 `MessageReader.getConversationList()` 中添加房源信息提取逻辑
   - 尝试查找专门房源元素（`[class*='housing']`, `[class*='property']`, `[class*='room']` 等）
   - 如果没有找到专门的房源元素，从对话项的文本中解析（常见格式：客户名称 \n 房源名称）

2. **将房源信息传递到 state.currentConversation**
   - 在 `handleNewInquiry()` 中，从对话列表查找当前对话的房源信息
   - 将房源信息保存到 `state.currentConversation.housing`

3. **将房源信息传递给 LLM**
   - 在 `Panel.requestSuggestions()` 中，将 `currentHousing` 传递给 background script
   - background script 在调用 LLM 时，将房源信息注入到 System Prompt 中
   - 用于知识库匹配时，也使用房源信息进行过滤

## 修改内容

### 1. content.js - MessageReader.getConversationList()

**之前（v3.6.0）**：
```javascript
conversations.push({
  id,
  element: el,
  hasUnread: !!hasUnread,
  sender: senderEl?.textContent?.trim() || "客人",
  preview: previewEl?.textContent?.trim() || "",
  time: timeEl?.textContent?.trim() || "",
});
```

**之后（v3.7.0）**：
```javascript
// 尝试提取房源信息
const housingEl = el.querySelector("[class*='housing'],[class*='property'],[class*='room'],[class*='prop']");
const housingName = housingEl?.textContent?.trim() || "";

// 如果没有找到专门的房源元素，尝试从元素文本中提取
// 格式通常是：客户名称 - 房源名称 或者 客户名称 \n 房源名称
let extractedHousing = "";
if (!housingName && senderEl) {
  const text = el.textContent || "";
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  // 尝试第二行作为房源名称（常见格式）
  if (lines.length >= 2 && lines[0] === senderEl.textContent.trim()) {
    extractedHousing = lines[1];
  }
}

const finalHousing = housingName || extractedHousing || "";

conversations.push({
  id,
  element: el,
  hasUnread: !!hasUnread,
  sender: senderEl?.textContent?.trim() || "客人",
  preview: previewEl?.textContent?.trim() || "",
  time: timeEl?.textContent?.trim() || "",
  housing: finalHousing,  // 房源信息
});
```

### 2. content.js - handleNewInquiry()

**之后（v3.7.0）**：
```javascript
// 尝试从 DOM 中获取房源信息
let housing = "";
try {
  // 延迟一段时间后从对话列表中查找房源信息
  const conversations = MessageReader.getConversationList();
  const targetConv = conversations.find(c => c.id === threadId);
  if (targetConv && targetConv.housing) {
    housing = targetConv.housing;
    log('🏠 从对话列表中提取到房源:', housing);
  }
} catch (e) {
  log('⚠️ 提取房源信息失败:', e);
}

// 组装对话信息
const conv = {
  id: threadId,
  sender: sender,
  preview: preview,
  hasUnread: true,
  element: null,
  housing: housing  // 房源信息
};
```

### 3. content.js - Panel.requestSuggestions()

**之前（v3.6.0）**：
```javascript
const result = await LLMClient.generate(messages, {
  aiConfigs,
  rooms:      res.rooms || [],
  propInfo:   res.propInfo || {},
  replyRules: res.replyRules || [],
  userStyle:  res.userStyle || {},
  maxSuggestions: res.maxSuggestions || CONFIG.maxSuggestions,
  lang:       res.lang || "auto",
  knowledgeBase: res.knowledgeBase || [],
});
```

**之后（v3.7.0）**：
```javascript
// 获取当前对话的房源信息
const currentHousing = state.currentConversation?.housing || "";
if (currentHousing) {
  log('🏠 当前对话房源:', currentHousing);
}

const result = await LLMClient.generate(messages, {
  aiConfigs,
  rooms:      res.rooms || [],
  propInfo:   res.propInfo || {},
  replyRules: res.replyRules || [],
  userStyle:  res.userStyle || {},
  maxSuggestions: res.maxSuggestions || CONFIG.maxSuggestions,
  lang:       res.lang || "auto",
  knowledgeBase: res.knowledgeBase || [],
  currentHousing,  // ★ 当前对话的房源信息
});
```

### 4. background.js - handleGenerateSuggestions()

**之前（v3.6.0）**：
```javascript
async function handleGenerateSuggestions(msg) {
  const { messages = [], extraContext = {} } = msg;
  const {
    aiConfigs = [],
    aiConfig = {},
    rooms = [],
    propInfo = {},
    replyRules = [],
    userStyle = {},
    maxSuggestions = 5,
    knowledgeBase = [],
    currentRoom = null,
  } = extraContext;

  // ★ 关键词匹配：从知识库找出最相关条目
  const matchedEntries = matchKnowledgeBase(messages, knowledgeBase, currentRoom);

  const systemPrompt = buildSystemPrompt({ rooms, propInfo, replyRules, userStyle, lang: extraContext.lang || "auto", maxSuggestions, matchedEntries });
  ...
}
```

**之后（v3.7.0）**：
```javascript
async function handleGenerateSuggestions(msg) {
  const { messages = [], extraContext = {} } = msg;
  const {
    aiConfigs = [],
    aiConfig = {},
    rooms = [],
    propInfo = {},
    replyRules = [],
    userStyle = {},
    maxSuggestions = 5,
    knowledgeBase = [],
    currentRoom = null,
    currentHousing = "",  // ★ 当前对话的房源名称（从对话列表提取）
  } = extraContext;

  // ★ 关键词匹配：从知识库找出最相关条目
  // 优先使用 currentHousing（从对话列表提取的动态房源），其次是 currentRoom（静态配置）
  const roomForKB = currentHousing || currentRoom;
  if (roomForKB) {
    console.log("[MyHostex助手][BG] 使用房源进行知识库匹配:", roomForKB);
  }
  const matchedEntries = matchKnowledgeBase(messages, knowledgeBase, roomForKB);

  const systemPrompt = buildSystemPrompt({ rooms, propInfo, replyRules, userStyle, lang: extraContext.lang || "auto", maxSuggestions, matchedEntries, currentHousing });
  ...
}
```

### 5. background.js - buildSystemPrompt()

**之前（v3.6.0）**：
```javascript
function buildSystemPrompt({ rooms, propInfo, replyRules, userStyle, lang, maxSuggestions, matchedEntries = [] }) {
  const L = [];
  L.push(`你是民宿房东的智能回复助手，根据对话上下文生成 ${maxSuggestions} 条候选回复。`);
  ...

  // 房源信息
  const hasProp = Object.values(propInfo).some(Boolean);
  if (hasProp || rooms.length > 0) {
    L.push("\n## 房源信息");
    if (propInfo.location) L.push(`- 位置：${propInfo.location}`);
    ...
    rooms.forEach((r) => {
      const parts = [`【${r.name}】`];
      if (r.price)       parts.push(`价格：${r.price}。`);
      ...
      L.push(parts.join(""));
    });
  }
  ...
}
```

**之后（v3.7.0）**：
```javascript
function buildSystemPrompt({ rooms, propInfo, replyRules, userStyle, lang, maxSuggestions, matchedEntries = [], currentHousing = "" }) {
  const L = [];
  L.push(`你是民宿房东的智能回复助手，根据对话上下文生成 ${maxSuggestions} 条候选回复。`);
  ...

  // 房源信息
  const hasProp = Object.values(propInfo).some(Boolean);
  if (currentHousing) {
    L.push("\n## 当前咨询房源");
    L.push(`- 房源名称：${currentHousing}`);
    L.push(`- 请根据该房源的具体情况生成回复，如果不确定具体信息，可以用"该房源"或"这边"等通用表述。`);
  }
  if (hasProp || rooms.length > 0) {
    L.push("\n## 房源详细信息");
    if (propInfo.location) L.push(`- 位置：${propInfo.location}`);
    ...
    rooms.forEach((r) => {
      const parts = [`【${r.name}】`];
      if (r.price)       parts.push(`价格：${r.price}。`);
      ...
      L.push(parts.join(""));
    });
  }
  ...
}
```

### 6. manifest.json - 版本号更新

```json
{
  "version": "3.7.0",
  "description": "接入大模型，结合房间信息（自动抓取）与回复规则，智能生成个性化回复建议，并学习房东回复风格 - v3.7.0 从对话列表提取房源信息并传递给 LLM，让 AI 根据具体房源生成更准确的回复"
}
```

## 技术细节

### 房源信息提取逻辑

插件使用两种方式从对话列表中提取房源信息：

1. **专门的房源元素**：
   - 查找带有特定 class 的元素：`[class*='housing']`, `[class*='property']`, `[class*='room']`, `[class*='prop']`
   - 提取这些元素的文本内容

2. **从对话项文本中解析**：
   - 如果没有找到专门的房源元素，解析对话项的完整文本
   - 常见格式：`客户名称 \n 房源名称` 或 `客户名称 - 房源名称`
   - 使用第二行作为房源名称

### 房源信息在 LLM 中的应用

1. **System Prompt 注入**：
   ```
   ## 当前咨询房源
   - 房源名称：波韵5街6号
   - 请根据该房源的具体情况生成回复，如果不确定具体信息，可以用"该房源"或"这边"等通用表述。
   ```

2. **知识库匹配**：
   - 在匹配知识库条目时，使用房源名称进行过滤
   - 优先匹配适用于当前房源的回复规则

### 优先级

- `currentHousing`（从对话列表提取的动态房源） > `currentRoom`（用户手动配置的静态房源）
- 这样可以确保插件优先使用页面上显示的实时房源信息

## 效果

### 之前（v3.6.0）
AI 生成的建议回复是通用的，例如：
- "你好，有什么可以帮助您的？"
- "有空的，请问您要住哪几天？"
- "一天200元，您要住几天？"

### 之后（v3.7.0）
AI 生成的建议回复会根据具体房源定制，例如：
- "你好，波韵5街6号这边有什么可以帮助您的？"
- "波韵5街6号有空的，请问您要住哪几天？"
- "波韵5街6号一天200元，您要住几天？"

**注意**：LLM 实际生成的回复可能会有所不同，取决于房源信息和用户配置。

## 测试要点

1. **房源信息提取**：
   - 打开对话列表页面
   - 打开浏览器控制台
   - 应该能看到日志：`🏠 从对话列表中提取到房源: xxx`

2. **房源信息传递**：
   - 当客户发送新消息时
   - 应该能看到日志：`🏠 当前对话房源: xxx`

3. **知识库匹配**：
   - 如果有针对特定房源的知识库条目
   - 应该能看到日志：`[MyHostex助手][BG] 使用房源进行知识库匹配: xxx`

4. **AI 建议准确性**：
   - AI 生成的建议应该提及房源名称
   - 或者使用"该房源"等通用表述
   - 回复应该更贴合当前咨询的房源

## 优势

1. **更准确的回复**：AI 知道客户咨询的是哪个房源，可以生成更精准的回复
2. **更好的用户体验**：客户感受到房东对具体房源的了解
3. **知识库优化**：可以根据不同房源配置不同的标准回复
4. **自动化程度高**：无需手动配置，自动从页面提取房源信息

## 后续优化方向

1. **更详细的房源信息**：
   - 从对话列表中提取更多房源信息（价格、位置、设施等）
   - 或者跳转到房源详情页面抓取完整信息

2. **房源信息缓存**：
   - 缓存已抓取的房源信息，避免重复查询

3. **智能房源匹配**：
   - 当对话列表中没有房源信息时，尝试从对话内容中推断客户咨询的房源

## 相关文件

- `content.js` - MessageReader.getConversationList(), handleNewInquiry(), Panel.requestSuggestions() 方法修改
- `background.js` - handleGenerateSuggestions(), buildSystemPrompt() 函数修改
- `manifest.json` - 版本号更新
- `UPDATE-v3.7.0-HOUSING-INFO.md` - 本文档
