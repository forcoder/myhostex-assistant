/**
 * MyHostex 智能回复助手 - Background Service Worker (v3)
 * 负责：初始化存储、代理 LLM API 请求、房源页面自动抓取
 */

// 加载全局配置
try { importScripts('config.js'); } catch (e) { console.warn("[MyHostex助手][BG] 加载 config.js 失败:", e); }

console.log("[MyHostex助手][BG] Service Worker 已启动，版本: 3.13.2");

// ── 同步服务内联（Background 专用） ────────────────────────────────
const SYNC_KEYS_BG = [
  'mha_config', 'userStyle', 'rooms', 'propInfo',
  'replyRules', 'aiConfig', 'aiConfigs', 'knowledgeBase', 'settings'
];
const SYNC_METADATA_KEY_BG = 'sync_metadata';

/**
 * 获取同步元数据
 */
async function getSyncMetadataBG() {
  const result = await chrome.storage.local.get(SYNC_METADATA_KEY_BG);
  return result[SYNC_METADATA_KEY_BG] || {
    lastSyncTime: null, lastSyncStatus: null, syncVersion: 1,
    deviceId: 'device_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9), syncHistory: []
  };
}

/**
 * 更新同步元数据
 */
async function updateSyncMetadataBG(updates) {
  const metadata = await getSyncMetadataBG();
  const updated = { ...metadata, ...updates };
  if (updated.syncHistory?.length > 50) updated.syncHistory = updated.syncHistory.slice(-50);
  if (updates.lastSyncStatus) {
    updated.syncHistory = updated.syncHistory || [];
    updated.syncHistory.push({ status: updates.lastSyncStatus, time: new Date().toISOString() });
  }
  await chrome.storage.local.set({ [SYNC_METADATA_KEY_BG]: updated });
  return updated;
}

/**
 * 导出同步数据
 */
async function exportSyncDataBG() {
  const data = {};
  const keysToExport = await chrome.storage.local.get(SYNC_KEYS_BG);
  for (const key of SYNC_KEYS_BG) {
    if (keysToExport[key] !== undefined) data[key] = keysToExport[key];
  }
  return JSON.stringify({
    metadata: { exportedAt: new Date().toISOString(), version: chrome.runtime.getManifest().version, dataKeys: Object.keys(data) },
    data: data
  }, null, 2);
}

// ── 启动时同步 ────────────────────────────────
chrome.runtime.onStartup.addListener(async () => {
  console.log("[MyHostex助手][BG] 浏览器启动，执行启动时同步...");

  try {
    const syncConfigResult = await chrome.storage.local.get('sync_config');
    const syncConfig = syncConfigResult.sync_config;

    if (syncConfig?.enabled && syncConfig?.cloudEndpoint && syncConfig?.apiKey) {
      console.log("[MyHostex助手][BG] 云端同步已启用，执行自动同步...");

      const jsonData = await exportSyncDataBG();
      const url = `${syncConfig.cloudEndpoint.replace(/\/$/, "")}/sync/upload`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${syncConfig.apiKey}` },
        body: JSON.stringify({
          data: jsonData,
          timestamp: new Date().toISOString(),
          deviceId: (await getSyncMetadataBG()).deviceId,
        }),
      });

      if (resp.ok) {
        await updateSyncMetadataBG({ lastSyncTime: new Date().toISOString(), lastSyncStatus: "startup_sync" });
        console.log("[MyHostex助手][BG] 启动时同步完成");
      } else {
        console.warn("[MyHostex助手][BG] 启动时同步失败:", resp.status);
      }
    } else {
      console.log("[MyHostex助手][BG] 云端同步未配置，跳过自动同步");
    }
  } catch (err) {
    console.error("[MyHostex助手][BG] 启动时同步异常:", err);
  }
});

// ── 安装初始化 ────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[MyHostex助手][BG] 插件已安装/更新，原因:", details.reason);
  if (details.reason === "install") {
    // 检查是否已有保存的配置
    const existing = await chrome.storage.local.get('mha_config');
    if (!existing.mha_config) {
      // 首次安装，使用默认配置
      const defaultConfig = {
        apiKey: '',
        model: 'deepseek-chat',
        temperature: 0.7,
        maxTokens: 500,
        systemPrompt: '你是一个专业的民宿房东，擅长与客人沟通。根据客人的消息，生成3-5条建议回复，每条回复简洁友好，符合中文沟通习惯。',
        aiHistory: [],
        userStyle: null,
        stats: {
          totalGenerated: 0,
          totalSent: 0,
          totalReplies: 0
        },
        version: '1.0'
      };

      await chrome.storage.local.set({
        mha_config: defaultConfig,
        userStyle:  { samples: [], sampleCount: 0 },
        rooms:      [],
        propInfo:   {},
        replyRules: [],
        aiConfig:   {},
        knowledgeBase: [],
        settings: {
          autoExpand:     true,
          learnMode:      true,
          notifyEnabled:  true,
          checkInterval:  5000,
        },
      });
      console.log("[MyHostex助手] 已安装并初始化配置");
    } else {
      console.log("[MyHostex助手] 已加载已保存的配置");
    }
  } else if (details.reason === "update") {
    // 更新时合并新配置字段
    const existing = await chrome.storage.local.get('mha_config');
    if (existing.mha_config) {
      // 确保新字段存在
      const updated = {
        ...existing.mha_config,
        stats: existing.mha_config.stats || { totalGenerated: 0, totalSent: 0, totalReplies: 0 },
        aiHistory: existing.mha_config.aiHistory || [],
      };
      await chrome.storage.local.set({ mha_config: updated });
      console.log("[MyHostex助手] 配置已更新");
    }
  }
});

// ── 消息处理 ─────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // content.js 请求 AI 生成建议
  if (msg.type === "GENERATE_SUGGESTIONS") {
    handleGenerateSuggestions(msg).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true; // 异步
  }

  // ★ 新增：从 URL 抓取房源信息（单个）
  if (msg.type === "SCRAPE_ROOM") {
    scrapeRoomFromUrl(msg.url)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // ★ 新增：批量抓取房源（列表页）
  if (msg.type === "SCRAPE_ROOM_LIST") {
    scrapeRoomListBatch(msg.url, msg.onProgress)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // 其他
  if (msg.type === "GET_SETTINGS") {
    chrome.storage.local.get("settings", (r) => sendResponse(r.settings || {}));
    return true;
  }

  if (msg.type === "CLEAR_STYLE") {
    chrome.storage.local.set({ userStyle: { samples: [], sampleCount: 0 } }, () => sendResponse({ ok: true }));
    return true;
  }

  // ★ 实时自动同步（来自 popup 的变更通知）
  if (msg.type === "AUTO_SYNC") {
    console.log("[MyHostex助手][BG] 收到自动同步请求, 变更:", msg.changedKey);
    // 异步执行，不阻塞响应
    performAutoSyncBG(msg.changedKey);
    sendResponse({ ok: true });
    return false; // 同步响应
  }
});

// ── 后台自动同步（csBaby 实时同步）────────────────
/**
 * 执行后台自动同步（使用 csBaby sync API）
 * @param {string} changedKey - 触发变更的数据键名
 */
async function performAutoSyncBG(changedKey) {
  try {
    const syncConfigResult = await chrome.storage.local.get('sync_config');
    const syncConfig = syncConfigResult.sync_config || {};

    // 检查是否已登录（通过 sync_auth 判断）
    const authResult = await chrome.storage.local.get('sync_auth');
    const auth = authResult.sync_auth;
    if (!auth || !auth.accessToken || auth.expiresAt <= Date.now()) {
      console.log("[MyHostex助手][BG] 未登录或 token 已过期，跳过自动同步");
      return;
    }

    const endpoint = syncConfig.cloudEndpoint || APP_CONFIG.CLOUD_ENDPOINT_FALLBACK;
    console.log("[MyHostex助手][BG] 执行自动同步, 变更:", changedKey, "端点:", endpoint);

    const jsonData = await exportSyncDataBG();
    const url = `${endpoint.replace(/\/$/, "")}${APP_CONFIG.SYNC.PUSH}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify({
        data: jsonData,
        timestamp: new Date().toISOString(),
        deviceId: (await getSyncMetadataBG()).deviceId,
        changedKey: changedKey,
      }),
    });

    if (resp.ok) {
      await updateSyncMetadataBG({ lastSyncTime: new Date().toISOString(), lastSyncStatus: "auto_sync" });
      console.log("[MyHostex助手][BG] 自动同步完成, 变更:", changedKey);
    } else if (resp.status === 401) {
      console.warn("[MyHostex助手][BG] 自动同步失败: token 无效，需重新登录");
      // 清除过期 token
      await chrome.storage.local.remove('sync_auth');
    } else {
      console.warn("[MyHostex助手][BG] 自动同步失败:", resp.status);
    }
  } catch (err) {
    console.error("[MyHostex助手][BG] 自动同步异常:", err.message);
  }
}

// ══════════════════════════════════════════════
// ★ 房源抓取核心逻辑
// ══════════════════════════════════════════════

/**
 * 打开隐藏 Tab，注入脚本提取页面数据，然后关闭 Tab
 */
async function scrapeRoomFromUrl(url) {
  return new Promise((resolve, reject) => {
    let tabId = null;
    let settled = false;
    const TIMEOUT_MS = 35000;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanupTab();
        reject(new Error("抓取超时（35秒），请检查链接是否需要重新登录"));
      }
    }, TIMEOUT_MS);

    function cleanupTab() {
      clearTimeout(timer);
      if (tabId !== null) {
        chrome.tabs.remove(tabId, () => { /* ignore */ });
        tabId = null;
      }
    }

    // 创建后台隐藏 Tab
    chrome.tabs.create({ url, active: false }, (tab) => {
      if (chrome.runtime.lastError) {
        settled = true;
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      tabId = tab.id;

      const onUpdated = (updatedId, changeInfo) => {
        if (updatedId !== tabId) return;
        if (changeInfo.status !== "complete") return;
        chrome.tabs.onUpdated.removeListener(onUpdated);

        // SPA 需要等待 JS 渲染；先等 3s
        setTimeout(() => {
          if (settled) return;

          chrome.scripting.executeScript(
            { target: { tabId }, func: extractPageData, args: [url] },
            (results) => {
              settled = true;
              cleanupTab();

              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }
              const res = results?.[0]?.result;
              if (!res || res.error) {
                reject(new Error(res?.error || "页面数据提取失败"));
              } else {
                // 用 AI 进一步整理（如果配置了 apiKey）
                chrome.storage.local.get(["aiConfig"], (storage) => {
                  const aiConfig = storage.aiConfig || {};
                  if (aiConfig.apiKey) {
                    enrichWithAI(res, aiConfig)
                      .then((enriched) => resolve(enriched))
                      .catch(() => resolve(res)); // AI 失败就用原始数据
                  } else {
                    resolve(res);
                  }
                });
              }
            }
          );
        }, 3000);
      };

      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

/**
 * 页面注入函数（在目标页面上下文中执行）
 * 注意：此函数不能引用外部变量/函数
 */
function extractPageData(originalUrl) {
  try {
    const result = {
      url: originalUrl,
      scrapedAt: new Date().toISOString(),
      pageTitle: document.title || "",
      name: "",
      description: "",
      price: "",
      notes: "",
      location: "",
      checkin: "",
      checkout: "",
      wifi: "",
      parking: "",
      contact: "",
      amenities: [],
      rawText: "",
    };

    // ─── 工具函数 ─────────────────────────────────
    function getText(selectors) {
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          if (el && el.textContent.trim()) return el.textContent.trim().substring(0, 200);
        } catch (_) {}
      }
      return "";
    }

    function getAllTexts(selectors) {
      const texts = [];
      for (const sel of selectors) {
        try {
          document.querySelectorAll(sel).forEach((el) => {
            const t = el.textContent.trim();
            if (t && t.length > 2) texts.push(t);
          });
        } catch (_) {}
      }
      return [...new Set(texts)];
    }

    // ─── 全页面文本（用于正则提取）────────────────
    const pageText = document.body.innerText || document.body.textContent || "";
    result.rawText = pageText.substring(0, 5000);

    // ─── 名称 ───────────────────────────────────
    result.name =
      getText(["h1.room-name","h1.property-name",".room-title",".listing-name",".property-title",".home-title",
               "[class*='room-name']","[class*='listing-name']","[class*='property-name']","[class*='home-name']",
               ".name-title",".listing-title","h1"]) ||
      document.title.replace(/[-–|].*$/, "").trim().substring(0, 80);

    // ─── 描述 ───────────────────────────────────
    result.description =
      getText([".room-description",".listing-description",".property-description",".home-description",
               "[class*='description']",".desc-content",".info-desc",".description-text"]);
    if (!result.description) {
      const paras = [];
      document.querySelectorAll("p").forEach((p) => {
        const t = p.textContent.trim();
        if (t.length > 30 && t.length < 600) paras.push(t);
      });
      result.description = paras.slice(0, 4).join("\n").substring(0, 800);
    }

    // ─── 价格 ───────────────────────────────────
    result.price = getText([".price-value",".room-price",".listing-price",".property-price",
                          "[class*='price']",".per-night",".nightly-rate",".daily-rate"]);
    if (!result.price) {
      const pm = pageText.match(/(?:¥|￥|\$|€|RMB|USD|EUR)\s*[\d,]+(?:\s*[-~～至]\s*[\d,]+)?(?:\s*\/?\s*(?:晚|天|night|day))?/);
      if (pm) result.price = pm[0].trim();
    }

    // ─── 位置 ───────────────────────────────────
    result.location = getText([".address",".location",".property-address",".full-address",
                           "[class*='address']","[class*='location']",".property-location"]);

    // ─── 入退房 ──────────────────────────────────
    const ciMatch = pageText.match(/入(?:住|房)[时间]*[：:：\s]*([\d:：]+\s*[-~]\s*[\d:：]+|[\d:：]+(?:\s*之后|以后|起)?)/);
    const coMatch = pageText.match(/退(?:房|出)[时间]*[：:：\s]*([\d:：]+\s*[-~]\s*[\d:：]+|[\d:：]+(?:\s*之前|前)?)/);
    if (ciMatch) result.checkin = ciMatch[0].substring(0, 40);
    if (coMatch) result.checkout = coMatch[0].substring(0, 40);

    // ─── WiFi ────────────────────────────────────
    const wifiM = pageText.match(/(?:wifi|WiFi|wi-fi|无线)[^。\n,，]{0,60}/i);
    if (wifiM) result.wifi = wifiM[0].trim().substring(0, 80);

    // ─── 停车 ────────────────────────────────────
    const parkM = pageText.match(/(?:停车|车位|parking)[^。\n]{0,80}/i);
    if (parkM) result.parking = parkM[0].trim().substring(0, 100);

    // ─── 联系方式 ─────────────────────────────────
    const ctMatch = pageText.match(/(?:微信|电话|手机|联系)[^。\n：:]{0,50}/) ||
                    pageText.match(/1[3-9]\d{9}/);
    if (ctMatch) result.contact = ctMatch[0].trim().substring(0, 60);

    // ─── 设施 ────────────────────────────────────
    result.amenities = getAllTexts([
      ".amenity-item","[class*='amenity'] li","[class*='facility'] li",
      ".room-features li",".listing-amenities li",".property-amenities li",
      ".feature-item",".facilities li",
    ]).slice(0, 20);

    // ─── 规则/注意事项 ────────────────────────────
    result.notes = getText([".house-rules","[class*='rules']","[class*='notice']",".special-notes",
                          ".property-rules",".入住须知",".guest-rules"]);
    if (!result.notes) {
      const notesM = pageText.match(/(?:特别说明|注意事项|入住须知|house rules|property rules)[：:\s]*([\s\S]{0,300})/i);
      if (notesM) result.notes = notesM[1].trim().substring(0, 300);
    }

    // ─── 尝试从全局状态读取（SPA兜底）──────────────
    for (const key of ["__STORE__","__INITIAL_STATE__","__APP_STATE__","pageData","__DATA__","__nuxt__"]) {
      try {
        if (window[key]) {
          result.storeSnapshot = JSON.stringify(window[key]).substring(0, 6000);
          break;
        }
      } catch (_) {}
    }

    // ─── 尝试读取 meta 标签 ──────────────────────
    const metaDesc = document.querySelector('meta[name="description"]') ||
                     document.querySelector('meta[property="og:description"]');
    if (metaDesc && metaDesc.content) {
      result.metaDescription = metaDesc.content.substring(0, 300);
    }
    const metaTitle = document.querySelector('meta[property="og:title"]');
    if (metaTitle && metaTitle.content && !result.name) {
      result.name = metaTitle.content.substring(0, 80);
    }

    return result;
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * 用 AI 整理从页面抓取到的原始数据，输出结构化房源信息
 */
async function enrichWithAI(rawData, aiConfig) {
  const { provider = "openai", apiKey, model, baseUrl: customBase } = aiConfig;
  const baseUrl = (customBase || getDefaultBaseUrl(provider)).replace(/\/$/, "");

  const prompt = `你是一个数据整理助手。以下是从民宿管理系统页面抓取的原始数据，请整理成结构化的房源信息。

原始数据：
页面标题：${rawData.pageTitle}
页面文本（前5000字）：
${rawData.rawText}
${rawData.metaDescription ? `页面描述：${rawData.metaDescription}` : ""}

请输出 JSON，格式如下（如某项信息未找到则留空字符串）：
{
  "name": "房间/房型名称",
  "description": "房间详细描述（包括面积、床型、可入住人数、楼层、装修风格等）",
  "price": "价格信息（尽量包含工作日/周末/节假日）",
  "location": "具体地址或位置描述",
  "checkin": "入住时间",
  "checkout": "退房时间",
  "wifi": "WiFi名称和密码",
  "parking": "停车信息",
  "contact": "联系方式",
  "notes": "特殊规定或注意事项",
  "amenities": ["设施1", "设施2"]
}
只输出 JSON，不要任何说明。`;

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || getDefaultModel(provider),
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 1000,
    }),
  });

  if (!resp.ok) throw new Error(`AI整理失败 ${resp.status}`);

  const data = await resp.json();
  const raw = data?.choices?.[0]?.message?.content || "";

  // 解析 JSON
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI 未返回有效 JSON");

  const parsed = JSON.parse(jsonMatch[0]);

  // 合并：AI 的结构化数据优先，原始数据兜底
  return {
    ...rawData,
    name:        parsed.name        || rawData.name,
    description: parsed.description || rawData.description,
    price:       parsed.price       || rawData.price,
    location:    parsed.location    || rawData.location,
    checkin:     parsed.checkin     || rawData.checkin,
    checkout:    parsed.checkout    || rawData.checkout,
    wifi:        parsed.wifi        || rawData.wifi,
    parking:     parsed.parking     || rawData.parking,
    contact:     parsed.contact     || rawData.contact,
    notes:       parsed.notes       || rawData.notes,
    amenities:   parsed.amenities?.length ? parsed.amenities : rawData.amenities,
    aiEnriched:  true,
  };
}

// ══════════════════════════════════════════════
// LLM 请求代理
// ══════════════════════════════════════════════

async function handleGenerateSuggestions(msg) {
  const { messages = [], extraContext = {} } = msg;
  const {
    aiConfigs = [],  // ★ 新版：多模型配置数组
    aiConfig = {},    // 旧版兼容
    rooms = [],
    propInfo = {},
    replyRules = [],
    userStyle = {},
    maxSuggestions = 5,
    knowledgeBase = [],
    currentRoom = null,
    currentHousing = "",  // ★ 当前对话的房源名称（从对话列表提取）
  } = extraContext;

  // ★ 多模型优先级排序：默认优先，然后按数组顺序
  let sortedConfigs = [];
  if (aiConfigs && aiConfigs.length > 0) {
    // 新版：使用多模型配置
    sortedConfigs = [...aiConfigs].sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return 0;
    });
  } else if (aiConfig && aiConfig.apiKey) {
    // 旧版兼容：将单配置转为数组
    sortedConfigs = [{ ...aiConfig, isDefault: true }];
  }

  if (sortedConfigs.length === 0) throw new Error("未配置大模型");

  // ★ 关键词匹配：从知识库找出最相关条目
  // 优先使用 currentHousing（从对话列表提取的动态房源），其次是 currentRoom（静态配置）
  const roomForKB = currentHousing || currentRoom;
  if (roomForKB) {
    console.log("[MyHostex助手][BG] 使用房源进行知识库匹配:", roomForKB);
  }
  const matchedEntries = matchKnowledgeBase(messages, knowledgeBase, roomForKB);

  // ★ 如果匹配到高置信度知识库条目，直接返回规则回复，跳过 AI 生成（性能优化）
  const kbDirectSuggestions = matchedEntries
    .filter((e) => e.reply_content && e.reply_content.trim().length > 0)
    .map((e) => e.reply_content.trim());

  console.log("[MyHostex助手][BG] 知识库直接建议数:", kbDirectSuggestions.length);

  // ★ 如果知识库匹配成功，直接返回，跳过 AI 生成（性能优化）
  if (kbDirectSuggestions.length > 0) {
    // ★ 优化：如果第一条匹配度很高（精确匹配当前房源，分数>=15），只返回 1 条最准确的建议
    const topEntry = matchedEntries[0];
    const isHighConfidence = topEntry && (
      // 触发关键词匹配成功（至少 4 分）
      (topEntry.score >= 15)
    );

    const suggestionsCount = isHighConfidence ? 1 : Math.min(kbDirectSuggestions.length, maxSuggestions);
    const suggestions = kbDirectSuggestions.slice(0, suggestionsCount);

    console.log(`[MyHostex助手][BG] ✅ 知识库匹配成功，返回 ${suggestionsCount} 条建议${isHighConfidence ? "（高置信度，仅返回最佳）" : "，跳过 AI 生成"}`);
    return {
      suggestions,
      fromKB: true,
      kbCount: kbDirectSuggestions.length,
      usedModel: "知识库规则",  // 标记为来自知识库
    };
  }

  // ★ 知识库匹配失败，使用 AI 生成建议
  console.log("[MyHostex助手][BG] 知识库无匹配，使用 AI 生成建议");

  const systemPrompt = buildSystemPrompt({ rooms, propInfo, replyRules, userStyle, lang: extraContext.lang || "auto", maxSuggestions, matchedEntries });
  const userPrompt   = buildUserPrompt(messages);

  // ★ 尝试调用每个模型，直到成功或全部失败
  let lastError = null;
  for (let i = 0; i < sortedConfigs.length; i++) {
    const cfg = sortedConfigs[i];
    const { provider = "openai", apiKey, model } = cfg;
    const baseUrl = (cfg.baseUrl || getDefaultBaseUrl(provider)).replace(/\/$/, "");

    console.log(`[MyHostex助手][BG] 尝试使用模型 ${i + 1}/${sortedConfigs.length}: ${cfg.name || provider}`);

    try {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || getDefaultModel(provider),
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: userPrompt   },
          ],
          temperature: 0.75, // 无知识库匹配时使用标准温度
          max_tokens: 800,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const raw = data?.choices?.[0]?.message?.content || "";
        const suggestions = parseSuggestions(raw, maxSuggestions);

        console.log(`[MyHostex助手][BG] ✅ 模型 ${cfg.name || provider} 调用成功，AI 生成建议数:`, suggestions.length);
        console.log("[MyHostex助手][BG] 最终建议（纯AI）:", suggestions.length, "条");

        return {
          suggestions,
          fromKB: false,
          kbCount: 0,
          usedModel: cfg.name || provider,  // 返回使用的模型名称
        };
      } else {
        const err = await resp.json().catch(() => ({}));
        const errorMsg = err?.error?.message || err?.message || `HTTP ${resp.status}`;
        lastError = errorMsg;

        // ★ 检测是否是免费额度用完的错误
        const isQuotaError = isFreeQuotaExceededError(errorMsg, provider);
        const quotaMsg = isQuotaError ? "⚠️ 免费额度已用尽" : "";

        console.warn(`[MyHostex助手][BG] ❌ 模型 ${cfg.name || provider} 失败:`, errorMsg, quotaMsg);

        // 如果是免费额度错误，尝试将该模型的默认标记移除并切换默认模型
        if (isQuotaError && cfg.isDefault && i < sortedConfigs.length - 1) {
          await markQuotaExceeded(cfg);
          console.log(`[MyHostex助手][BG] 🔄 模型 ${cfg.name} 免费额度已用尽，已切换默认模型`);
        }
        // 继续尝试下一个模型
      }
    } catch (e) {
      lastError = e.message;
      console.warn(`[MyHostex助手][BG] ❌ 模型 ${cfg.name || provider} 异常:`, e.message);
      // 继续尝试下一个模型
    }
  }

  // 所有模型都失败
  throw new Error(`所有大模型均调用失败，最后错误：${lastError || "未知错误"}`);
}

// ── Prompt 构建 ───────────────────────────────
function buildSystemPrompt({ rooms, propInfo, replyRules, userStyle, lang, maxSuggestions, matchedEntries = [], currentHousing = "" }) {
  const L = [];
  L.push(`你是民宿房东的智能回复助手，根据对话上下文生成 ${maxSuggestions} 条候选回复。`);
  L.push("\n## 输出格式（严格遵守）");
  L.push('只输出 JSON 数组，例：["回复1","回复2","回复3"]，不要有任何额外说明。');
  L.push("\n## 语言");
  const langMap = {
    auto:      "语言中文→中文回复，英文→英文回复，其他同理。",
    zh:        "始终用中文回复。",
    en:        "Always reply in English.",
    bilingual: "每条提供中英双语，格式：中文 / English。",
  };
  L.push(langMap[lang] || langMap.auto);

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
    if (propInfo.checkin)  L.push(`- 入住时间：${propInfo.checkin}`);
    if (propInfo.checkout) L.push(`- 退房时间：${propInfo.checkout}`);
    if (propInfo.wifi)     L.push(`- WiFi：${propInfo.wifi}`);
    if (propInfo.parking)  L.push(`- 停车：${propInfo.parking}`);
    if (propInfo.contact)  L.push(`- 联系：${propInfo.contact}`);
    rooms.forEach((r) => {
      const parts = [`【${r.name}】`];
      if (r.price)       parts.push(`价格：${r.price}。`);
      if (r.description) parts.push(r.description.substring(0, 300) + "。");
      if (r.amenities?.length) parts.push(`设施：${r.amenities.slice(0, 8).join("、")}。`);
      if (r.notes)       parts.push(`注意：${r.notes}。`);
      if (r.checkin)     parts.push(`入住：${r.checkin}，退房：${r.checkout || ""}。`);
      L.push(parts.join(""));
    });
  }

  // ★ 知识库匹配结果注入
  if (matchedEntries.length > 0) {
    L.push("\n## ⚡ 标准回复（来自知识库，必须优先使用）");
    L.push("以下是房东针对此类问题的标准官方回复内容，**必须将其作为第一条建议，可以做轻微语气调整，但核心信息不得修改或省略**：");
    matchedEntries.forEach((e, i) => {
      L.push(`\n### 标准回复${i + 1}【触发关键词：${e.trigger_condition}】`);
      L.push("```");
      L.push(e.reply_content);
      L.push("```");
    });
    L.push("\n请严格遵守：第1条建议必须基于上方标准回复内容，其余建议可以是语气/措辞上的变体。");
  }

  // 规则
  if (replyRules.length > 0) {
    L.push("\n## 回复规则（必须遵守）");
    replyRules.forEach((r, i) => L.push(`${i + 1}. ${r}`));
  }

  // 风格
  if (userStyle?.sampleCount >= 5) {
    L.push("\n## 模仿房东风格");
    if (userStyle.tone) L.push(`- 语气：${userStyle.tone === "formal" ? "正式礼貌" : "轻松友好"}`);
    if (userStyle.language) L.push(`- 语言偏好：${userStyle.language === "zh" ? "中文为主" : "英文为主"}`);
    if (userStyle.avgLength) L.push(`- 回复长度约 ${userStyle.avgLength} 字`);
    if (userStyle.commonPhrases?.length) L.push(`- 常用词：${userStyle.commonPhrases.slice(0,8).join("、")}`);
  }

  L.push("\n## 要求");
  L.push("- 自然、像真人房东，不机械");
  L.push("- 简洁实用，直接回答客人问题");
  L.push("- 多条建议体现不同角度，供选择");
  L.push("- 不确定的具体信息用 [请填写] 占位");
  return L.join("\n");
}

function buildUserPrompt(messages) {
  if (!messages.length) return "请提供3条通用欢迎语。";
  const recent = messages.slice(-10);
  const lines = ["对话记录（房东=我，客人=对方）：", ""];
  recent.forEach((m) => lines.push(`【${m.isOutgoing ? "房东" : "客人"}】${m.text}`));
  lines.push("\n请根据客人最新消息，生成候选回复。");
  return lines.join("\n");
}

function parseSuggestions(raw, max) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw.trim());
    if (Array.isArray(arr)) return arr.filter((s) => typeof s === "string" && s.trim()).slice(0, max);
  } catch (_) {}
  const m = raw.match(/\[[\s\S]*?\]/);
  if (m) {
    try {
      const arr = JSON.parse(m[0]);
      if (Array.isArray(arr)) return arr.filter((s) => typeof s === "string").slice(0, max);
    } catch (_) {}
  }
  return raw.split("\n")
    .map((l) => l.replace(/^[\d\-\.\*•"]\s*/, "").replace(/"$/, "").trim())
    .filter((l) => l.length > 5)
    .slice(0, max);
}

function getDefaultBaseUrl(p) {
  return APP_CONFIG.AI_PROVIDERS[p]?.baseUrl || APP_CONFIG.AI_PROVIDERS.openai.baseUrl;
}

// ── 免费额度检测 ───────────────────────────────
/**
 * 检测错误是否是免费额度用完导致的
 */
function isFreeQuotaExceededError(errorMsg, provider) {
  if (!errorMsg) return false;

  const quotaKeywords = {
    qwen: ["免费额度", "额度已用尽", "free quota", "quota exceeded", "额度不足", "insufficient quota"],
    openai: ["quota exceeded", "rate limit", "额度"],
    deepseek: ["额度", "quota"],
    zhipu: ["额度", "quota"],
  };

  const keywords = quotaKeywords[provider] || quotaKeywords.openai;
  return keywords.some(keyword => errorMsg.toLowerCase().includes(keyword.toLowerCase()));
}

/**
 * 标记模型免费额度已用尽，并切换默认模型
 */
async function markQuotaExceeded(quotaConfig) {
  try {
    const res = await chrome.storage.local.get(["aiConfigs"]);
    let aiConfigs = res.aiConfigs || [];

    // 找到对应的模型配置
    const idx = aiConfigs.findIndex(c => c.id === quotaConfig.id);
    if (idx === -1) return;

    // 移除该模型的默认标记
    aiConfigs[idx].isDefault = false;

    // 找到下一个可用模型（不是当前额度用尽的模型）
    const nextDefault = aiConfigs.find(c => c.id !== quotaConfig.id && c.apiKey);
    if (nextDefault) {
      nextDefault.isDefault = true;
    }

    // 保存更新后的配置
    await chrome.storage.local.set({ aiConfigs });

    console.log(`[MyHostex助手][BG] 已切换默认模型: ${quotaConfig.name} → ${nextDefault?.name || "无"}`);
  } catch (e) {
    console.error("[MyHostex助手][BG] 切换默认模型失败:", e);
  }
}

function getDefaultModel(p) {
  return APP_CONFIG.AI_PROVIDERS[p]?.model || "gpt-4o";
}

// ══════════════════════════════════════════════
// ★ 知识库关键词匹配引擎
// ══════════════════════════════════════════════

/**
 * 从知识库中找出与当前对话最相关的条目
 * @param {Array} messages  - 对话消息列表
 * @param {Array} kb        - 知识库条目
 * @param {string|null} currentRoom - 当前房间名（用于 applicable_properties 过滤）
 * @returns {Array} 最多 3 条最相关的条目
 */
function matchKnowledgeBase(messages, kb, currentRoom) {
  if (!kb || kb.length === 0) {
    console.log("[MyHostex助手][KB] 知识库为空，跳过匹配");
    return [];
  }

  // 只用已启用的条目（缺少status字段默认为启用，保持向后兼容）
  const active = kb.filter((e) => e.status !== "禁用");
  console.log("[MyHostex助手][KB] 知识库条目总数:", kb.length, "，启用数:", active.length);
  if (active.length === 0) return [];

  // 取最近 5 条消息的文本（重点客人消息）
  const recent = messages.slice(-5);
  const guestText = recent
    .filter((m) => !m.isOutgoing)
    .map((m) => m.text || "")
    .join(" ")
    .toLowerCase();
  const allText = recent.map((m) => m.text || "").join(" ").toLowerCase();

  console.log("[MyHostex助手][KB] 客人消息文本:", guestText.slice(0, 100));

  if (!guestText && !allText) {
    console.log("[MyHostex助手][KB] 消息文本为空，跳过匹配");
    return [];
  }

  // 提取关键词列表的通用方法（支持多种分隔符和前缀格式）
  function extractKeywords(condition) {
    // 去除常见前缀：关键字:、关键词:、关键字：等
    const cleaned = condition
      .replace(/^(?:关键字|关键词|keyword)[\s]*[:：][\s]*/i, "")
      .trim();
    // 按逗号（全角/半角）、顿号、分号、斜线分割
    return cleaned
      .split(/[,，、;；\/|]/)
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length >= 1);
  }

  // 评分函数
  function scoreEntry(entry) {
    let score = 0;
    const condition = (entry.trigger_condition || "").trim();
    const triggerType = entry.trigger_type || "";

    if (triggerType === "关键词回复") {
      const keywords = extractKeywords(condition);

      // 调试：打印每个条目的关键词（仅前几条）
      // console.log("[KB] 条目关键词:", keywords.slice(0,3), "...");

      for (const kw of keywords) {
        if (!kw) continue;
        if (guestText.includes(kw)) {
          score += 10; // 客人说的，高权重
        } else if (allText.includes(kw)) {
          score += 4;  // 对话出现（含房东消息）
        }
      }
    } else if (triggerType === "inquiry_question") {
      // 咨询问题：去掉前缀后匹配
      const topic = condition
        .replace(/^(?:咨询问题|咨询)[\s]*[:：][\s]*/i, "")
        .trim()
        .toLowerCase();
      if (topic) {
        if (guestText.includes(topic)) score += 8;
        else if (allText.includes(topic)) score += 3;
      }
    }
    // booking / checkin_checkout 等类型不参与关键词匹配，跳过

    if (score === 0) return 0;

    // 房源过滤：若指定了当前房源，只保留适用于当前房源或全部的规则
    if (currentRoom) {
      const props = (entry.applicable_properties || "").toLowerCase();
      const replyPreview = entry.reply_content?.slice(0, 30) || "";
      console.log(`[MyHostex助手][KB] 房源过滤 - 规则:"${replyPreview}" | 适用房源:"${props}" | 当前房源:"${currentRoom}"`);
      if (props === "全部" || props === "") {
        score += 5; // 适用全部，加分
        console.log(`[MyHostex助手][KB] → 适用全部，加分5，当前分数:${score}`);
      } else if (props.includes(currentRoom.toLowerCase())) {
        score += 8; // 精确匹配当前房源，大幅加分
        console.log(`[MyHostex助手][KB] → 匹配当前房源，加分8，当前分数:${score}`);
      } else {
        console.log(`[MyHostex助手][KB] → 不适用当前房源，排除规则`);
        return 0; // 适用其他房源，直接排除（不推荐）
      }
    } else {
      // 未知当前房源时，"全部" 条目优先
      const props = (entry.applicable_properties || "").toLowerCase();
      if (props === "全部" || props === "") score += 3;
    }

    // 触发次数加分（经验越多越可靠）
    if (entry.trigger_count > 100) score += 4;
    else if (entry.trigger_count > 50)  score += 3;
    else if (entry.trigger_count > 10)  score += 1;

    return score;
  }

  // 评分 + 排序
  const scored = active
    .map((e) => ({ entry: e, score: scoreEntry(e) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const topEntries = scored.slice(0, 3);
  console.log(
    "[MyHostex助手][KB] 匹配结果 (top3):",
    topEntries.map((x) => ({
      score: x.score,
      trigger_type: x.entry.trigger_type,
      trigger_condition: x.entry.trigger_condition?.slice(0, 40),
      reply_preview: x.entry.reply_content?.slice(0, 30),
      applicable_properties: x.entry.applicable_properties,
    }))
  );
  console.log("[MyHostex助手][KB] 当前房源:", currentRoom || "未知");

  return topEntries.map((x) => x.entry);
}

// ══════════════════════════════════════════════
// ★ 批量抓取房源（列表页）
// ══════════════════════════════════════════════

/**
 * 批量抓取房源：从列表页提取所有房间详情链接，然后逐个抓取
 * @param {string} listUrl - 房源列表页或单个详情页 URL
 * @param {function} onProgress - 进度回调 ({status, current, total, name, successCount, failCount})
 * @returns {Promise<{rooms: [], successCount: number, failCount: number}>}
 */
async function scrapeRoomListBatch(listUrl, onProgress) {
  // ── 第一步：判断是列表页还是详情页 ──
  // 支持多种列表页路径：/listings, /rooms, /properties, /houses, /host/house/list 等
  const isList = /\/(?:listings|rooms|properties|houses|homes|stays|accommodations|list)(\/|\?|$)/.test(listUrl)
              || /\/host\/house\/list/.test(listUrl)
              || /[\?\&](?:list|all|filter|page)/.test(listUrl);

  console.log("[批量抓取] URL判断:", listUrl, "isList:", isList);

  let detailUrls = [];
  if (isList) {
    // 列表页：先提取所有房间详情链接
    onProgress?.({ status: "正在扫描列表页...", current: 0, total: 0 });
    detailUrls = await extractListingUrlsFromListPage(listUrl);
    console.log("[批量抓取] 提取到的详情链接数:", detailUrls.length);
    if (!detailUrls.length) throw new Error("未在列表页找到任何房源详情链接，请检查页面结构或确认登录状态");
    onProgress?.({ status: `扫描完成，发现 ${detailUrls.length} 个房源`, current: 0, total: detailUrls.length });
  } else {
    // 详情页：直接抓取
    onProgress?.({ status: "正在抓取单个房源...", current: 1, total: 1 });
    const roomData = await scrapeRoomFromUrl(listUrl);
    const room = buildRoomFromData(roomData);
    return {
      rooms: [room],
      successCount: 1,
      failCount: 0,
    };
  }

  // ── 第二步：逐个抓取房间详情 ──
  const results = { rooms: [], successCount: 0, failCount: 0 };
  for (let i = 0; i < detailUrls.length; i++) {
    const url = detailUrls[i];
    onProgress?.({
      status: `正在抓取 ${i + 1}/${detailUrls.length}`,
      current: i + 1,
      total: detailUrls.length,
      name: url.split("/").pop() || "房间",
      successCount: results.successCount,
      failCount: results.failCount,
    });

    try {
      const roomData = await scrapeRoomFromUrl(url);
      const room = buildRoomFromData(roomData);
      results.rooms.push(room);
      results.successCount++;
    } catch (err) {
      results.failCount++;
      console.error("[批量抓取] 失败：", url, err.message);
      // 继续抓取下一个，不中断整个流程
    }

    // 稍作延迟，避免请求过快
    await new Promise((r) => setTimeout(r, 800));
  }

  onProgress?.({
    status: "抓取完成",
    current: detailUrls.length,
    total: detailUrls.length,
    successCount: results.successCount,
    failCount: results.failCount,
  });

  return results;
}

/**
 * 从列表页提取所有房源详情链接
 */
async function extractListingUrlsFromListPage(listUrl) {
  return new Promise((resolve, reject) => {
    let tabId = null;
    let settled = false;
    const TIMEOUT_MS = 25000;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanupTab();
        reject(new Error("扫描列表页超时（25秒），请检查网络或重新登录"));
      }
    }, TIMEOUT_MS);

    function cleanupTab() {
      clearTimeout(timer);
      if (tabId !== null) {
        chrome.tabs.remove(tabId, () => { /* ignore */ });
        tabId = null;
      }
    }

    chrome.tabs.create({ url: listUrl, active: false }, (tab) => {
      if (chrome.runtime.lastError) {
        settled = true;
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      tabId = tab.id;

      const onUpdated = (updatedId, changeInfo) => {
        if (updatedId !== tabId) return;
        if (changeInfo.status !== "complete") return;
        chrome.tabs.onUpdated.removeListener(onUpdated);

        // SPA 等待 JS 渲染
        setTimeout(() => {
          if (settled) return;

          chrome.scripting.executeScript(
            { target: { tabId }, func: extractUrlsFromPage, args: [listUrl] },
            (results) => {
              settled = true;
              cleanupTab();

              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }
              const res = results?.[0]?.result;
              if (!res || res.error) {
                reject(new Error(res?.error || "提取链接失败"));
              } else {
                resolve(res.urls || []);
              }
            }
          );
        }, 3000);
      };

      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

/**
 * 页面注入函数：从列表页提取所有房源详情链接（通用）
 * 注意：此函数不能引用外部变量
 */
function extractUrlsFromPage(baseUrl) {
  try {
    const urls = new Set();
    const origin = new URL(baseUrl).origin;
    const path = new URL(baseUrl).pathname;

    // ── 方法 1：扫描所有 <a> 标签（通用）────────────────
    document.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href");
      if (!href) return;
      const fullUrl = href.startsWith("http") ? href : (href.startsWith("/") ? origin + href : baseUrl + href);

      // 匹配通用房源详情链接模式（多种平台）
      // listings/123, room/123, property/123, home/123, stay/123, house/123, villa/123
      const isDetailUrl = /\/(?:listings|room|rooms|property|home|house|stay|accommodation|listing|villa|apartment|detail)\/[\w\-]+/.test(fullUrl);

      // 同时排除列表页本身和无关链接
      const isListUrl = /\/(?:listings|rooms|properties|houses|homes|stays|accommodations)(\/|\?|$)/.test(fullUrl);
      const isFilterUrl = /[\?\&](?:filter|sort|page|size)/.test(fullUrl);
      const isApiUrl = /\/api\//.test(fullUrl);

      if (isDetailUrl && !isListUrl && !isFilterUrl && !isApiUrl) {
        urls.add(fullUrl);
      }
    });

    // ── 方法 2：从页面 JSON 数据提取（SPA 优化）─────────────
    const pageText = document.body.innerText || "";

    // 匹配常见的房源 ID 模式
    const patterns = [
      /\/listings\/[\w\-]+/g,
      /\/room\/[\w\-]+/g,
      /\/rooms\/[\w\-]+/g,
      /\/property\/[\w\-]+/g,
      /\/home\/[\w\-]+/g,
      /\/house\/[\w\-]+/g,
      /\/stay\/[\w\-]+/g,
      /\/accommodation\/[\w\-]+/g,
      /\/detail\/[\w\-]+/g,
      /"id"\s*:\s*"([a-z0-9\-]{12,})"/gi, // UUID 模式
      /"propertyId"\s*:\s*"([^"]{8,})"/gi,
      /"listingId"\s*:\s*"([^"]{8,})"/gi,
      /"houseId"\s*:\s*"([^"]{8,})"/gi,
      /"roomId"\s*:\s*"([^"]{8,})"/gi,
    ];

    patterns.forEach((p) => {
      const matches = pageText.match(p) || [];
      matches.forEach((m) => {
        // 如果是 /listings/xxx 格式，补全 URL
        if (m.startsWith("/")) {
          urls.add(origin + m);
        } else {
          // 如果是 JSON 中的 ID，尝试构造 URL
          const id = m.replace(/["']/g, "").replace(/^(?:id|propertyId|listingId|houseId|roomId)["\s:]*\s*/i, "");
          // 尝试多种路径格式（根据不同平台）
          ["/listings/", "/room/", "/rooms/", "/property/", "/home/", "/house/", "/detail/"].forEach((prefix) => {
            urls.add(origin + prefix + id);
          });
        }
      });
    });

    // ── 方法 3：针对大众点评的专用提取逻辑 ─────────────────
    // 大众点评的房源链接可能在 data-room-id 属性中，路径为 /room/id
    document.querySelectorAll("[data-room-id], [data-house-id], [data-id]").forEach((el) => {
      const roomId = el.getAttribute("data-room-id") || el.getAttribute("data-house-id");
      const dataId = el.getAttribute("data-id");
      const id = roomId || dataId;
      if (id && id.length >= 4) {
        // 尝试多种可能的详情页路径
        ["/room/", "/rooms/", "/house/", "/detail/"].forEach((prefix) => {
          urls.add(origin + prefix + id);
        });
      }
    });

    // 去重
    const uniqueUrls = Array.from(urls);
    console.log("[extractUrlsFromPage] 提取到的链接数:", uniqueUrls.length);
    if (uniqueUrls.length === 0) return { error: "未找到任何房源详情链接，请确认页面结构或是否需要登录" };
    return { urls: uniqueUrls };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * 将抓取数据转换为标准房间对象
 */
function buildRoomFromData(data) {
  return {
    name:        data.name        || data.pageTitle || "未命名房间",
    desc:        data.description || "",
    price:       data.price       || "",
    location:    data.location    || "",
    checkin:     data.checkin     || "",
    checkout:    data.checkout    || "",
    wifi:        data.wifi        || "",
    parking:     data.parking     || "",
    contact:     data.contact     || "",
    notes:       data.notes       || "",
    amenities:   data.amenities   || [],
    sourceUrl:   data.url         || "",
    scrapedAt:   data.scrapedAt   || new Date().toISOString(),
    aiEnriched:  data.aiEnriched  || false,
  };
}
