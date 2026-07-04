/**
 * MyHostex 智能回复助手 - popup-sync.js
 * 负责：同步 UI 初始化、状态检查、云端同步、登录管理
 */

// ── 同步状态常量 ──────────────────────────────
const SYNC_STATUS = {
  NEVER: "never",
  SYNCED: "synced",
  PENDING: "pending",
  SYNCING: "syncing",
  ERROR: "error",
};

const SYNC_CONFIG_KEY = "sync_config";

// ── 认证状态存储键 ───────────────────────────
const SYNC_AUTH_KEY = "sync_auth";

// ── 网络请求工具函数 ──────────────────────────
/**
 * 带超时的 fetch 包装器
 * @param {string} url - 请求 URL
 * @param {object} options - fetch 选项
 * @param {number} timeoutMs - 超时毫秒数 (默认 15s)
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
    });
    return resp;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 分类 fetch 错误并返回用户友好的中文消息
 * @param {Error} err - fetch 抛出的错误
 * @param {string} url - 请求的 URL
 * @returns {{ type: string, message: string }}
 */
function classifyFetchError(err, url) {
  if (err.name === "AbortError") {
    return { type: "timeout", message: `连接超时，服务器无响应，请检查云端地址是否正确` };
  }
  const msg = (err.message || "").toLowerCase();
  if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network error")) {
    return { type: "network", message: `无法连接到服务器 ${url}，请检查网络连接和云端地址` };
  }
  if (msg.includes("cors") || msg.includes("cross-origin")) {
    return { type: "cors", message: `CORS 请求被拦截，请在扩展管理页面添加域名权限` };
  }
  if (msg.includes("enotfound") || msg.includes("dns") || msg.includes("getaddrinfo")) {
    return { type: "dns", message: `无法解析服务器域名，请检查云端地址是否正确` };
  }
  if (msg.includes("econnrefused") || msg.includes("connection refused")) {
    return { type: "refused", message: `服务器拒绝连接，请确认服务器是否正在运行` };
  }
  if (msg.includes("etimedout") || msg.includes("timeout")) {
    return { type: "timeout", message: `连接服务器超时，请检查网络或稍后重试` };
  }
  return { type: "unknown", message: err.message || "未知网络错误" };
}

/**
 * 带重试机制的请求
 * @param {Function} fn - 需要重试的异步函数
 * @param {number} maxRetries - 最大重试次数 (默认 1)
 * @param {number} delayMs - 重试间隔毫秒 (默认 1s)
 * @returns {Promise<any>}
 */
async function withRetry(fn, maxRetries = 1, delayMs = 1000) {
  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < maxRetries) {
        console.log(`[SyncAuth] 请求失败，${delayMs}ms 后重试 (${i + 1}/${maxRetries}):`, err.message);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError;
}

// ── SyncAuthManager ─────────────────────────
class SyncAuthManager {
  constructor() {
    this._auth = null;
    this._listeners = [];
  }

  getAuth() { return this._auth; }

  isLoggedIn() { return this._auth !== null && this._auth.expiresAt > Date.now(); }

  getAccessToken() { return this._auth?.accessToken || null; }

  getTenantId() { return this._auth?.tenantId || null; }

  async loadAuthState() {
    try {
      const result = await chrome.storage.local.get(SYNC_AUTH_KEY);
      if (result[SYNC_AUTH_KEY]) {
        this._auth = result[SYNC_AUTH_KEY];
        if (this._auth.expiresAt <= Date.now()) { this._auth = null; }
      }
      return this._auth;
    } catch (err) {
      console.error("[SyncAuth] 加载认证状态失败:", err);
      return null;
    }
  }

  async saveAuthState(auth) {
    this._auth = auth;
    await chrome.storage.local.set({ [SYNC_AUTH_KEY]: auth });
    this._notifyListeners();
  }

  async clearAuthState() {
    this._auth = null;
    await chrome.storage.local.remove(SYNC_AUTH_KEY);
    this._notifyListeners();
  }

  addListener(callback) { this._listeners.push(callback); }
  removeListener(callback) { this._listeners = this._listeners.filter(l => l !== callback); }
  _notifyListeners() { this._listeners.forEach(cb => cb(this._auth)); }

  async login(email, password) {
    // 使用可配置的云端地址，默认 csBaby
    const baseEndpoint = syncConfig.cloudEndpoint || APP_CONFIG.CLOUD_ENDPOINT;
    const endpoint = baseEndpoint.replace(/\/+$/, "");
    const url = `${endpoint}${APP_CONFIG.AUTH.LOGIN}`;
    console.log("[SyncAuth] 登录请求:", url);

    try {
      const resp = await withRetry(async () => {
        return await fetchWithTimeout(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
          mode: "cors",
        });
      }, 1, 1500);

      let result;
      try {
        result = await resp.json();
      } catch (parseErr) {
        // 服务器返回了非 JSON 响应（如 Render 休眠页）
        console.error("[SyncAuth] 响应解析失败, status:", resp.status, "body 不是 JSON");
        return { success: false, message: `服务器返回异常 (HTTP ${resp.status})，请确认服务器地址是否正确` };
      }

      console.log("[SyncAuth] 登录响应:", result);
      // 适配 csBaby 服务器格式: {"code": 0, "data": {...}} 或 {"isSuccess": true, "data": {...}}
      if ((result.code === 0 || result.isSuccess) && result.data) {
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
      return { success: false, message: result.message || "登录失败，请检查邮箱和密码" };
    } catch (err) {
      console.error("[SyncAuth] 登录失败:", err);
      const classified = classifyFetchError(err, url);
      let message = `网络错误: ${classified.message}`;
      // 对已知的连接类错误，提示用户检查配置
      if (classified.type === "network" || classified.type === "timeout" || classified.type === "dns") {
        message += `\n当前云端地址: ${endpoint}`;
      }
      return { success: false, message };
    }
  }

  async register(email, password, displayName) {
    // 使用可配置的云端地址，默认 csBaby
    const baseEndpoint = syncConfig.cloudEndpoint || APP_CONFIG.CLOUD_ENDPOINT;
    const endpoint = baseEndpoint.replace(/\/+$/, "");
    const url = `${endpoint}${APP_CONFIG.AUTH.REGISTER}`;
    console.log("[SyncAuth] 注册请求:", url);

    try {
      const resp = await withRetry(async () => {
        return await fetchWithTimeout(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, displayName }),
          mode: "cors",
        });
      }, 1, 1500);

      let result;
      try {
        result = await resp.json();
      } catch (parseErr) {
        return { success: false, message: `服务器返回异常 (HTTP ${resp.status})，请确认服务器地址是否正确` };
      }

      console.log("[SyncAuth] 注册响应:", result);
      // 适配 csBaby 服务器格式: {"code": 0, "data": {...}} 或 {"isSuccess": true, "data": {...}}
      if ((result.code === 0 || result.isSuccess) && result.data) {
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
      console.error("[SyncAuth] 注册失败:", err);
      const classified = classifyFetchError(err, url);
      return { success: false, message: `网络错误: ${classified.message}` };
    }
  }

  async logout() {
    await this.clearAuthState();
    return { success: true, message: "已登出" };
  }

  /**
   * 如果 token 即将过期（5分钟内），自动刷新
   * @returns {Promise<boolean>} 是否刷新成功
   */
  async refreshTokenIfNeeded() {
    if (!this._auth?.refreshToken) return false;

    const fiveMinutes = 5 * 60 * 1000;
    if (this._auth.expiresAt - Date.now() > fiveMinutes) return false;

    try {
      const baseEndpoint = syncConfig.cloudEndpoint || APP_CONFIG.CLOUD_ENDPOINT;
      const endpoint = baseEndpoint.replace(/\/+$/, "");
      const url = `${endpoint}${APP_CONFIG.AUTH.REFRESH}`;
      const resp = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: this._auth.refreshToken }),
      }, 10000);

      let result;
      try {
        result = await resp.json();
      } catch {
        return false;
      }

      if (result.isSuccess && result.data) {
        const auth = {
          userId: result.data.userId,
          tenantId: result.data.tenantId || result.data.userId,
          accessToken: result.data.accessToken,
          refreshToken: result.data.refreshToken || this._auth.refreshToken,
          expiresAt: result.data.expiresAt || (Date.now() + 7 * 24 * 60 * 60 * 1000)
        };
        await this.saveAuthState(auth);
        return true;
      }
    } catch (err) {
      console.error("[SyncAuth] Token 刷新失败:", err);
    }
    return false;
  }
}

const syncAuthManager = new SyncAuthManager();

// ── 全局状态 ──────────────────────────────────
let syncConfig = {
  enabled: false,
  cloudEndpoint: "",
  apiKey: "",
  autoSync: false,
  syncInterval: 5 * 60 * 1000, // 5分钟
  lastSyncTime: null,
};

// ── 初始化同步 UI ─────────────────────────────
/**
 * 初始化同步 UI，绑定事件监听器
 */
async function initSyncUI() {
  console.log("[Popup-Sync] 初始化同步 UI");

  // 加载同步配置
  await loadSyncSettings();

  // 绑定云端地址输入 - 实时保存
  const cloudEndpointInput = document.getElementById("sync-cloud-endpoint");
  if (cloudEndpointInput) {
    // 加载时填入已有地址
    if (syncConfig.cloudEndpoint) {
      cloudEndpointInput.value = syncConfig.cloudEndpoint;
    }
    cloudEndpointInput.addEventListener("change", async () => {
      const endpoint = cloudEndpointInput.value.trim();
      syncConfig.cloudEndpoint = endpoint;
      await chrome.storage.local.set({ [SYNC_CONFIG_KEY]: syncConfig });
      console.log("[Popup-Sync] 云端地址已更新:", endpoint);
    });
  }

  // 绑定导出按钮
  const exportBtn = document.getElementById("btn-sync-export");
  if (exportBtn) {
    exportBtn.addEventListener("click", handleExportData);
  }

  // 绑定导入按钮
  const importBtn = document.getElementById("btn-sync-import");
  if (importBtn) {
    importBtn.addEventListener("click", handleImportData);
  }

  // 检查同步状态
  await checkSyncStatus();

  console.log("[Popup-Sync] 同步 UI 初始化完成");
}

// ── 检查同步状态 ─────────────────────────────
/**
 * 检查当前同步状态并更新 UI
 * @returns {Promise<{status: string, metadata: Object}>}
 */
async function checkSyncStatus() {
  console.log("[Popup-Sync] 检查同步状态");

  try {
    // 获取同步元数据
    const metadata = await syncService.getSyncMetadata();
    const stats = await syncService.getStorageStats();

    // 更新上次同步时间
    const lastTimeEl = document.getElementById("sync-last-time");
    if (lastTimeEl) {
      if (metadata.lastSyncTime) {
        const date = new Date(metadata.lastSyncTime);
        lastTimeEl.textContent = date.toLocaleString("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      } else {
        lastTimeEl.textContent = "从未同步";
      }
    }

    // 更新数据统计
    const totalKeys = Object.keys(stats.byKey).filter(
      (k) => stats.byKey[k].type !== "empty"
    ).length;
    const dataCountEl = document.getElementById("sync-data-count");
    if (dataCountEl) {
      dataCountEl.textContent = `${totalKeys} 个模块（${stats.totalItems} 条记录）`;
    }

    // 更新同步状态徽章
    await showSyncStatus(metadata);

    return {
      status: getSyncStatus(metadata),
      metadata,
    };
  } catch (err) {
    console.error("[Popup-Sync] 检查同步状态失败:", err);
    showSyncError();
    return { status: SYNC_STATUS.ERROR, metadata: null };
  }
}

/**
 * 根据元数据判断同步状态
 */
function getSyncStatus(metadata) {
  if (!metadata.lastSyncTime) {
    return SYNC_STATUS.NEVER;
  }

  const lastSync = new Date(metadata.lastSyncTime);
  const now = new Date();
  const hoursDiff = (now - lastSync) / (1000 * 60 * 60);

  // 24小时内视为已同步
  if (hoursDiff < 24) {
    return SYNC_STATUS.SYNCED;
  }

  // 超过24小时需要更新
  return SYNC_STATUS.PENDING;
}

/**
 * 显示同步状态徽章
 * @param {Object} metadata - 同步元数据
 */
async function showSyncStatus(metadata) {
  const badge = document.getElementById("sync-status-badge");
  if (!badge) return;

  const status = getSyncStatus(metadata);
  badge.className = "sync-badge";

  switch (status) {
    case SYNC_STATUS.SYNCED:
      badge.textContent = "已同步";
      badge.classList.add("synced");
      break;
    case SYNC_STATUS.PENDING:
      badge.textContent = "需更新";
      badge.classList.add("pending");
      break;
    case SYNC_STATUS.NEVER:
      badge.textContent = "未同步";
      badge.classList.add("pending");
      break;
    case SYNC_STATUS.ERROR:
      badge.textContent = "同步失败";
      badge.classList.add("error");
      break;
    default:
      badge.textContent = "未知";
      badge.classList.add("pending");
  }

  console.log("[Popup-Sync] 同步状态:", status);
}

/**
 * 显示同步错误状态
 */
function showSyncError() {
  const badge = document.getElementById("sync-status-badge");
  if (badge) {
    badge.textContent = "同步失败";
    badge.className = "sync-badge error";
  }
}

// ── 处理同步登录 ─────────────────────────────
/**
 * 处理云端同步登录
 * @param {string} endpoint - 云端 API 端点
 * @param {string} apiKey - API 密钥
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function handleSyncLogin(endpoint, apiKey) {
  console.log("[Popup-Sync] 处理同步登录:", endpoint);

  if (!endpoint || !apiKey) {
    return { success: false, message: "请提供云端地址和 API 密钥" };
  }

  try {
    // 验证连接
    const testResult = await testCloudConnection(endpoint, apiKey);
    if (!testResult.success) {
      return testResult;
    }

    // 保存配置
    syncConfig = {
      ...syncConfig,
      enabled: true,
      cloudEndpoint: endpoint,
      apiKey: apiKey,
    };

    await chrome.storage.local.set({
      [SYNC_CONFIG_KEY]: syncConfig,
    });

    console.log("[Popup-Sync] 同步登录成功");
    return { success: true, message: "连接成功" };
  } catch (err) {
    console.error("[Popup-Sync] 同步登录失败:", err);
    return { success: false, message: `连接失败: ${err.message}` };
  }
}

/**
 * 测试云端连接
 * @param {string} endpoint - API 端点
 * @param {string} apiKey - API 密钥
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function testCloudConnection(endpoint, apiKey) {
  try {
    const url = `${endpoint.replace(/\/$/, "")}/health`;
    const resp = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    }, 10000);

    if (resp.ok) {
      return { success: true, message: "连接成功" };
    } else if (resp.status === 401) {
      return { success: false, message: "API 密钥无效" };
    } else {
      return { success: false, message: `服务器错误: ${resp.status}` };
    }
  } catch (err) {
    const classified = classifyFetchError(err, url);
    return { success: false, message: `网络错误: ${classified.message}` };
  }
}

// ── 处理立即同步 ─────────────────────────────
/**
 * 处理立即同步操作
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function handleSyncNow() {
  console.log("[Popup-Sync] 执行立即同步");

  // 确保同步配置和认证状态已加载
  await loadSyncSettings();
  await syncAuthManager.loadAuthState();

  // 检查登录状态
  if (!syncAuthManager.isLoggedIn()) {
    const msgEl = document.getElementById("sync-msg");
    if (msgEl) {
      msgEl.textContent = "请先登录后再同步";
      msgEl.style.color = "#f59e0b";
    }
    document.getElementById("login-modal")?.classList.add("open");
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
    if (detailEl) detailEl.style.display = "none";

    return { success: false, message: err.message };
  }
}

/**
 * 格式化同步详情显示（只显示有变更的类型）
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
    lines.push(`<div style="margin-top:4px"><span style="color:#7c3aed">📤 推送:</span> ${escapeHtml(pushItems.join("，"))}</div>`);
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
    lines.push(`<div style="margin-top:4px"><span style="color:#2563eb">📥 拉取:</span> ${escapeHtml(pullItems.join("，"))}</div>`);
  }

  return lines.join("");
}

/**
 * HTML 转义（防止 XSS）
 */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * 带认证上传到云端
 */
async function uploadToCloudWithAuth(jsonData, localStats) {
  // 使用可配置的云端地址，默认 APP_CONFIG.CLOUD_ENDPOINT
  const endpoint = (syncConfig.cloudEndpoint || APP_CONFIG.CLOUD_ENDPOINT).replace(/\/+$/, "");

  // 尝试刷新 token（如果即将过期）
  await syncAuthManager.refreshTokenIfNeeded();

  const token = syncAuthManager.getAccessToken();
  if (!token) {
    console.error("[Sync] token 不存在");
    return { success: false, message: "未登录或未配置云端" };
  }

  try {
    const url = `${endpoint}${APP_CONFIG.SYNC.PUSH}`;
    const resp = await fetchWithTimeout(url, {
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
    }, 30000);

    if (resp.ok) {
      const result = await resp.json();
      return { success: true, message: "上传成功", stats: result.stats || {} };
    } else {
      const err = await resp.json().catch(() => ({}));
      if (resp.status === 401) {
        await syncAuthManager.clearAuthState();
        return { success: false, message: "登录已过期，请重新登录" };
      }
      return { success: false, message: err.message || `上传失败: ${resp.status}` };
    }
  } catch (err) {
    const classified = classifyFetchError(err, endpoint + "/sync/push");
    return { success: false, message: `同步失败: ${classified.message}` };
  }
}

/**
 * 上传数据到云端
 * @param {string} jsonData - JSON 数据
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function uploadToCloud(jsonData) {
  const { cloudEndpoint, apiKey } = syncConfig;

  if (!cloudEndpoint || !apiKey) {
    return { success: false, message: "未配置云端同步" };
  }

  try {
    const url = `${cloudEndpoint.replace(/\/$/, "")}/sync/upload`;
    const resp = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        data: jsonData,
        timestamp: new Date().toISOString(),
        deviceId: await getDeviceId(),
      }),
    }, 30000);

    if (resp.ok) {
      return { success: true, message: "上传成功" };
    } else {
      const err = await resp.json().catch(() => ({}));
      return { success: false, message: err.message || `上传失败: ${resp.status}` };
    }
  } catch (err) {
    const classified = classifyFetchError(err, `${cloudEndpoint.replace(/\/$/, "")}/sync/upload`);
    return { success: false, message: `网络错误: ${classified.message}` };
  }
}

/**
 * 从云端下载数据
 * @returns {Promise<{success: boolean, data: string, message: string}>}
 */
async function downloadFromCloud() {
  const { cloudEndpoint, apiKey } = syncConfig;

  if (!cloudEndpoint || !apiKey) {
    return { success: false, data: null, message: "未配置云端同步" };
  }

  try {
    const url = `${cloudEndpoint.replace(/\/$/, "")}/sync/download`;
    const resp = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }, 30000);

    if (resp.ok) {
      const result = await resp.json();
      return { success: true, data: result.data, message: "下载成功" };
    } else {
      const err = await resp.json().catch(() => ({}));
      return { success: false, data: null, message: err.message || `下载失败: ${resp.status}` };
    }
  } catch (err) {
    const classified = classifyFetchError(err, `${cloudEndpoint.replace(/\/$/, "")}/sync/download`);
    return { success: false, data: null, message: `网络错误: ${classified.message}` };
  }
}

/**
 * 获取设备 ID
 * @returns {Promise<string>}
 */
async function getDeviceId() {
  const metadata = await syncService.getSyncMetadata();
  return metadata.deviceId || "unknown";
}

// ── 导出数据 ────────────────────────────────
/**
 * 处理数据导出
 */
async function handleExportData() {
  const msgEl = document.getElementById("sync-msg");

  try {
    if (msgEl) {
      msgEl.textContent = "正在导出数据...";
      msgEl.style.color = "#6b7280";
    }

    const exportResult = await syncService.exportData();
    const jsonData = exportResult.json;

    // 创建下载
    const blob = new Blob([jsonData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    a.href = url;
    a.download = `myhostex-backup-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // 更新同步状态
    await syncService.updateSyncMetadata({
      lastSyncTime: new Date().toISOString(),
      lastSyncStatus: "export",
    });

    if (msgEl) {
      msgEl.textContent = "导出成功";
      msgEl.style.color = "#059669";
      setTimeout(() => {
        msgEl.textContent = "";
      }, 3000);
    }

    // 刷新状态
    await checkSyncStatus();

    console.log("[Popup-Sync] 数据导出成功");
  } catch (err) {
    console.error("[Popup-Sync] 导出失败:", err);
    if (msgEl) {
      msgEl.textContent = `导出失败: ${err.message}`;
      msgEl.style.color = "#dc2626";
    }
  }
}

// ── 导入数据 ────────────────────────────────
/**
 * 处理数据导入
 */
async function handleImportData() {
  // 创建文件输入
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";

  input.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const msgEl = document.getElementById("sync-msg");

    try {
      if (msgEl) {
        msgEl.textContent = "正在读取文件...";
        msgEl.style.color = "#6b7280";
      }

      const text = await file.text();

      // 验证格式
      const validation = syncService.validateImportData(text);
      if (!validation.valid) {
        if (msgEl) {
          msgEl.textContent = `无效文件: ${validation.error}`;
          msgEl.style.color = "#dc2626";
        }
        return;
      }

      // 询问合并策略
      const merge = confirm(
        "导入模式选择:\n\n确定: 合并模式（保留已有数据，新增数据合并）\n取消: 覆盖模式（完全替换为导入数据）\n\n建议首次导入选择确定，后续同步选择取消覆盖。"
      );

      if (msgEl) {
        msgEl.textContent = "正在导入数据...";
      }

      const result = await syncService.importData(text, { merge });

      // 更新同步状态
      await syncService.updateSyncMetadata({
        lastSyncTime: new Date().toISOString(),
        lastSyncStatus: "import",
      });

      if (msgEl) {
        msgEl.textContent = `导入成功！新增 ${result.imported} 项，跳过 ${result.skipped} 项`;
        msgEl.style.color = "#059669";
        setTimeout(() => {
          msgEl.textContent = "";
        }, 5000);
      }

      // 刷新页面数据（触发主 popup.js 的 init）
      if (typeof init === "function") {
        await init();
      }

      console.log("[Popup-Sync] 数据导入成功:", result);
    } catch (err) {
      console.error("[Popup-Sync] 导入失败:", err);
      if (msgEl) {
        msgEl.textContent = `导入失败: ${err.message}`;
        msgEl.style.color = "#dc2626";
      }
    }
  });

  input.click();
}

// ── 加载同步设置 ─────────────────────────────
/**
 * 加载同步设置
 * @returns {Promise<Object>}
 */
async function loadSyncSettings() {
  console.log("[Popup-Sync] 加载同步设置");

  try {
    const result = await chrome.storage.local.get(SYNC_CONFIG_KEY);
    if (result[SYNC_CONFIG_KEY]) {
      syncConfig = {
        ...syncConfig,
        ...result[SYNC_CONFIG_KEY],
      };
    }

    console.log("[Popup-Sync] 同步设置已加载:", syncConfig);
    return syncConfig;
  } catch (err) {
    console.error("[Popup-Sync] 加载同步设置失败:", err);
    return syncConfig;
  }
}

/**
 * 保存同步设置
 * @param {Object} config - 同步配置
 * @returns {Promise<void>}
 */
async function saveSyncSettings(config) {
  console.log("[Popup-Sync] 保存同步设置:", config);

  syncConfig = { ...syncConfig, ...config };

  await chrome.storage.local.set({
    [SYNC_CONFIG_KEY]: syncConfig,
  });

  console.log("[Popup-Sync] 同步设置已保存");
}

// ── 导出模块 ────────────────────────────────
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
}