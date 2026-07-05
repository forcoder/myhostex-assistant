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

// ── 网络工具与端点单一来源 ─────────────────────
/**
 * 识别字符串是否为大陆手机号（11 位、1 开头）
 * @param {string} s
 * @returns {boolean}
 */
function isPhone(s) {
  return /^1[3-9]\d{9}$/.test(String(s || "").trim());
}

/**
 * 获取当前生效的云端地址
 * 单一来源：syncConfig.cloudEndpoint（用户存储）→ APP_CONFIG.CLOUD_ENDPOINT（系统配置）
 * @returns {string}
 */
function getCloudEndpoint() {
  return (syncConfig.cloudEndpoint || APP_CONFIG.CLOUD_ENDPOINT || "").replace(/\/+$/, "");
}

/**
 * 对非 2xx HTTP 响应返回友好的中文消息
 * @param {Response} resp - fetch 响应
 * @param {string} endpoint - 云端地址
 * @returns {string}
 */
function classifyHttpStatus(resp, endpoint) {
  const status = resp.status;
  if (status === 404) {
    return `云端地址 ${endpoint} 无法访问登录接口 (HTTP 404)。请检查云端地址是否正确，或联系服务管理员确认接口路径`;
  }
  if (status === 401 || status === 403) {
    return "账号或密码错误";
  }
  if (status === 400) {
    return "请求参数有误，请检查输入的账号和密码";
  }
  if (status === 429) {
    return "请求过于频繁，请稍后再试";
  }
  if (status >= 500) {
    return `云端服务暂时不可用 (HTTP ${status})，请稍后重试`;
  }
  return `云端返回异常 (HTTP ${status})`;
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

  async login(account, password) {
    const endpoint = getCloudEndpoint();
    const url = `${endpoint}${APP_CONFIG.AUTH.LOGIN}`;
    console.log("[SyncAuth] 登录请求:", url, "账号:", isPhone(account) ? "手机号" : "邮箱");

    // 当前云端服务仅支持邮箱 + 密码：手机号提前给出明确提示，避免无效请求
    if (isPhone(account)) {
      return {
        success: false,
        message: "当前云端服务仅支持邮箱登录，请改用邮箱账号（手机号登录暂未开通）"
      };
    }

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: account, password }),
        mode: "cors"
      });

      let result;
      try {
        result = await resp.json();
      } catch (parseErr) {
        console.error("[SyncAuth] 响应解析失败, status:", resp.status);
        return { success: false, message: classifyHttpStatus(resp, endpoint) };
      }

      console.log("[SyncAuth] 登录响应:", result);

      if (!resp.ok) {
        const fromServer = result?.message || result?.msg;
        return { success: false, message: fromServer || classifyHttpStatus(resp, endpoint) };
      }

      // 适配 csBaby 服务器格式: {"code": 0, "data": {...}} 或 {"isSuccess": true, "data": {...}}
      if ((result.code === 0 || result.isSuccess) && result.data) {
        const auth = {
          account: account,
          userId: result.data.userId,
          tenantId: result.data.tenantId || result.data.userId,
          accessToken: result.data.accessToken,
          refreshToken: result.data.refreshToken,
          expiresAt: result.data.expiresAt || (Date.now() + 7 * 24 * 60 * 60 * 1000)
        };
        await this.saveAuthState(auth);
        return { success: true, message: "登录成功" };
      }
      return { success: false, message: result.message || "登录失败，请检查账号和密码" };
    } catch (err) {
      console.error("[SyncAuth] 登录失败:", err);
      return { success: false, message: `网络错误: ${err.message}\n当前云端地址: ${endpoint}` };
    }
  }

  async register(account, password, displayName) {
    const endpoint = getCloudEndpoint();
    const url = `${endpoint}${APP_CONFIG.AUTH.REGISTER}`;
    console.log("[SyncAuth] 注册请求:", url);

    if (isPhone(account)) {
      return {
        success: false,
        message: "当前云端服务仅支持邮箱注册，请改用邮箱账号（手机号注册暂未开通）"
      };
    }

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: account, password, displayName }),
        mode: "cors"
      });

      let result;
      try {
        result = await resp.json();
      } catch (parseErr) {
        console.error("[SyncAuth] 注册响应解析失败, status:", resp.status);
        return { success: false, message: classifyHttpStatus(resp, endpoint) };
      }

      console.log("[SyncAuth] 注册响应:", result);

      if (!resp.ok) {
        const fromServer = result?.message || result?.msg;
        return { success: false, message: fromServer || classifyHttpStatus(resp, endpoint) };
      }

      if ((result.code === 0 || result.isSuccess) && result.data) {
        const auth = {
          account: account,
          userId: result.data.userId,
          tenantId: result.data.tenantId || result.data.userId,
          accessToken: result.data.accessToken,
          refreshToken: result.data.refreshToken,
          expiresAt: result.data.expiresAt || (Date.now() + 7 * 24 * 60 * 60 * 1000)
        };
        await this.saveAuthState(auth);
        return { success: true, message: "注册成功" };
      }
      return { success: false, message: result.message || "注册失败，请检查账号信息" };
    } catch (err) {
      console.error("[SyncAuth] 注册失败:", err);
      return { success: false, message: `网络错误: ${err.message}\n当前云端地址: ${endpoint}` };
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
      const endpoint = getCloudEndpoint();
      const resp = await fetch(`${endpoint}${APP_CONFIG.AUTH.REFRESH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: this._auth.refreshToken })
      });
      const result = await resp.json();
      if (result.isSuccess && result.data) {
        const auth = {
          account: this._auth?.account,
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

    // 更新本地数据行 + 按模块明细 + 知识库规则列表
    renderLocalDataStats(stats);

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
 * 渲染本地数据统计：顶部"本地数据:N 个模块（M 条记录）"
 * + 按模块明细 + 知识库规则列表
 * @param {Object} stats - syncService.getStorageStats() 返回值
 */
async function renderLocalDataStats(stats) {
  // 顶部摘要
  const totalKeys = Object.keys(stats.byKey).filter(
    (k) => stats.byKey[k].type !== "empty"
  ).length;
  const localEl = document.getElementById("sync-data-count-local");
  if (localEl) {
    localEl.textContent = totalKeys
      ? `${totalKeys} 个模块（${stats.totalItems} 条记录）`
      : "暂无数据";
  }

  // 按模块明细
  const detailEl = document.getElementById("sync-local-detail");
  if (detailEl) {
    const labelMap = {
      mha_config: "助手配置",
      userStyle: "回复风格",
      rooms: "房源",
      propInfo: "房源信息",
      replyRules: "回复规则",
      aiConfig: "AI 配置（单）",
      aiConfigs: "AI 模型",
      knowledgeBase: "知识库",
      settings: "设置",
    };
    const items = [];
    for (const key of syncService.SYNC_KEYS) {
      const s = stats.byKey[key];
      if (!s || s.type === "empty") continue;
      const count = s.type === "array" ? s.count : (s.type === "object" ? s.keys : 1);
      items.push(
        `<span style="display:inline-block;margin:0 8px 4px 0">${labelMap[key] || key}：<b>${count}</b></span>`
      );
    }
    detailEl.innerHTML = items.length
      ? items.join("")
      : '<span style="color:#9ca3af">本地尚无同步数据</span>';
  }

  // 知识库规则列表
  await renderKnowledgeBaseList();
}

/**
 * 渲染知识库规则列表（读取 chrome.storage.local 的 knowledgeBase / replyRules）
 */
async function renderKnowledgeBaseList() {
  const container = document.getElementById("sync-rules-list");
  if (!container) return;

  // 知识库存在两份：knowledgeBase（详细含 trigger_type/status）、replyRules（导出 JSON 用）
  const result = await chrome.storage.local.get(["knowledgeBase", "replyRules"]);
  const rules = Array.isArray(result.knowledgeBase) && result.knowledgeBase.length > 0
    ? result.knowledgeBase
    : (Array.isArray(result.replyRules) ? result.replyRules : []);

  if (rules.length === 0) {
    container.innerHTML = '<div class="empty-tip" style="color:#9ca3af;text-align:center;padding:14px 0">暂无规则</div>';
    return;
  }

  const items = rules.map((r, idx) => {
    const enabled = r.status !== "禁用";
    const condRaw = (r.trigger_condition || "").replace(/^(?:关键字|关键词|keyword)[\s]*[:：][\s]*/i, "").trim();
    const reply = (r.reply_content || r.reply || "").slice(0, 80);
    const type = r.trigger_type || "关键词回复";
    const used = r.trigger_count || 0;
    const props = r.applicable_properties || "全部";
    return `
      <div style="display:flex;align-items:flex-start;gap:8px;padding:6px 4px;border-bottom:1px dashed #e5e7eb;${enabled ? '' : 'opacity:.55'}">
        <span style="flex-shrink:0;width:18px;height:18px;background:${enabled ? '#4f46e5' : '#9ca3af'};color:#fff;border-radius:50%;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center">${idx + 1}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;color:#1e1b4b;font-weight:600;word-break:break-all">${escapeHtmlSync(condRaw || '(无关键词)')}</div>
          <div style="font-size:11px;color:#6b7280;line-height:1.4;margin-top:2px;word-break:break-all">→ ${escapeHtmlSync(reply)}</div>
          <div style="font-size:10px;color:#9ca3af;margin-top:2px">📌 ${escapeHtmlSync(type)} · 适用：${escapeHtmlSync(props)} · 触发：${used} 次</div>
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = items;
}

/**
 * popup-sync.js 局部 HTML 转义（不依赖其他模块的 escapeHtml）
 */
function escapeHtmlSync(str) {
  const div = document.createElement("div");
  div.textContent = String(str || "");
  return div.innerHTML;
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
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (resp.ok) {
      return { success: true, message: "连接成功" };
    } else if (resp.status === 401) {
      return { success: false, message: "API 密钥无效" };
    } else {
      return { success: false, message: `服务器错误: ${resp.status}` };
    }
  } catch (err) {
    return { success: false, message: `网络错误: ${err.message}` };
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
  const endpoint = getCloudEndpoint();

  // 尝试刷新 token（如果即将过期）
  await syncAuthManager.refreshTokenIfNeeded();

  const token = syncAuthManager.getAccessToken();
  if (!token) {
    console.error("[Sync] token 不存在");
    return { success: false, message: "未登录或未配置云端" };
  }

  try {
    const url = `${endpoint}${APP_CONFIG.SYNC.PUSH}`;
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
    return { success: false, message: `网络错误: ${err.message}` };
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
    const resp = await fetch(url, {
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
    });

    if (resp.ok) {
      return { success: true, message: "上传成功" };
    } else {
      const err = await resp.json().catch(() => ({}));
      return { success: false, message: err.message || `上传失败: ${resp.status}` };
    }
  } catch (err) {
    return { success: false, message: `网络错误: ${err.message}` };
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
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (resp.ok) {
      const result = await resp.json();
      return { success: true, data: result.data, message: "下载成功" };
    } else {
      const err = await resp.json().catch(() => ({}));
      return { success: false, data: null, message: err.message || `下载失败: ${resp.status}` };
    }
  } catch (err) {
    return { success: false, data: null, message: `网络错误: ${err.message}` };
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