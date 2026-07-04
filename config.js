/**
 * MyHostex 智能回复助手 - 全局配置文件
 * ========================================================
 * 所有域名、端点、默认值等集中在此，修改后全局生效。
 * 各业务文件通过全局变量 APP_CONFIG 引用。
 * ========================================================
 * 注意：manifest.json 中的 host_permissions 和 CSP 是静态 JSON，
 * 修改域名后请同步更新 manifest.json 中的对应条目。
 * ========================================================
 */
const APP_CONFIG = {

  // ── MyHostex 平台域名 ──────────────────────────
  MYHOSTEX_DOMAIN: "www.myhostex.com",

  // ── 云端同步服务端点 ──────────────────────────
  /** 主端点（popup 同步界面默认值） */
  CLOUD_ENDPOINT: "http://api.agentai0.com",
  /** 备用端点（background 自动同步用，兼容旧部署） */
  CLOUD_ENDPOINT_FALLBACK: "https://csbaby-api2.onrender.com",

  // ── 认证 API 路径 ─────────────────────────────
  AUTH: {
    LOGIN:   "/auth/login",
    REGISTER:"/auth/register",
    REFRESH: "/auth/refresh",
  },

  // ── 同步 API 路径 ─────────────────────────────
  SYNC: {
    PUSH: "/sync/push",
    HEALTH: "/health",
  },

  // ── AI Provider 默认配置 ──────────────────────
  AI_PROVIDERS: {
    openai:   { baseUrl: "https://api.openai.com/v1",                         model: "gpt-4o" },
    deepseek: { baseUrl: "https://api.deepseek.com/v1",                       model: "deepseek-chat" },
    qwen:     { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
    zhipu:    { baseUrl: "https://open.bigmodel.cn/api/paas/v4",              model: "glm-4-flash" },
    custom:   { baseUrl: "",                                                  model: "" },
  },

  // ── Qwen 导入默认 Provider ─────────────────────
  QWEN_DEFAULT_PROVIDER: "qwen",

  // ── manifest.json 需要同步的域名列表（供参考） ──
  HOST_PERMISSIONS: [
    "https://www.myhostex.com/*",
    "https://api.openai.com/*",
    "https://api.deepseek.com/*",
    "https://dashscope.aliyuncs.com/*",
    "https://open.bigmodel.cn/*",
    "*://*/*",
    "https://*.supabase.com/*",
    "https://api.agentai0.com/*",
    "http://api.agentai0.com/*",
  ],

  // ── CSP connect-src（供参考） ─────────────────
  CSP_CONNECT_SRC: "http://api.agentai0.com http://localhost:*",
};
