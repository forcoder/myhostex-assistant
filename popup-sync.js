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

// ── 同步日志系统 ──────────────────────────────
const SYNC_LOG_KEY = "sync_logs";
const SYNC_LOG_MAX = 500;

const SyncLogger = {
  _idCounter: 0,
  _saveQueue: Promise.resolve(),

  _now() { return new Date().toISOString(); },

  async _save(entry) {
    // 串行化存储，避免竞态
    this._saveQueue = this._saveQueue.then(async () => {
      try {
        const result = await chrome.storage.local.get(SYNC_LOG_KEY);
        let logs = Array.isArray(result[SYNC_LOG_KEY]) ? result[SYNC_LOG_KEY] : [];
        logs.push(entry);
        if (logs.length > SYNC_LOG_MAX) logs = logs.slice(-SYNC_LOG_MAX);
        await chrome.storage.local.set({ [SYNC_LOG_KEY]: logs });
      } catch (e) {
        console.warn("[SyncLog] 保存日志失败:", e);
      }
    });
    await this._saveQueue;
  },

  info(step, message, details = null) {
    const entry = { id: ++this._idCounter, level: "INFO", timestamp: this._now(), step, message, details };
    console.log(`[SyncLog][INFO][${step}] ${message}`, details || "");
    return this._save(entry);
  },

  warn(step, message, details = null) {
    const entry = { id: ++this._idCounter, level: "WARN", timestamp: this._now(), step, message, details };
    console.warn(`[SyncLog][WARN][${step}] ${message}`, details || "");
    return this._save(entry);
  },

  error(step, message, details = null) {
    const entry = { id: ++this._idCounter, level: "ERROR", timestamp: this._now(), step, message, details };
    console.error(`[SyncLog][ERROR][${step}] ${message}`, details || "");
    return this._save(entry);
  },

  debug(step, message, details = null) {
    const entry = { id: ++this._idCounter, level: "DEBUG", timestamp: this._now(), step, message, details };
    console.log(`[SyncLog][DEBUG][${step}] ${message}`, details || "");
    return this._save(entry);
  },

  async getLogs(level = null, limit = 200) {
    try {
      const result = await chrome.storage.local.get(SYNC_LOG_KEY);
      let logs = Array.isArray(result[SYNC_LOG_KEY]) ? result[SYNC_LOG_KEY] : [];
      if (level) logs = logs.filter(l => l.level === level);
      return logs.slice(-limit);
    } catch { return []; }
  },

  async clearLogs() {
    try {
      await chrome.storage.local.remove(SYNC_LOG_KEY);
      this._idCounter = 0;
      this.info("系统", "日志已清除");
    } catch (e) {
      console.warn("[SyncLog] 清除日志失败:", e);
    }
  },

  async getLogCount() {
    try {
      const result = await chrome.storage.local.get(SYNC_LOG_KEY);
      return Array.isArray(result[SYNC_LOG_KEY]) ? result[SYNC_LOG_KEY].length : 0;
    } catch { return 0; }
  }
};
/**
 * 安全 JSON 解析，失败时返回默认值
 * @param {string} text
 * @param {*} fallback
 * @returns {*}
 */
function safeJsonParse(text, fallback = null) {
  if (text === null || text === undefined) return fallback;
  if (typeof text !== "string") return text;
  try { return JSON.parse(text); }
  catch (e) { return fallback; }
}

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
    SyncLogger.info("登录", `发起登录请求`, { url, accountType: isPhone(account) ? "手机号" : "邮箱" });

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
        SyncLogger.warn("登录", "登录失败", { status: resp.status, message: fromServer || classifyHttpStatus(resp, endpoint) });
        return { success: false, message: fromServer || classifyHttpStatus(resp, endpoint) };
      }

      // 适配 csBaby 主 API 扁平返回: {user_id, token, expires_in, ...}（无 code/data 包装）
      // 也兼容旧格式: {code: 0, data: {...}} 或 {isSuccess: true, data: {...}}
      const token = result.accessToken || result.token;
      const userId = result.user_id || result.userId || result.data?.user_id || result.data?.userId;
      if (token && userId) {
        const auth = {
          account: account,
          userId: userId,
          tenantId: result.tenantId || result.data?.tenantId || userId,
          accessToken: token,
          refreshToken: result.refreshToken || result.data?.refreshToken,
          expiresAt: result.expiresAt || result.data?.expiresAt ||
            (Date.now() + (result.expires_in || 7 * 24 * 60 * 60) * 1000)
        };
        await this.saveAuthState(auth);
        SyncLogger.info("登录", "登录成功", { userId: auth.userId, tenantId: auth.tenantId });
        return { success: true, message: "登录成功" };
      }
      SyncLogger.warn("登录", "登录失败 - 服务端返回格式异常", { result });
      return { success: false, message: result.message || "登录失败，请检查账号和密码" };
    } catch (err) {
      SyncLogger.error("登录", `登录网络异常: ${err.message}`, { endpoint });
      return { success: false, message: `网络错误: ${err.message}\n当前云端地址: ${endpoint}` };
    }
  }

  async register(account, password, displayName) {
    const endpoint = getCloudEndpoint();
    const url = `${endpoint}${APP_CONFIG.AUTH.REGISTER}`;
    SyncLogger.info("注册", `发起注册请求`, { url });

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
        SyncLogger.error("注册", "响应解析失败", { status: resp.status });
        return { success: false, message: classifyHttpStatus(resp, endpoint) };
      }

      if (!resp.ok) {
        const fromServer = result?.message || result?.msg;
        SyncLogger.warn("注册", "注册失败", { status: resp.status, message: fromServer || classifyHttpStatus(resp, endpoint) });
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
        SyncLogger.info("注册", "注册成功", { userId: auth.userId });
        return { success: true, message: "注册成功" };
      }
      SyncLogger.warn("注册", "注册失败 - 服务端返回格式异常", { code: result.code, isSuccess: result.isSuccess });
      return { success: false, message: result.message || "注册失败，请检查账号信息" };
    } catch (err) {
      SyncLogger.error("注册", `注册网络异常: ${err.message}`, { endpoint });
      return { success: false, message: `网络错误: ${err.message}\n当前云端地址: ${endpoint}` };
    }
  }

  async logout() {
    SyncLogger.info("登出", "执行登出");
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
        SyncLogger.info("令牌刷新", "Token 刷新成功");
        return true;
      }
      SyncLogger.warn("令牌刷新", "Token 刷新失败 - 服务端返回异常", { isSuccess: result.isSuccess });
    } catch (err) {
      SyncLogger.warn("令牌刷新", `Token 刷新异常: ${err.message}`);
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
  SyncLogger.info("初始化", "同步 UI 初始化");

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

  // 绑定日志查看按钮
  const logViewBtn = document.getElementById("btn-sync-logs");
  if (logViewBtn) {
    logViewBtn.addEventListener("click", showSyncLogs);
  }

  // 绑定日志清空按钮
  const logClearBtn = document.getElementById("btn-sync-logs-clear");
  if (logClearBtn) {
    logClearBtn.addEventListener("click", async () => {
      if (confirm("确认清除所有同步日志？")) {
        await SyncLogger.clearLogs();
        document.getElementById("sync-log-modal")?.classList.remove("open");
      }
    });
  }

  // 绑定日志弹窗关闭
  document.getElementById("sync-log-close")?.addEventListener("click", () => {
    document.getElementById("sync-log-modal")?.classList.remove("open");
  });

  // 检查同步状态
  await checkSyncStatus();

  SyncLogger.info("初始化", "同步 UI 初始化完成");
}

// ── 检查同步状态 ─────────────────────────────
/**
 * 检查当前同步状态并更新 UI
 * @returns {Promise<{status: string, metadata: Object}>}
 */
async function checkSyncStatus() {
  SyncLogger.debug("状态检查", "检查同步状态");

  try {
    const metadata = await syncService.getSyncMetadata();
    const stats = await syncService.getStorageStats();
    SyncLogger.debug("状态检查", "当前状态", { 
      lastSync: metadata.lastSyncTime, 
      totalItems: stats.totalItems,
      modules: Object.keys(stats.byKey).filter(k => stats.byKey[k].type !== "empty")
    });

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
    SyncLogger.error("状态检查", `检查同步状态失败: ${err.message}`);
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
 * 渲染知识库规则列表
 *
 * 数据来源（按优先级，均为 chrome.storage.local）：
 *  1. knowledgeBase —— 关键词回复 Tab 写入，对象结构（含 trigger_condition/reply_content/status）
 *  2. replyRules —— 规则 Tab 写入，纯字符串数组（每条就是一个回复文本）
 */
async function renderKnowledgeBaseList() {
  const container = document.getElementById("sync-rules-list");
  if (!container) return;

  const result = await chrome.storage.local.get(["knowledgeBase", "replyRules"]);
  const items = [];

  // 来源 1：knowledgeBase（结构化对象）
  const kb = Array.isArray(result.knowledgeBase) ? result.knowledgeBase : [];
  kb.forEach((r, idx) => {
    const enabled = r.status !== "禁用";
    const condRaw = (r.trigger_condition || "").replace(/^(?:关键字|关键词|keyword)[\s]*[:：][\s]*/i, "").trim();
    const reply = r.reply_content || r.reply || "";
    const type = r.trigger_type || "关键词回复";
    const used = r.trigger_count || 0;
    const propsRaw = (!r.applicable_properties || r.applicable_properties === "[]") ? "全部房源" : r.applicable_properties;
    const props = propsRaw === "全部房源" ? "全部" : propsRaw;
    items.push({
      kind: "kb",
      enabled,
      cond: condRaw || "(无关键词)",
      reply,
      type,
      used,
      props,
    });
  });

  // 来源 2：replyRules（纯字符串）
  const rr = Array.isArray(result.replyRules) ? result.replyRules : [];
  rr.forEach((text) => {
    if (typeof text !== "string") return;
    const trimmed = text.trim();
    if (!trimmed) return;
    items.push({
      kind: "rule",
      enabled: true,
      cond: "(规则)",
      reply: trimmed,
      type: "回复规则",
      used: 0,
      props: "全部",
    });
  });

  if (items.length === 0) {
    container.innerHTML = '<div class="empty-tip" style="color:#9ca3af;text-align:center;padding:14px 0">暂无规则</div>';
    // 数量徽章也置 0
    const cnt = document.getElementById("sync-rules-count");
    if (cnt) {
      cnt.textContent = "0 条";
      cnt.style.background = "#f3f4f6";
      cnt.style.color = "#6b7280";
    }
    return;
  }

  const html = items.map((it, idx) => {
    const bg = it.enabled ? "#4f46e5" : "#9ca3af";
    return `
      <div style="display:flex;align-items:flex-start;gap:8px;padding:6px 4px;border-bottom:1px dashed #e5e7eb;${it.enabled ? '' : 'opacity:.55'}">
        <span style="flex-shrink:0;width:18px;height:18px;background:${bg};color:#fff;border-radius:50%;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center">${idx + 1}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;color:#1e1b4b;font-weight:600;word-break:break-all">${escapeHtmlSync(it.cond)}</div>
          <div style="font-size:11px;color:#6b7280;line-height:1.4;margin-top:2px;word-break:break-all">→ ${escapeHtmlSync((it.reply || '').slice(0, 80))}</div>
          <div style="font-size:10px;color:#9ca3af;margin-top:2px">📌 ${escapeHtmlSync(it.type)} · 适用房源：${escapeHtmlSync(it.props)} · 触发：${it.used} 次</div>
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = html;

  // 标题旁数量徽章：分别显示总条数 / 启用 / 禁用
  const cnt = document.getElementById("sync-rules-count");
  if (cnt) {
    const enabled = items.filter(i => i.enabled).length;
    const disabled = items.length - enabled;
    const parts = [`共 ${items.length} 条`];
    if (disabled > 0) parts.push(`启用 ${enabled}`);
    cnt.textContent = parts.join(" · ");
    cnt.style.background = "#ede9fe";
    cnt.style.color = "#4f46e5";
    cnt.title = disabled > 0 ? `共 ${items.length} 条，${enabled} 条启用，${disabled} 条禁用` : `共 ${items.length} 条，全部启用`;
  }

  console.log(`[Popup-Sync] 知识库规则已渲染: ${items.length} 条 (kb=${kb.length}, replyRules=${rr.length})`);
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
  const syncId = Date.now().toString(36);
  SyncLogger.info("同步", `===== 开始同步 #${syncId} =====`);

  // 确保同步配置和认证状态已加载
  await loadSyncSettings();
  await syncAuthManager.loadAuthState();

  // 检查登录状态
  if (!syncAuthManager.isLoggedIn()) {
    SyncLogger.warn("同步", "同步失败 - 未登录");
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

    // ── 第一步：先拉取云端数据（避免 push 覆盖服务端规则） ──
    SyncLogger.info("同步", "拉取服务端规则数据");
    let cloudRawData = null;

    // 直接独立下载，不先 push
    SyncLogger.info("同步", "独立拉取云端数据");
    const downloadResult = await downloadFromCloudWithAuth();
    if (downloadResult.success && downloadResult.data) {
      cloudRawData = downloadResult.data;
      SyncLogger.info("同步", "独立拉取成功");
    } else if (downloadResult.success && !downloadResult.data) {
      SyncLogger.info("同步", "服务端无额外数据");
    } else {
      SyncLogger.warn("同步", "独立拉取失败", { message: downloadResult.message });
    }

    // ── 第二步：如果有云端数据，合并到本地 ──
    let importedCount = 0;
    if (cloudRawData) {
      SyncLogger.info("同步", "开始合并云端数据到本地");
      let normalizedData = cloudRawData;
      if (typeof normalizedData === "object") {
        normalizedData = JSON.stringify(normalizedData);
      }

      try {
        const parsed = JSON.parse(normalizedData);
        const topKeys = Object.keys(parsed);
        SyncLogger.debug("同步", "云端数据结构", { topLevelKeys: topKeys });

        if (parsed.keywordRules && Array.isArray(parsed.keywordRules) && parsed.keywordRules.length > 0) {
          const local = await chrome.storage.local.get(["knowledgeBase"]);
          const localKB = Array.isArray(local.knowledgeBase) ? local.knowledgeBase : [];
          const { merged } = syncService.mergeKnowledgeBase(parsed, localKB);
          await chrome.storage.local.set({ knowledgeBase: merged });
          importedCount = merged.length - localKB.length;
          SyncLogger.info("同步", `从服务端合并 ${parsed.keywordRules.length} 条规则，本地新增 ${importedCount} 条`);
        }
        // 方式 B/C/D：对其他格式兼容
        else if (parsed.metadata && parsed.data) {
          const importResult = await syncService.importData(normalizedData, { merge: true });
          importedCount = importResult.imported || 0;
          SyncLogger.info("同步", `标准格式导入完成`, importResult);
        } else if (Array.isArray(parsed) && parsed.length > 0) {
          const local = await chrome.storage.local.get(["knowledgeBase"]);
          const localKB = Array.isArray(local.knowledgeBase) ? local.knowledgeBase : [];
          const { merged } = syncService.mergeKnowledgeBase({ keywordRules: parsed }, localKB);
          await chrome.storage.local.set({ knowledgeBase: merged });
          importedCount = merged.length - localKB.length;
          SyncLogger.info("同步", `数组格式合并完成`, { arrLen: parsed.length, newAdded: importedCount });
        } else {
          const wrapped = JSON.stringify({
            metadata: { exportedAt: new Date().toISOString(), version: chrome.runtime.getManifest().version, source: "cloud_sync" },
            data: parsed,
          });
          const importResult = await syncService.importData(wrapped, { merge: true });
          importedCount = importResult.imported || 0;
          SyncLogger.info("同步", `包装格式导入完成`, { imported: importedCount });
        }
      } catch (e) {
        SyncLogger.error("同步", `数据合并异常: ${e.message}`);
      }

      if (importedCount > 0 && msgEl) {
        msgEl.textContent = `✓ 同步完成，从云端拉取 ${importedCount} 条规则`;
        msgEl.style.color = "#059669";
      }
    }

    // ── 第三步：只推送脏数据（增量推送） ──
    // 读取本地脏数据集合（包含新增/修改的规则 id + 已删除的规则 id）
    const DIRTY_IDS_KEY_POPUP = "sync_dirty_ids";
    const dirtyRes = await chrome.storage.local.get(DIRTY_IDS_KEY_POPUP);
    const dirty = dirtyRes[DIRTY_IDS_KEY_POPUP] || {};
    const dirtyIds = Array.isArray(dirty.knowledgeBase) ? dirty.knowledgeBase : [];
    const deletedIds = Array.isArray(dirty.knowledgeBase_deleted) ? dirty.knowledgeBase_deleted : [];

    // 拉取本地知识库
    const localKB = await chrome.storage.local.get(["knowledgeBase"]);
    const kbArr = Array.isArray(localKB.knowledgeBase) ? localKB.knowledgeBase : [];

    // 只取脏 id 对应的规则（不传整库）
    const dirtyRules = kbArr.filter((r) => r && r.id && dirtyIds.includes(r.id));

    // 构造服务端期望的扁平 payload：{ keywordRules, deletedRuleIds }
    // 关键修复：服务端 /sync/push 接口只识别顶层 keywordRules 字段
    const serverPayload = {
      keywordRules: dirtyRules.map((r) =>
        typeof syncService.localToServer === "function"
          ? syncService.localToServer(r)
          : r
      ),
      deletedRuleIds: deletedIds,
    };

    SyncLogger.info("上传", "构造增量推送 payload", {
      dirtyCount: dirtyRules.length,
      deletedCount: deletedIds.length,
      totalLocal: kbArr.length,
    });

    const mergedExport = await syncService.exportData();
    const currentKBCount = mergedExport.stats.knowledgeBase || 0;
    const meta = await syncService.getSyncMetadata();
    const lastKBCount = meta.lastUploadedKBCount ?? 0;
    const DELETION_LOG_KEY_POPUP = "sync_deletion_log";
    let shouldUpload = true;

    // 上传保护：本地规则数骤降 > 50% 且无删除记录 → 跳过
    if (lastKBCount > 0 && currentKBCount < lastKBCount * 0.5) {
      const delResult = await chrome.storage.local.get(DELETION_LOG_KEY_POPUP);
      const deletionLog = Array.isArray(delResult[DELETION_LOG_KEY_POPUP]) ? delResult[DELETION_LOG_KEY_POPUP] : [];
      const recentDeletions = deletionLog.filter(d =>
        d.type === "knowledgeBase" &&
        d.deletedAt && (Date.now() - new Date(d.deletedAt).getTime()) < 2 * 60 * 1000
      );
      if (recentDeletions.length === 0) {
        shouldUpload = false;
        SyncLogger.warn("同步", `⛔ 保护：本地知识库从 ${lastKBCount} 条骤降至 ${currentKBCount} 条，无删除记录，跳过上传`);
      } else {
        const expectedDrop = lastKBCount - currentKBCount;
        if (recentDeletions.length < expectedDrop * 0.8) {
          shouldUpload = false;
          SyncLogger.warn("同步", `⛔ 保护：本地减少 ${expectedDrop} 条，删除记录仅 ${recentDeletions.length} 条，跳过上传`);
        }
      }
    }

    // 关键：只有当有脏数据时才推送（增量），否则跳过 push 避免无谓请求
    const hasDirtyData = dirtyRules.length > 0 || deletedIds.length > 0;
    if (shouldUpload && (hasDirtyData || importedCount > 0)) {
      SyncLogger.info("同步", `将 ${dirtyRules.length} 条脏数据 + ${deletedIds.length} 条删除推送到云端`);
      const upResult = await uploadToCloudWithAuth(serverPayload, mergedExport.stats);
      if (upResult.success) {
        // 推送成功：清除脏标记 + 写入推送日志
        await syncService.updateSyncMetadata({ lastUploadedKBCount: currentKBCount });

        // 写入推送详情日志（按用户要求：推送数据详情日志）
        const pushDetails = dirtyRules.map((r) => ({
          id: r.id,
          keyword: r.trigger_condition,
          reply: r.reply_content,
          status: r.status,
        }));
        SyncLogger.info("推送详情", `本次推送 ${dirtyRules.length} 条新增/修改 + ${deletedIds.length} 条删除`, {
          pushed: pushDetails,
          deleted: deletedIds,
          timestamp: new Date().toISOString(),
        });

        // 清除脏标记
        await chrome.storage.local.set({
          [DIRTY_IDS_KEY_POPUP]: {
            knowledgeBase: [],
            knowledgeBase_deleted: [],
          },
        });
        SyncLogger.info("同步", "已清除脏数据标记");
      }
    } else if (!shouldUpload) {
      SyncLogger.info("同步", "上传保护已触发，仅从云端拉取数据");
    } else {
      SyncLogger.info("同步", "本地无脏数据，跳过推送（仅拉取）");
    }

    // 更新同步时间和 lastPullTime（增量拉取）
    const nowISO = new Date().toISOString();
    await syncService.updateSyncMetadata({
      lastSyncTime: nowISO,
      lastPullTime: nowISO,
      lastSyncStatus: "cloud_sync",
    });

    // 刷新状态
    await checkSyncStatus();

    if (msgEl && !msgEl.textContent.includes("同步完成")) {
      msgEl.textContent = "✓ 同步完成";
      msgEl.style.color = "#059669";
      setTimeout(() => { msgEl.textContent = ""; }, 3000);
    }

    const finalStats = await syncService.getStorageStats();
    SyncLogger.info("同步", `===== 同步 #${syncId} 完成 =====`, { finalStats: finalStats });

    return { success: true, message: "同步成功" };
  } catch (err) {
    SyncLogger.error("同步", `同步异常: ${err.message}`);
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
 * @param {string|Object} jsonData - JSON 字符串或已解析对象；推荐传对象（避免双重 JSON 编码）
 * @param {Object} localStats
 */
async function uploadToCloudWithAuth(jsonData, localStats) {
  const endpoint = getCloudEndpoint();

  // 尝试刷新 token（如果即将过期）
  await syncAuthManager.refreshTokenIfNeeded();

  const token = syncAuthManager.getAccessToken();
  if (!token) {
    SyncLogger.error("上传", "token 不存在");
    return { success: false, message: "未登录或未配置云端" };
  }

  try {
    const url = `${endpoint}${APP_CONFIG.SYNC.PUSH}`;
    SyncLogger.info("上传", `推送数据到 ${url}`, {
      dataSize: typeof jsonData === "string" ? jsonData.length : JSON.stringify(jsonData).length,
    });

    // 关键：data 字段必须是已解析的对象（不是 JSON 字符串），
    // 否则服务端再 JSON.parse 后会得到字符串而非对象，找不到 keywordRules
    const dataPayload = typeof jsonData === "string" ? safeJsonParse(jsonData, {}) : jsonData;

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        data: dataPayload,
        timestamp: new Date().toISOString(),
        deviceId: await getDeviceId(),
        localStats: localStats
      }),
    });

    if (resp.ok) {
      const result = await resp.json();
      SyncLogger.info("上传", "推送成功", { 
        status: resp.status,
        hasServerData: !!result.data,
        serverDataKeys: result.data ? Object.keys(result.data) : [],
        stats: result.stats
      });
      return { success: true, message: "上传成功", stats: result.stats || {}, serverData: result.data || null };
    } else {
      const err = await resp.json().catch(() => ({}));
      SyncLogger.warn("上传", `推送失败 HTTP ${resp.status}`, { message: err.message });
      if (resp.status === 401) {
        await syncAuthManager.clearAuthState();
        SyncLogger.warn("上传", "登录过期，已清除认证状态");
        return { success: false, message: "登录已过期，请重新登录" };
      }
      return { success: false, message: err.message || `上传失败: ${resp.status}` };
    }
  } catch (err) {
    SyncLogger.error("上传", `网络异常: ${err.message}`, { endpoint });
    return { success: false, message: `网络错误: ${err.message}` };
  }
}

/**
 * 从云端拉取数据（使用认证 token）
 * @returns {Promise<{success: boolean, data: string|null, message: string}>}
 */
async function downloadFromCloudWithAuth() {
  const endpoint = getCloudEndpoint();

  // ★ 获取上次拉取时间，用于增量请求
  const meta = await syncService.getSyncMetadata();
  const lastPullTime = meta.lastPullTime || "";

  await syncAuthManager.refreshTokenIfNeeded();
  const token = syncAuthManager.getAccessToken();
  if (!token) {
    SyncLogger.error("下载", "token 不存在");
    return { success: false, data: null, message: "未登录" };
  }

  try {
    // 端点优先级：/sync/pull → /sync/download → push 空数据回显
    let usedMethod = "GET /sync/pull";
    let url = `${endpoint}/sync/pull`;
    const pullUrl = lastPullTime ? `${url}?lastPullTime=${encodeURIComponent(lastPullTime)}` : url;
    SyncLogger.info("下载", `尝试方法1: GET ${pullUrl}${lastPullTime ? ' (增量)' : ' (全量)'}`);
    let resp = await fetch(pullUrl, {
      method: "GET",
      headers: { 
        Authorization: `Bearer ${token}`,
        "Cache-Control": "no-cache, no-store",
        "Pragma": "no-cache",
        ...(lastPullTime ? { "X-Last-Pull-Time": lastPullTime } : {}),
      },
    });

    // 如果 pull 不存在，尝试 /sync/download（非认证版使用的端点）
    if (resp.status === 404) {
      usedMethod = "GET /sync/download";
      url = `${endpoint}/sync/download`;
      const downloadUrl = lastPullTime ? `${url}?lastPullTime=${encodeURIComponent(lastPullTime)}` : url;
      SyncLogger.info("下载", `方法1 404，尝试方法2: GET ${downloadUrl}${lastPullTime ? ' (增量)' : ''}`);
      resp = await fetch(downloadUrl, {
        method: "GET",
        headers: { 
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-cache, no-store",
          ...(lastPullTime ? { "X-Last-Pull-Time": lastPullTime } : {}),
        },
      });
    }

    // 如果 download 也不存在，尝试 push 空数据让服务端回显（兼容旧版）
    if (resp.status === 404) {
      usedMethod = "POST /sync/push (pullOnly)";
      SyncLogger.info("下载", "方法2 404，改用 push 空数据拉取");
      url = `${endpoint}${APP_CONFIG.SYNC.PUSH}`;
      const pushBody = {
        data: JSON.stringify({ metadata: { pullOnly: true, lastPullTime: lastPullTime || undefined }, data: {} }),
        timestamp: new Date().toISOString(),
        deviceId: await getDeviceId(),
        pullOnly: true,
      };
      if (lastPullTime) pushBody.lastPullTime = lastPullTime;
      resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(pushBody),
      });
    }

    SyncLogger.info("下载", `[${usedMethod}] HTTP ${resp.status} ${resp.ok ? 'OK' : 'FAIL'}`);

    if (resp.ok) {
      const result = await resp.json();
      SyncLogger.info("下载", `[${usedMethod}] 响应解析成功`, { 
        resultKeys: Object.keys(result),
        code: result.code,
        hasData: !!result.data
      });

      let serverData = result.data || result.serverData || result;
      SyncLogger.info("下载", `[${usedMethod}] serverData`, {
        type: typeof serverData,
        isArray: Array.isArray(serverData),
        keysOrLen: serverData ? (Array.isArray(serverData) ? serverData.length : Object.keys(serverData)) : 'null'
      });

      // 过滤掉非数据字段
      if (serverData && typeof serverData === "object" && !Array.isArray(serverData)) {
        const metaKeys = ["code", "message", "success", "timestamp", "requestId"];
        const hasOnlyMeta = Object.keys(serverData).every(k => metaKeys.includes(k));
        if (hasOnlyMeta) {
          SyncLogger.info("下载", `[${usedMethod}] 服务端返回仅有元信息字段`, { keys: Object.keys(serverData) });
          serverData = null;
        }
      }

      if (serverData) {
        if (serverData.keywordRules) {
          SyncLogger.info("下载", `[${usedMethod}] keywordRules 详情`, { 
            type: typeof serverData.keywordRules,
            isArray: Array.isArray(serverData.keywordRules),
            length: Array.isArray(serverData.keywordRules) ? serverData.keywordRules.length : 'N/A'
          });
        }
        const dataKeys = Array.isArray(serverData) ? `[array(${serverData.length})]` : Object.keys(serverData).join(",");
        SyncLogger.info("下载", `[${usedMethod}] 获取到云端数据`, { keys: dataKeys });
        const dataStr = typeof serverData === "string" ? serverData : JSON.stringify(serverData);
        return { success: true, data: dataStr, message: "下载成功" };
      }
      SyncLogger.info("下载", `[${usedMethod}] 服务端暂无数据`);
      return { success: true, data: null, message: "服务端暂无数据" };
    } else {
      SyncLogger.warn("下载", `[${usedMethod}] 拉取失败 HTTP ${resp.status}`);
      if (resp.status === 401) {
        await syncAuthManager.clearAuthState();
        return { success: false, data: null, message: "登录已过期，请重新登录" };
      }
      const err = await resp.json().catch(() => ({}));
      return { success: false, data: null, message: err.message || `下载失败: ${resp.status}` };
    }
  } catch (err) {
    SyncLogger.error("下载", `网络异常: ${err.message}`, { endpoint });
    return { success: false, data: null, message: `网络错误: ${err.message}` };
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

// ── 查看同步日志 ─────────────────────────────
async function showSyncLogs() {
  const modal = document.getElementById("sync-log-modal");
  const listEl = document.getElementById("sync-log-list");
  const countEl = document.getElementById("sync-log-count");
  if (!modal || !listEl) return;

  modal.classList.add("open");

  try {
    const logs = await SyncLogger.getLogs(null, 500);
    if (countEl) countEl.textContent = logs.length;

    if (logs.length === 0) {
      listEl.innerHTML = '<div class="empty-tip" style="color:#9ca3af;text-align:center;padding:20px 0">暂无同步日志</div>';
      return;
    }

    listEl.innerHTML = logs.reverse().map(e => {
      const time = new Date(e.timestamp).toLocaleString("zh-CN", { hour12: false });
      const levelColor = e.level === "ERROR" ? "#dc2626" : e.level === "WARN" ? "#d97706" : "#4f46e5";
      return `<div style="padding:3px 4px;border-bottom:1px solid #f3f4f6;display:flex;gap:6px">
        <span style="color:#9ca3af;white-space:nowrap;flex-shrink:0">${time}</span>
        <span style="color:${levelColor};font-weight:600;flex-shrink:0;width:40px">${e.level}</span>
        <span style="color:#4b5563;flex-shrink:0">[${e.step}]</span>
        <span style="color:#1f2937;word-break:break-all">${escapeHtml(e.message)}${e.details ? ' ' + escapeHtml(JSON.stringify(e.details)) : ''}</span>
      </div>`;
    }).join("");
  } catch (e) {
    listEl.innerHTML = `<div style="color:#dc2626;text-align:center;padding:20px 0">加载日志失败: ${escapeHtml(e.message)}</div>`;
  }
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