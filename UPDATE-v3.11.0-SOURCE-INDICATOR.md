# v3.11.0 - 建议来源标识

## 更新日期
2026-04-06

## 功能描述

在每条建议回复后添加来源标识小图标，让用户一眼就能看出建议的来源：
- 📚 - 来自知识库规则（匹配到回复规则）
- ✨ - AI 生成建议（调用 LLM 生成）

## 实现方式

### 1. 建议列表渲染（content.js:766-817）

在 `renderSuggestions` 方法中，根据 `fromAI` 参数确定图标：

```javascript
// 根据建议来源确定图标
const sourceIcon = fromAI === "kb" ? "📚" : (fromAI ? "✨" : "");
const sourceTitle = fromAI === "kb" ? "来自知识库规则" : (fromAI ? "AI 生成" : "");

list.forEach((text) => {
  const li = document.createElement("li");
  li.className = "mha-sugg-item";
  // 在建议文本后添加来源图标
  li.innerHTML = `
    <span class="mha-sugg-text">${escHtml(text)}</span>
    ${sourceIcon ? `<span class="mha-sugg-source" title="${sourceTitle}">${sourceIcon}</span>` : ""}
    <button class="mha-sugg-btn" title="发送">↩ 发送</button>
  `;
  // ...
});
```

### 2. CSS 样式（styles/panel.css）

新增 `.mha-sugg-source` 样式类：

```css
.mha-sugg-source {
  flex-shrink: 0;
  font-size: 14px;
  opacity: 0.7;
  margin-left: 4px;
  cursor: help;
  transition: opacity 0.15s;
}
.mha-sugg-source:hover { opacity: 1; }
```

## 效果展示

### 知识库规则建议
```
你好！很高兴为您服务。📚
你好！请问有什么可以帮您的？📚
别墅内禁止燃放烟花...📚
```

### AI 生成建议
```
您好！请问您需要咨询哪个房源的信息？✨
您好！这个房源是波韵5街6号，共3层...✨
好的，我稍后为您确认入住时间...✨
```

## 优势

1. **清晰的来源区分**：用户一眼就能看出建议来自知识库还是 AI
2. **提升信任度**：知识库规则通常更准确，用户可以优先选择
3. **性能感知**：用户可以感知到"知识库匹配成功 → 跳过 AI 生成"的性能优化
4. **鼠标悬停提示**：鼠标悬停在图标上会显示详细说明

## 测试要点

1. **知识库匹配场景**：
   - 发送"你好"消息
   - 应该看到建议后带 📚 图标
   - 鼠标悬停图标应显示"来自知识库规则"

2. **AI 生成场景**：
   - 发送一个知识库没有的问题
   - 应该看到建议后带 ✨ 图标
   - 鼠标悬停图标应显示"AI 生成"

3. **混合场景**：
   - 如果同时有知识库规则和 AI 生成的建议（未来可能支持）
   - 应该正确显示不同的图标

## 修改文件

- content.js:766-817 - 修改 renderSuggestions 方法，添加来源图标
- styles/panel.css:165-172 - 新增 .mha-sugg-source 样式
- manifest.json - 版本更新至 3.11.0

## 后续优化建议

1. **多来源混合**：未来如果支持同时返回知识库和 AI 建议，可以：
   - 优先显示知识库建议（带 📚 图标）
   - 其次显示 AI 建议（带 ✨ 图标）

2. **颜色区分**：可以为不同来源的图标设置不同颜色：
   - 知识库：绿色（表示快速匹配）
   - AI：蓝色（表示智能生成）

3. **来源统计**：在顶部显示"📚 知识库 X 条，✨ AI Y 条"

4. **来源筛选**：添加筛选功能，用户可以只查看来自某个来源的建议
