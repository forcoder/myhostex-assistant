# 同步登录功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 myhostex-assistant 添加云端同步登录功能，同步前必须登录，同步后显示详细变更统计

**Architecture:** 在现有 `popup-sync.js` 基础上新增 `SyncAuthManager` 模块管理认证状态，修改 `popup.html` 添加登录/注册对话框 UI，修改 `popup-sync.js` 实现完整的登录/注册/登出流程

**Tech Stack:** Chrome Extension (popup.js), Vanilla JavaScript, chrome.storage.local

---

## 操作权限

| 操作 | 未登录 | 已登录 |
|------|--------|--------|
| 本地导出（JSON） | ✅ 可用 | ✅ 可用 |
| 本地导入（JSON） | ✅ 可用 | ✅ 可用 |
| 云端同步 | ❌ 弹出登录对话框 | ✅ 可用 |

---

## 文件结构

```
popup.html         - 新增登录/注册对话框 UI + 同步详情显示区
popup-sync.js      - 新增 SyncAuthManager 模块 + 修改同步逻辑
sync-service.js     - 修改返回详细统计信息（按数据类型分类）
```

---

## 实现步骤

### Task 1: 新增 SyncAuthManager 模块（popup-sync.js）

**Files:**
- Modify: `popup-sync.js:1-30`

- [ ] **Step 1: 在文件顶部添加 SyncAuthManager 类**

在 `SYNC_STATUS` 常量之后添加认证管理模块：

```javascript
// ── 认证状态存储键 ───────────────────────────
const SYNC_AUTH_KEY = "sync_auth";

// ── SyncAuthManager ─────────────────────────
class SyncAuthManager {
  constructor() {
    this._auth = null;
    this._listeners = [];
  }

  // 获取当前认证状态
  getAuth() {
    return this._auth;
  }

  // 是否已登录
  isLoggedIn() {
    return this._auth !== null && this._auth.expiresAt > Date.now();
  }

  // 获取访问令牌
  getAccessToken() {
    return this._auth?.accessToken || null;
  }

  // 获取租户ID
  getTenantId() {
    return this._auth?.tenantId || null;
  }

  // 加载保存的认证状态
  async loadAuthState() {
    try {
      const result = await chrome.storage.local.get(SYNC_AUTH_KEY);
      if (result[SYNC_AUTH_KEY]) {
        this._auth = result[SYNC_AUTH_KEY];
        // 检查是否过期
        if (this._auth.expiresAt <= Date.now()) {
          this._auth = null;
        }
      }
      return this._auth;
    } catch (err) {
      console.error("[SyncAuth] 加载认证状态失败:", err);
      return null;
    }
  }

  // 保存认证状态
  async saveAuthState(auth) {
    this._auth = auth;
    await chrome.storage.local.set({ [SYNC_AUTH_KEY]: auth });
    this._notifyListeners();
  }

  // 清除认证状态
  async clearAuthState() {
    this._auth = null;
    await chrome.storage.local.remove(SYNC_AUTH_KEY);
    this._notifyListeners();
  }

  // 添加状态变更监听器
  addListener(callback) {
    this._listeners.push(callback);
  }

  // 移除监听器
  removeListener(callback) {
    this._listeners = this._listeners.filter(l => l !== callback);
  }

  _notifyListeners() {
    this._listeners.forEach(cb => cb(this._auth));
  }

  // 登录
  async login(email, password) {
    const endpoint = syncConfig.cloudEndpoint || "https://your-sync-server.com";
    try {
      const resp = await fetch(`${endpoint.replace(/\/$/, "")}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const result = await resp.json();
      if (result.isSuccess && result.data) {
        const auth = {
          userId: result.data.userId,
          tenantId: result.data.tenantId || result.data.userId,
          accessToken: result.data.accessToken,
          refreshToken: result.data.refreshToken,
          expiresAt: result.data.expiresAt || (Date.now() + 7 * 24 * 60 * 60 * 1000)
        };
        await this.saveAuthState(auth);
        return { success: true, message: "登录成功" };
      }
      return { success: false, message: result.message || "登录失败" };
    } catch (err) {
      return { success: false, message: `网络错误: ${err.message}` };
    }
  }

  // 注册
  async register(email, password, displayName) {
    const endpoint = syncConfig.cloudEndpoint || "https://your-sync-server.com";
    try {
      const resp = await fetch(`${endpoint.replace(/\/$/, "")}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName })
      });
      const result = await resp.json();
      if (result.isSuccess && result.data) {
        const auth = {
          userId: result.data.userId,
          tenantId: result.data.tenantId || result.data.userId,
          accessToken: result.data.accessToken,
          refreshToken: result.data.refreshToken,
          expiresAt: result.data.expiresAt || (Date.now() + 7 * 24 * 60 * 60 * 1000)
        };
        await this.saveAuthState(auth);
        return { success: true, message: "注册成功" };
      }
      return { success: false, message: result.message || "注册失败" };
    } catch (err) {
      return { success: false, message: `网络错误: ${err.message}` };
    }
  }

  // 登出
  async logout() {
    await this.clearAuthState();
    return { success: true, message: "已登出" };
  }
}

// 创建全局实例
const syncAuthManager = new SyncAuthManager();
```

- [ ] **Step 2: 在文件末尾添加导出**

在 `window.SyncUI` 导出中添加 authManager：

```javascript
// 在 window.SyncUI 导出中添加 authManager
if (typeof window !== "undefined") {
  window.SyncUI = {
    initSyncUI,
    checkSyncStatus,
    handleSyncLogin,
    handleSyncNow,
    showSyncStatus,
    loadSyncSettings,
    saveSyncSettings,
    SYNC_STATUS,
    authManager: syncAuthManager,
  };
  window.SyncAuthManager = SyncAuthManager;
}
```

- [ ] **Step 3: 提交代码**

```bash
git add popup-sync.js
git commit -m "feat: 添加 SyncAuthManager 认证管理模块"
```

---

### Task 2: 修改 popup.html 添加登录/注册对话框 UI

**Files:**
- Modify: `popup.html:990-1030`

- [ ] **Step 1: 替换同步 tab 内的操作区**

将原有的 `sync-actions` 部分：
```html
<div class="sync-actions">
  <button class="btn sync-btn-export" id="btn-sync-export">📤 导出数据</button>
  <button class="btn sync-btn-import" id="btn-sync-import">📥 导入数据</button>
</div>
```

替换为：
```html
<!-- 未登录状态 - 云端同步区域 -->
<div id="sync-unauthenticated" style="display:none">
  <div class="sync-status-row">
    <span class="icon">🔐</span>
    <span class="label">未登录</span>
    <span class="value">登录后可在多设备间同步</span>
  </div>
  <div class="sync-actions">
    <button class="btn btn-primary" id="btn-sync-login">🔑 登录</button>
    <button class="btn btn-secondary" id="btn-sync-register">📝 注册</button>
  </div>
</div>

<!-- 已登录状态 - 云端同步区域 -->
<div id="sync-authenticated" style="display:none">
  <div class="sync-status-row">
    <span class="icon">✓</span>
    <span class="label">已登录</span>
    <span class="value" id="sync-tenant-id"></span>
  </div>

  <!-- 同步详情显示（仅在同步成功后显示） -->
  <div id="sync-detail" style="display:none;margin-top:8px;padding:10px;background:#f0fdf4;border-radius:6px;border:1px solid #bbf7d0;font-size:11px">
    <div id="sync-detail-content"></div>
  </div>

  <div class="sync-actions">
    <button class="btn btn-primary" id="btn-sync-now">🔄 立即同步</button>
    <button class="btn btn-secondary" id="btn-sync-logout">登出</button>
  </div>
</div>
```

- [ ] **Step 2: 在 tab-sync 闭合标签后添加对话框 HTML**

```html
<!-- 登录对话框 -->
<div class="modal-overlay" id="login-modal">
  <div class="modal" style="width:320px">
    <h3>🔑 登录</h3>
    <div class="form-group">
      <label>邮箱</label>
      <input type="email" id="login-email" placeholder="your@email.com" />
    </div>
    <div class="form-group">
      <label>密码</label>
      <input type="password" id="login-password" placeholder="••••••••" />
    </div>
    <div id="login-error" style="color:#dc2626;font-size:12px;display:none;margin-bottom:8px"></div>
    <div class="btn-row">
      <button class="btn btn-secondary" id="login-cancel">取消</button>
      <button class="btn btn-primary" id="login-submit">登录</button>
    </div>
  </div>
</div>

<!-- 注册对话框 -->
<div class="modal-overlay" id="register-modal">
  <div class="modal" style="width:320px">
    <h3>📝 注册</h3>
    <div class="form-group">
      <label>显示名称</label>
      <input type="text" id="register-display-name" placeholder="你的昵称" />
    </div>
    <div class="form-group">
      <label>邮箱</label>
      <input type="email" id="register-email" placeholder="your@email.com" />
    </div>
    <div class="form-group">
      <label>密码 <span style="font-weight:normal;color:#9ca3af">(至少6位)</span></label>
      <input type="password" id="register-password" placeholder="••••••••" />
    </div>
    <div id="register-error" style="color:#dc2626;font-size:12px;display:none;margin-bottom:8px"></div>
    <div class="btn-row">
      <button class="btn btn-secondary" id="register-cancel">取消</button>
      <button class="btn btn-primary" id="register-submit">注册</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: 提交代码**

```bash
git add popup.html
git commit -m "feat: 添加登录/注册对话框 UI 和同步详情显示区"
```

---

### Task 3: 在 popup.js 中绑定登录/注册事件

**Files:**
- Modify: `popup.js`

- [ ] **Step 1: 在 popup.js 文件末尾添加事件绑定代码**

```javascript
// ── 同步登录/注册事件绑定 ─────────────────────
async function initSyncAuth() {
  // 加载认证状态
  await syncAuthManager.loadAuthState();
  updateSyncAuthUI();

  // 监听认证状态变更
  syncAuthManager.addListener(updateSyncAuthUI);

  // 登录按钮（云端同步区域）
  document.getElementById("btn-sync-login")?.addEventListener("click", () => {
    document.getElementById("login-modal").classList.add("open");
  });

  // 注册按钮
  document.getElementById("btn-sync-register")?.addEventListener("click", () => {
    document.getElementById("register-modal").classList.add("open");
  });

  // 登录对话框关闭
  document.getElementById("login-cancel")?.addEventListener("click", () => {
    document.getElementById("login-modal").classList.remove("open");
  });

  // 注册对话框关闭
  document.getElementById("register-cancel")?.addEventListener("click", () => {
    document.getElementById("register-modal").classList.remove("open");
  });

  // 登录提交
  document.getElementById("login-submit")?.addEventListener("click", handleLoginSubmit);

  // 注册提交
  document.getElementById("register-submit")?.addEventListener("click", handleRegisterSubmit);

  // 登出按钮
  document.getElementById("btn-sync-logout")?.addEventListener("click", handleLogout);

  // 立即同步按钮（云端同步，需登录）
  document.getElementById("btn-sync-now")?.addEventListener("click", handleCloudSync);

  // 点击对话框背景关闭
  document.getElementById("login-modal")?.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay")) {
      e.target.classList.remove("open");
    }
  });
  document.getElementById("register-modal")?.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay")) {
      e.target.classList.remove("open");
    }
  });
}

// 更新同步区域 UI 状态
function updateSyncAuthUI() {
  const unauthEl = document.getElementById("sync-unauthenticated");
  const authEl = document.getElementById("sync-authenticated");
  const tenantEl = document.getElementById("sync-tenant-id");

  if (syncAuthManager.isLoggedIn()) {
    unauthEl.style.display = "none";
    authEl.style.display = "block";
    const auth = syncAuthManager.getAuth();
    if (tenantEl && auth) {
      tenantEl.textContent = `租户: ${auth.tenantId || auth.userId}`;
    }
  } else {
    unauthEl.style.display = "block";
    authEl.style.display = "none";
  }
}

// 处理登录提交
async function handleLoginSubmit() {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  const submitBtn = document.getElementById("login-submit");

  if (!email || !password) {
    errorEl.textContent = "请填写邮箱和密码";
    errorEl.style.display = "block";
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "登录中...";
  errorEl.style.display = "none";

  const result = await syncAuthManager.login(email, password);
  if (result.success) {
    document.getElementById("login-modal").classList.remove("open");
    document.getElementById("login-email").value = "";
    document.getElementById("login-password").value = "";
  } else {
    errorEl.textContent = result.message;
    errorEl.style.display = "block";
  }

  submitBtn.disabled = false;
  submitBtn.textContent = "登录";
}

// 处理注册提交
async function handleRegisterSubmit() {
  const displayName = document.getElementById("register-display-name").value.trim();
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;
  const errorEl = document.getElementById("register-error");
  const submitBtn = document.getElementById("register-submit");

  if (!displayName || !email || password.length < 6) {
    errorEl.textContent = "请填写完整信息，密码至少6位";
    errorEl.style.display = "block";
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "注册中...";
  errorEl.style.display = "none";

  const result = await syncAuthManager.register(email, password, displayName);
  if (result.success) {
    document.getElementById("register-modal").classList.remove("open");
    document.getElementById("register-display-name").value = "";
    document.getElementById("register-email").value = "";
    document.getElementById("register-password").value = "";
  } else {
    errorEl.textContent = result.message;
    errorEl.style.display = "block";
  }

  submitBtn.disabled = false;
  submitBtn.textContent = "注册";
}

// 处理登出
async function handleLogout() {
  await syncAuthManager.logout();
  // 隐藏同步详情
  document.getElementById("sync-detail").style.display = "none";
}

// 处理云端同步（需登录）
async function handleCloudSync() {
  if (!syncAuthManager.isLoggedIn()) {
    document.getElementById("login-modal").classList.add("open");
    return;
  }
  // 调用原有的同步逻辑
  await handleSyncNow();
}
```

- [ ] **Step 2: 在 init() 函数末尾添加初始化调用**

在 `init()` 函数最后添加：

```javascript
// 初始化同步登录
initSyncAuth();
```

- [ ] **Step 3: 提交代码**

```bash
git add popup.js
git commit -m "feat: 绑定登录/注册对话框事件"
```

---

### Task 4: 修改 popup-sync.js 的同步逻辑，显示详细统计

**Files:**
- Modify: `popup-sync.js`

- [ ] **Step 1: 修改 handleSyncNow 函数，显示详细统计**

找到 `handleSyncNow` 函数，替换为：

```javascript
async function handleSyncNow() {
  console.log("[Popup-Sync] 执行立即同步");

  if (!syncAuthManager.isLoggedIn()) {
    document.getElementById("login-modal").classList.add("open");
    return { success: false, message: "请先登录" };
  }

  const msgEl = document.getElementById("sync-msg");
  const detailEl = document.getElementById("sync-detail");
  const detailContentEl = document.getElementById("sync-detail-content");

  try {
    // 更新 UI 状态
    if (msgEl) {
      msgEl.textContent = "正在同步...";
      msgEl.style.color = "#6b7280";
    }

    // 导出数据
    const exportResult = await syncService.exportData();
    const jsonData = exportResult.json;
    const localStats = exportResult.stats;

    // 上传到云端（带认证）
    const uploadResult = await uploadToCloudWithAuth(jsonData, localStats);
    if (!uploadResult.success) {
      throw new Error(uploadResult.message);
    }

    // 更新同步时间
    await syncService.updateSyncMetadata({
      lastSyncTime: new Date().toISOString(),
      lastSyncStatus: "cloud_sync",
    });

    // 刷新状态
    await checkSyncStatus();

    // 显示详细统计（只显示有变更的类型）
    if (uploadResult.stats) {
      detailContentEl.innerHTML = formatSyncDetail(uploadResult.stats);
      detailEl.style.display = "block";
    }

    if (msgEl) {
      msgEl.textContent = "✓ 同步完成";
      msgEl.style.color = "#059669";
      setTimeout(() => {
        msgEl.textContent = "";
      }, 3000);
    }

    console.log("[Popup-Sync] 同步完成");
    return { success: true, message: "同步成功", stats: uploadResult.stats };
  } catch (err) {
    console.error("[Popup-Sync] 同步失败:", err);

    if (msgEl) {
      msgEl.textContent = `同步失败: ${err.message}`;
      msgEl.style.color = "#dc2626";
    }

    showSyncError();
    detailEl.style.display = "none";

    return { success: false, message: err.message };
  }
}

/**
 * 格式化同步详情显示（只显示有变更的类型）
 * @param {Object} stats - 服务器返回的统计信息
 */
function formatSyncDetail(stats) {
  const lines = [];
  const now = new Date();
  lines.push(`<div style="margin-bottom:8px;color:#059669;font-weight:600">✓ 同步完成（${now.toLocaleString("zh-CN")}）</div>`);

  // 推送变更 - 只显示有数据的类型
  const pushItems = [];
  if (stats.push) {
    if (stats.push.replyRules > 0) pushItems.push(`知识库 ${stats.push.replyRules} 条`);
    if (stats.push.aiConfigs > 0) pushItems.push(`AI模型 ${stats.push.aiConfigs} 条`);
    if (stats.push.rooms > 0) pushItems.push(`房源 ${stats.push.rooms} 条`);
    if (stats.push.userStyle > 0) pushItems.push(`风格画像 ${stats.push.userStyle} 条`);
    if (stats.push.propInfo > 0) pushItems.push(`房源配置 ${stats.push.propInfo} 条`);
    if (stats.push.mhaConfig > 0) pushItems.push(`助手配置 ${stats.push.mhaConfig} 条`);
    if (stats.push.settings > 0) pushItems.push(`设置 ${stats.push.settings} 条`);
  }

  if (pushItems.length > 0) {
    lines.push(`<div style="margin-top:4px"><span style="color:#7c3aed">📤 推送:</span> ${pushItems.join("，")}</div>`);
  }

  // 拉取变更 - 只显示有数据的类型
  const pullItems = [];
  if (stats.pull) {
    if (stats.pull.replyRules > 0) pullItems.push(`知识库 ${stats.pull.replyRules} 条`);
    if (stats.pull.aiConfigs > 0) pullItems.push(`AI模型 ${stats.pull.aiConfigs} 条`);
    if (stats.pull.rooms > 0) pullItems.push(`房源 ${stats.pull.rooms} 条`);
    if (stats.pull.userStyle > 0) pullItems.push(`风格画像 ${stats.pull.userStyle} 条`);
    if (stats.pull.propInfo > 0) pullItems.push(`房源配置 ${stats.pull.propInfo} 条`);
    if (stats.pull.mhaConfig > 0) pullItems.push(`助手配置 ${stats.pull.mhaConfig} 条`);
    if (stats.pull.settings > 0) pullItems.push(`设置 ${stats.pull.settings} 条`);
  }

  if (pullItems.length > 0) {
    lines.push(`<div style="margin-top:4px"><span style="color:#2563eb">📥 拉取:</span> ${pullItems.join("，")}</div>`);
  }

  return lines.join("");
}

/**
 * 带认证上传到云端
 * @param {string} jsonData - JSON 数据
 * @param {Object} localStats - 本地统计数据
 */
async function uploadToCloudWithAuth(jsonData, localStats) {
  const { cloudEndpoint } = syncConfig;
  const token = syncAuthManager.getAccessToken();

  if (!cloudEndpoint || !token) {
    return { success: false, message: "未登录或未配置云端" };
  }

  try {
    const url = `${cloudEndpoint.replace(/\/$/, "")}/sync/upload`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        data: jsonData,
        timestamp: new Date().toISOString(),
        deviceId: await getDeviceId(),
        localStats: localStats
      }),
    });

    if (resp.ok) {
      const result = await resp.json();
      return {
        success: true,
        message: "上传成功",
        stats: result.stats || {}
      };
    } else {
      const err = await resp.json().catch(() => ({}));
      // 401 时清除登录状态
      if (resp.status === 401) {
        await syncAuthManager.clearAuthState();
        return { success: false, message: "登录已过期，请重新登录" };
      }
      return { success: false, message: err.message || `上传失败: ${resp.status}` };
    }
  } catch (err) {
    return { success: false, message: `网络错误: ${err.message}` };
  }
}
```

- [ ] **Step 2: 提交代码**

```bash
git add popup-sync.js
git commit -m "feat: 实现同步详情显示和带认证上传"
```

---

### Task 5: 修改 sync-service.js 返回详细统计信息

**Files:**
- Modify: `sync-service.js`

- [ ] **Step 1: 修改 exportData 返回统计信息**

找到 `exportData` 方法，返回前添加统计：

```javascript
async exportData() {
  // ... 现有代码保持不变，直到 return JSON.stringify ...

  // 添加导出统计
  const statsByType = {};
  for (const key of this.SYNC_KEYS) {
    if (data[key] !== undefined) {
      const value = data[key];
      if (Array.isArray(value)) {
        statsByType[key] = value.length;
      } else if (typeof value === "object") {
        statsByType[key] = Object.keys(value).length;
      } else {
        statsByType[key] = 1;
      }
    }
  }

  return {
    json: JSON.stringify(exportPackage, null, 2),
    stats: statsByType
  };
}
```

- [ ] **Step 2: 提交代码**

```bash
git add sync-service.js
git commit -m "feat: exportData 返回详细统计信息"
```

---

## 验收标准

1. ✅ 未登录时点击"立即同步"，弹出登录对话框
2. ✅ 可以注册新账号
3. ✅ 可以登录已有账号
4. ✅ 登录状态持久化，刷新页面后保持登录
5. ✅ 云端同步后显示详细的推送/拉取变更（只显示有变更的类型）
6. ✅ 登出后清除登录状态
7. ✅ 本地导出/导入无需登录