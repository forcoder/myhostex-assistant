# Chrome 插件云端同步功能设计方案

**日期**: 2026-05-31
**状态**: 已完成
**功能**: 为 MyHostex Chrome 插件添加云端同步功能

---

## 1. 背景

当前 MyHostex Chrome 插件所有数据存储在本地 Chrome Storage，无法在多个设备间同步。同时已有 Android 应用（csBaby）使用 `csBaby-server-py` 后端实现了完整的同步功能。

**目标**：复用现有后端 API，为 Chrome 插件添加云端同步能力。

---

## 2. 需求分析

| 需求 | 描述 |
|------|------|
| 同步触发 | 手动触发 + 保存时自动同步 + 启动时拉取 |
| 同步数据 | 重点：知识库规则（keywordRules） |
| 附加数据 | AI 模型配置、用户风格偏好 |
| 冲突处理 | 智能合并（根据 syncVersion） |
| 兼容性 | 保持现有功能不变 |

---

## 3. 架构设计

```
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│  Chrome 插件    │────▶│  csBaby-server-py  │◀────│   Android App   │
│ (新增 sync 模块) │     │   (已有 SyncAPI)    │     │   (已有同步)     │
└─────────────────┘     └─────────────────────┘     └─────────────────┘
        │                         │
        │                         ▼
        │                 ┌─────────────────┐
        └────────────────▶│   Supabase DB    │
                            └─────────────────┘
```

---

## 4. 同步 API

### 4.1 获取同步数据

```
GET /api/sync?since={timestamp}
```

**参数**：
- `since`: 上次同步时间戳（毫秒），0 表示全量同步

**响应**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "keywordRules": [...],
    "aiModelConfigs": [...],
    "userStyleProfile": {...},
    "serverTime": 1234567890,
    "hasMore": false
  }
}
```

### 4.2 推送同步数据

```
POST /api/sync/push
Content-Type: application/json

{
  "keywordRules": [...],
  "aiModelConfigs": [...],
  "userStyleProfile": {...}
}
```

**响应**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "accepted": true,
    "newServerVersion": 1234567890,
    "stats": {"inserted": 1, "updated": 0, "deleted": 0}
  }
}
```

---

## 5. 数据模型

### 5.1 知识库规则 (keywordRules)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 规则唯一 ID |
| keyword | string | 关键词 |
| matchType | string | 匹配类型 |
| replyTemplate | string | 回复模板 |
| category | string | 分类 |
| targetType | string | 目标类型 |
| targetNamesJson | string | 目标名称 JSON |
| priority | int | 优先级 |
| enabled | bool | 是否启用 |
| createdAt | long | 创建时间戳 |
| updatedAt | long | 更新时间戳 |
| syncVersion | long | 同步版本 |

### 5.2 用户风格 (userStyleProfile)

| 字段 | 类型 | 说明 |
|------|------|------|
| userId | string | 用户 ID |
| formalityLevel | float | 正式程度 (0-1) |
| enthusiasmLevel | float | 热情程度 (0-1) |
| professionalismLevel | float | 专业程度 (0-1) |
| wordCountPreference | int | 平均字数偏好 |
| commonPhrases | string | 常用短语 JSON |
| avoidPhrases | string | 避免短语 JSON |
| learningSamples | int | 学习样本数 |
| accuracyScore | float | 准确度评分 |
| lastTrained | long | 上次训练时间 |
| syncVersion | long | 同步版本 |

---

## 6. 组件设计

### 6.1 新增文件

| 文件 | 职责 |
|------|------|
| `background-sync.js` | 同步核心逻辑 |
| `popup-sync.html` | 同步设置 UI |
| `popup-sync.js` | 同步设置逻辑 |
| `sync-merge.js` | 数据合并策略 |

### 6.2 修改文件

| 文件 | 改动 |
|------|------|
| `manifest.json` | 添加同步相关权限和 API |
| `background.js` | 集成同步模块 |
| `popup.html` | 添加同步按钮 |
| `popup.js` | 同步操作处理 |

---

## 7. 同步流程

### 7.1 启动同步（用户点击按钮）

```
用户点击同步按钮
    ↓
background.js 调用 getSyncData()
    ↓
获取本地 lastSyncTime
    ↓
调用 GET /api/sync?since={lastSyncTime}
    ↓
合并服务器数据到本地
    ↓
更新 lastSyncTime
    ↓
通知用户同步完成
```

### 7.2 保存时同步

```
用户修改知识库规则
    ↓
保存到本地 Chrome Storage
    ↓
调用 pushSyncData()
    ↓
推送变更到服务器
    ↓
更新 lastSyncTime
```

### 7.3 启动时拉取

```
Chrome 插件启动
    ↓
检查是否已登录
    ↓
获取本地 lastSyncTime
    ↓
调用 GET /api/sync?since={lastSyncTime}
    ↓
如有更新，合并到本地
    ↓
更新 UI
```

---

## 8. 数据合并策略

### 8.1 规则列表合并

```
1. 遍历服务器返回的 keywordRules
2. 对比本地 syncVersion：
   - 服务器版本更新 → 使用服务器数据
   - 本地版本更新 → 保留本地数据
   - 版本相同 → 保留最新 updatedAt
3. 冲突检测：
   - 同一 ID，数据不同 → 保留 updatedAt 最新的
4. 返回合并后的数据
```

### 8.2 用户风格合并

```
1. 使用服务器数据（权威来源）
2. 保留本地新增的学习样本
3. 更新 syncVersion
```

---

## 9. 实现步骤

### Phase 1: 基础同步模块

1. 创建 `background-sync.js`
2. 实现 `getSyncData()` 函数
3. 实现 `pushSyncData()` 函数
4. 实现 `mergeData()` 合并策略

### Phase 2: UI 集成

1. 在 `popup.html` 添加同步按钮
2. 在 `popup.js` 处理同步操作
3. 添加同步状态显示

### Phase 3: 自动同步

1. 保存时自动同步
2. 启动时自动拉取
3. 错误处理和重试

### Phase 4: 测试和优化

1. 功能测试
2. 离线场景测试
3. 冲突场景测试

---

## 10. 注意事项

- 保持现有 Chrome Storage 功能不变
- 同步失败时不影响本地使用
- 需要用户登录后才能同步
- 敏感数据（如 API Key）需要加密传输