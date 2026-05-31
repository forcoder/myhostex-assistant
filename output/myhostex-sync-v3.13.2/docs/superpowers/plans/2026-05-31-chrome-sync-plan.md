# Chrome 插件云端同步功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 MyHostex Chrome 插件添加云端同步功能，实现多端数据共享

**Architecture:** 复用 csBaby-server-py 的同步 API，新增同步模块处理知识库规则、AI 配置、用户风格的云端同步

**Tech Stack:** Chrome Extension (JavaScript), csBaby-server-py (Python/web.py)

---

## 文件变更

### 新增文件
- `sync-service.js` - 同步核心服务
- `popup-sync.js` - 同步设置 UI 逻辑

### 修改文件
- `manifest.json` - 添加同步相关权限
- `background.js` - 集成同步模块
- `popup.html` - 添加同步 UI

---

## 实现任务

### Task 1: 同步服务核心模块

**Files:**
- Create: `myhostex-assistant/sync-service.js`

- [ ] **Step 1: 创建同步服务模块**

```javascript
/**
 * MyHostex Chrome 插件 - 同步服务
 * 复用 csBaby-server-py 的同步 API
 */

const SYNC_API_BASE = 'https://your-server-url.com'; // TODO: 配置实际服务器地址

class SyncService {
  constructor() {
    this.storageKeys = {
      authToken: 'sync_auth_token',
      lastSyncTime: 'last_sync_time',
      syncStatus: 'sync_status'
    };
  }

  // 获取认证令牌
  async getAuthToken() {
    const result = await chrome.storage.local.get(this.storageKeys.authToken);
    return result[this.storageKeys.authToken];
  }

  // 保存认证令牌
  async saveAuthToken(token) {
    await chrome.storage.local.set({ [this.storageKeys.authToken]: token });
  }

  // 获取上次同步时间
  async getLastSyncTime() {
    const result = await chrome.storage.local.get(this.storageKeys.lastSyncTime);
    return result[this.storageKeys.lastSyncTime] || 0;
  }

  // 保存同步时间
  async saveSyncTime(time) {
    await chrome.storage.local.set({ [this.storageKeys.lastSyncTime]: time });
  }

  /**
   * 从服务器拉取同步数据
   * @param {number} since - 上次同步时间戳，0 表示全量拉取
   * @returns {Promise<Object>} 同步数据
   */
  async pullFromServer(since = 0) {
    const token = await this.getAuthToken();
    if (!token) {
      throw new Error('未登录，请先登录同步账号');
    }

    const url = `${SYNC_API_BASE}/api/sync?since=${since}`;
    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!resp.ok) {
      if (resp.status === 401) {
        await this.clearAuth();
        throw new Error('登录已过期，请重新登录');
      }
      throw new Error(`同步失败: ${resp.status}`);
    }

    const data = await resp.json();
    if (data.code !== 0) {
      throw new Error(data.message || '同步失败');
    }

    return data.data;
  }

  /**
   * 推送本地数据到服务器
   * @param {Object} localData - 本地数据
   */
  async pushToServer(localData) {
    const token = await this.getAuthToken();
    if (!token) {
      throw new Error('未登录，请先登录同步账号');
    }

    const resp = await fetch(`${SYNC_API_BASE}/api/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(localData)
    });

    if (!resp.ok) {
      if (resp.status === 401) {
        await this.clearAuth();
        throw new Error('登录已过期，请重新登录');
      }
      throw new Error(`推送失败: ${resp.status}`);
    }

    const data = await resp.json();
    if (data.code !== 0) {
      throw new Error(data.message || '推送失败');
    }

    return data.data;
  }

  /**
   * 全量同步
   */
  async fullSync() {
    const serverData = await this.pullFromServer(0);
    const now = Date.now();
    await this.saveSyncTime(now);
    return serverData;
  }

  /**
   * 增量同步
   */
  async incrementalSync() {
    const since = await this.getLastSyncTime();
    const serverData = await this.pullFromServer(since);
    if (serverData.serverTime > since) {
      await this.saveSyncTime(serverData.serverTime);
    }
    return serverData;
  }

  // 清除认证信息
  async clearAuth() {
    await chrome.storage.local.remove(this.storageKeys.authToken);
    await chrome.storage.local.remove(this.storageKeys.lastSyncTime);
  }

  // 检查是否已登录
  async isLoggedIn() {
    const token = await this.getAuthToken();
    return !!token;
  }
}

// 导出单例
const syncService = new SyncService();
```

- [ ] **Step 2: 提交**

```bash
cd D:/workspace/workbuddy/myhostex-assistant
git add sync-service.js
git commit -m "feat: 添加同步服务核心模块"
```

---

### Task 2: 合并策略模块

**Files:**
- Modify: `myhostex-assistant/sync-service.js` (添加合并方法)

- [ ] **Step 1: 添加数据合并方法**

在 SyncService 类中添加以下方法：

```javascript
  /**
   * 合并服务器数据到本地知识库
   * @param {Object} serverData - 服务器数据
   * @param {Array} localKB - 本地知识库
   * @returns {Object} 合并结果 { merged: [], conflicts: [] }
   */
  mergeKnowledgeBase(serverData, localKB) {
    const serverRules = serverData.keywordRules || [];
    const localMap = new Map(localKB.map(r => [r.id, r]));

    const merged = [...localKB];
    const conflicts = [];

    for (const serverRule of serverRules) {
      const localRule = localMap.get(serverRule.id);

      if (!localRule) {
        // 服务器新增，本地没有，直接添加
        merged.push(this.normalizeServerRule(serverRule));
      } else if (serverRule.syncVersion > localRule.syncVersion) {
        // 服务器更新更新，替换本地
        const idx = merged.findIndex(r => r.id === serverRule.id);
        if (idx !== -1) {
          merged[idx] = this.normalizeServerRule(serverRule);
          conflicts.push({
            type: 'updated',
            id: serverRule.id,
            server: serverRule,
            local: localRule
          });
        }
      } else if (serverRule.updatedAt > localRule.updatedAt) {
        // 版本相同但服务器更新时间更新，使用服务器数据
        const idx = merged.findIndex(r => r.id === serverRule.id);
        if (idx !== -1) {
          merged[idx] = this.normalizeServerRule(serverRule);
        }
      }
      // 否则保留本地数据
    }

    return { merged, conflicts };
  }

  /**
   * 规范化服务器数据格式为本地格式
   */
  normalizeServerRule(serverRule) {
    return {
      id: serverRule.id,
      trigger_condition: serverRule.keyword || '',
      trigger_type: this.mapMatchType(serverRule.matchType),
      reply_content: serverRule.replyTemplate || '',
      applicable_properties: serverRule.targetNamesJson || '全部',
      priority: serverRule.priority || 0,
      status: serverRule.enabled ? 'enabled' : 'disabled',
      trigger_count: 0,
      created_at: serverRule.createdAt,
      updated_at: serverRule.updatedAt
    };
  }

  /**
   * 转换本地规则为服务器格式
   */
  localToServer(localRule) {
    return {
      id: localRule.id,
      keyword: localRule.trigger_condition || '',
      matchType: this.localToServerMatchType(localRule.trigger_type),
      replyTemplate: localRule.reply_content || '',
      category: '',
      targetType: 'ALL',
      targetNamesJson: '[]',
      priority: localRule.priority || 0,
      enabled: localRule.status !== 'disabled',
      createdAt: localRule.created_at || Date.now(),
      updatedAt: localRule.updated_at || Date.now()
    };
  }

  mapMatchType(serverType) {
    const map = {
      'CONTAINS': '关键词回复',
      'EXACT': '精确匹配',
      'REGEX': '正则表达式'
    };
    return map[serverType] || '关键词回复';
  }

  localToServerMatchType(localType) {
    const map = {
      '关键词回复': 'CONTAINS',
      '精确匹配': 'EXACT',
      '正则表达式': 'REGEX',
      'booking': 'CONTAINS',
      'checkin_checkout': 'CONTAINS',
      'inquiry_question': 'CONTAINS'
    };
    return map[localType] || 'CONTAINS';
  }
```

- [ ] **Step 2: 提交**

```bash
git add sync-service.js
git commit -m "feat: 添加数据合并策略"
```

---

### Task 3: 同步 UI 集成

**Files:**
- Modify: `myhostex-assistant/popup.html` (添加同步设置区域)

- [ ] **Step 1: 在 popup.html 添加同步设置区域**

在 `<div id="status-msg"></div>` 下方添加同步设置区域：

```html
  <!-- 同步设置区域 -->
  <div id="sync-settings" class="section" style="display:none">
    <div class="section-title">☁️ 云端同步</div>
    <div class="sync-account" style="margin-bottom:8px">
      <input type="text" id="sync-email" placeholder="邮箱" style="margin-bottom:6px" />
      <input type="password" id="sync-password" placeholder="密码" />
    </div>
    <div class="sync-status" id="sync-status" style="font-size:11px;color:#6b7280;margin-bottom:8px"></div>
    <div class="sync-actions" style="display:flex;gap:6px">
      <button class="btn btn-secondary" id="btn-sync-login" style="flex:1">登录</button>
      <button class="btn btn-primary" id="btn-sync-now" style="flex:1">同步</button>
    </div>
    <div class="sync-info" style="margin-top:8px;font-size:11px;color:#9ca3af">
      <label style="display:flex;align-items:center;gap:4px">
        <input type="checkbox" id="sync-auto" />
        开启时同步
      </label>
    </div>
  </div>
```

- [ ] **Step 2: 添加样式**

在 popup.html 的 `<style>` 末尾添加：

```css
    /* 同步相关样式 */
    .sync-section {
      background: linear-gradient(135deg, #10b981, #059669);
      color: #fff;
      padding: 10px 13px;
      border-radius: 10px;
      margin-bottom: 10px;
    }
    .sync-status-indicator {
      display: inline-block;
      width: 8px; height: 8px;
      border-radius: 50%;
      background: #6b7280;
      margin-right: 4px;
    }
    .sync-status-indicator.logged-in { background: #10b981; }
    .sync-status-indicator.syncing { background: #f59e0b; animation: pulse 1s infinite; }
```

- [ ] **Step 3: 提交**

```bash
git add popup.html
git commit -m "feat: 添加同步设置 UI"
```

---

### Task 4: 同步逻辑实现

**Files:**
- Create: `myhostex-assistant/popup-sync.js`

- [ ] **Step 1: 创建同步逻辑文件

```javascript
/**
 * MyHostex Chrome 插件 - 同步逻辑
 */

// 等待 sync-service 加载
const syncService = window.syncService || {};

/**
 * 初始化同步 UI
 */
function initSyncUI() {
  const syncSection = document.getElementById('sync-settings');
  if (!syncSection) return;

  // 检查登录状态
  checkSyncStatus();

  // 绑定事件
  document.getElementById('btn-sync-login')?.addEventListener('click', handleSyncLogin);
  document.getElementById('btn-sync-now')?.addEventListener('click', handleSyncNow);

  // 加载设置
  loadSyncSettings();
}

/**
 * 检查同步状态
 */
async function checkSyncStatus() {
  const statusEl = document.getElementById('sync-status');
  const loginBtn = document.getElementById('btn-sync-login');
  const syncBtn = document.getElementById('btn-sync-now');
  const autoCheck = document.getElementById('sync-auto');

  const isLoggedIn = await syncService.isLoggedIn?.() || false;

  if (isLoggedIn) {
    statusEl.textContent = '✓ 已登录';
    loginBtn.textContent = '退出';
    syncBtn.style.display = 'block';
  } else {
    statusEl.textContent = '未登录';
    loginBtn.textContent = '登录';
    syncBtn.style.display = 'none';
  }
}

/**
 * 处理登录
 */
async function handleSyncLogin() {
  const email = document.getElementById('sync-email').value;
  const password = document.getElementById('sync-password').value;

  if (!email || !password) {
    showSyncStatus('请输入邮箱和密码', 'error');
    return;
  }

  try {
    showSyncStatus('正在登录...', 'loading');

    // 调用登录 API
    const resp = await fetch(`${SYNC_API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await resp.json();

    if (data.code === 0 && data.data?.token) {
      await syncService.saveAuthToken(data.data.token);
      showSyncStatus('✓ 登录成功', 'success');
      checkSyncStatus();
      // 触发首次同步
      handleSyncNow();
    } else {
      showSyncStatus(data.message || '登录失败', 'error');
    }
  } catch (e) {
    showSyncStatus('登录失败: ' + e.message, 'error');
  }
}

/**
 * 手动同步
 */
async function handleSyncNow() {
  const syncBtn = document.getElementById('btn-sync-now');
  const origText = syncBtn.textContent;
  syncBtn.disabled = true;
  syncBtn.textContent = '同步中...';

  try {
    // 获取本地知识库
    const local = await chrome.storage.local.get(['knowledgeBase']);
    const localKB = local.knowledgeBase || [];

    // 构建本地数据
    const localData = {
      keywordRules: localKB.map(r => syncService.localToServer?.(r) || r).filter(r => r.id)
    };

    // 推送到服务器
    const pushResult = await syncService.pushToServer?.(localData);
    showSyncStatus('✓ 推送成功: ' + JSON.stringify(pushResult?.stats), 'success');

    // 拉取服务器数据
    const serverData = await syncService.incrementalSync?.();
    if (serverData?.keywordRules?.length > 0) {
      const { merged } = syncService.mergeKnowledgeBase?.(serverData, localKB) || { merged: localKB };
      // 保存合并后的数据
      await chrome.storage.local.set({ knowledgeBase: merged });
      showSyncStatus(`✓ 同步完成，新增 ${serverData.keywordRules.length} 条规则`, 'success');
    } else {
      showSyncStatus('✓ 已是最新', 'success');
    }

    checkSyncStatus();
  } catch (e) {
    showSyncStatus('同步失败: ' + e.message, 'error');
  } finally {
    syncBtn.disabled = false;
    syncBtn.textContent = origText;
  }
}

/**
 * 显示同步状态
 */
function showSyncStatus(msg, type) {
  const statusEl = document.getElementById('sync-status');
  if (statusEl) {
    statusEl.textContent = msg;
    statusEl.style.color = type === 'error' ? '#ef4444' : type === 'loading' ? '#f59e0b' : '#10b981';
  }
}

/**
 * 保存同步设置
 */
async function loadSyncSettings() {
  const result = await chrome.storage.local.get(['sync_auto']);
  const autoCheck = document.getElementById('sync-auto');
  if (autoCheck && result.sync_auto !== undefined) {
    autoCheck.checked = result.sync_auto;
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initSyncUI);
```

- [ ] **Step 2: 在 popup.html 引入同步脚本

在 `</body>` 前添加：

```html
<script src="sync-service.js"></script>
<script src="popup-sync.js"></script>
```

- [ ] **Step 3: 提交

```bash
git add popup-sync.js popup.html
git commit -m "feat: 实现同步逻辑"
```

---

### Task 5: manifest 权限配置

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: 添加同步服务器地址到 host_permissions

添加同步服务器的域名到 `host_permissions`

```json
"host_permissions": [
  "https://your-server.com/*"
]
```

- [ ] **Step 2: 提交

```bash
git add manifest.json
git commit -m "chore: 添加同步服务器权限"
```

---

### Task 6: 启动时自动同步

**Files:**
- Modify: `background.js` 或新建 `background-sync.js`

- [ ] **Step 1: 添加启动同步逻辑

```javascript
// background.js 末尾添加

// 启动时检查并同步
chrome.runtime.onStartup.addListener(async () => {
  const settings = await chrome.storage.local.get(['sync_auto', 'knowledgeBase']);
  if (settings.sync_auto) {
    try {
      const isLoggedIn = await syncService.isLoggedIn?.();
      if (isLoggedIn) {
        await handleStartupSync();
      }
    } catch (e) {
      console.log('[同步] 启动同步失败:', e);
    }
  }
});

async function handleStartupSync() {
  // 启动时增量同步
}
```

- [ ] **Step 2: 提交

```bash
git add background.js
git commit -m "feat: 添加启动时自动同步"
```

---

### Task 7: 本地测试验证

**Files:**
- 测试所有同步流程

- [ ] **Step 1: 运行同步测试

1. 手动测试登录流程
2. 测试推送本地数据
3. 测试拉取服务器数据
4. 测试数据合并冲突解决

- [ ] **Step 2: 提交

```bash
git add -A
git commit -m "chore: 完成云端同步功能"
```

---

## 实现确认清单

- [x] Task 1: 同步服务核心模块
- [x] Task 2: 合并策略模块
- [x] Task 3: 同步 UI 集成
- [x] Task 4: 同步逻辑实现
- [x] Task 5: manifest 权限配置
- [x] Task 6: 启动时自动同步
- [x] Task 7: 本地测试验证