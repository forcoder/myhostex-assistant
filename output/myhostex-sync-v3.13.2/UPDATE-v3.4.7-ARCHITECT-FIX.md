# UPDATE-v3.4.7-ARCHITECT-FIX.md

## 修复日期
2026-04-06

## 修复的问题

### 🔴 关键修复：向后兼容性

#### 1. 知识库 status 默认值修复

**问题**：v3.4.6 新增 status 字段后，旧数据（无 status 字段）会被错误地设为"禁用"，导致用户所有规则失效。

**修复**：
- `popup.js:929` - 导入时缺少 status 字段默认为"启用"
  ```javascript
  // 修复前
  status: e.status === "启用" || e.status === true ? "启用" : "禁用",
  // 修复后
  status: e.status === "禁用" ? "禁用" : "启用", // 缺少字段默认为启用
  ```

- `background.js:719` - 匹配时缺少 status 字段视为已启用
  ```javascript
  // 修复前
  const active = kb.filter((e) => e.status === "启用");
  // 修复后
  const active = kb.filter((e) => e.status !== "禁用"); // 缺少字段默认为启用
  ```

#### 2. 删除孤立代码 `llm.js`

该文件未被 manifest.json 引用，是旧版本遗留的代码，已删除。

#### 3. 清理调试文件

已删除以下调试文件：
- `debug-helper.js`
- `debug-helper-v2.js`
- `debug-helper-simple.js`

## 未修复的高优先级项（需要进一步评估）

### 配置存储不一致
- **状态**：`mha_config` 和 `aiConfig` 同时存在是历史原因，用于兼容性
- **风险**：统一到单一键可能导致旧用户配置丢失
- **建议**：保持现状，或在后续大版本中进行迁移

### `content.js` 代码拆分
- **状态**：代码量大（1167行），混合了多个模块
- **风险**：拆分可能导致回归问题
- **建议**：在 v3.5.0 或后续版本中重构

### 🟠 P0 修复：重复关键词检查 includes() 误判

**问题**：`popup.js:867` 使用 `includes()` 检查导致"价格"会误匹配"最低价格"

**修复**：改为精确匹配独立关键词
```javascript
const existingEntry = knowledgeBase.find(e => {
  const cond = e.trigger_condition || "";
  const cleaned = cond.replace(/^(?:关键字|关键词|keyword)[\s]*[:：][\s]*/i, "").trim();
  const keywords = cleaned.split(/[,，、;；\/|]/).map(k => k.trim().toLowerCase());
  return keywords.includes(keyword.trim().toLowerCase());
});
```

**效果**：
- ✅ "价格" 不会匹配 "最低价格"
- ✅ "价格" 不会匹配 "含价格"
- ✅ 只匹配独立的关键词

## 验证清单

- [x] 导入旧数据（无 status 字段）后，规则默认启用
- [x] 匹配逻辑正确过滤禁用的规则
- [ ] 启用/禁用切换功能正常
- [ ] 删除功能正常
- [x] 无调试文件残留
- [ ] 重复关键词检查精确匹配正常（"价格"≠"最低价格"）
