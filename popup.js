/**
 * MyHostex 智能回复助手 - popup.js (v3)
 * 管理 AI 配置、房间信息（含链接抓取）、回复规则、风格学习统计
 */

// ── 预设规则模板 ──────────────────────────────
const RULE_TEMPLATES = [
  { icon: "💰", text: "不轻易打折，有优惠需求引导到平台预订或私信沟通" },
  { icon: "📅", text: "入住时间弹性，但退房须在12点前，如需延迟请提前告知" },
  { icon: "🐾", text: "宠物友好，但需提前说明宠物类型，需缴纳200元押金" },
  { icon: "🚭", text: "全程无烟环境，包括阳台，违者需承担清洁费300元" },
  { icon: "🎉", text: "不允许在房间内举办聚会或超过4人同住" },
  { icon: "🔑", text: "支持自助入住，密码锁，无需等待，入住前发送开门码" },
  { icon: "⭐", text: "希望满意的住客留下五星评价，有不满意之处请先私信沟通" },
  { icon: "🌐", text: "回复语言跟随客人，客人说中文就用中文，说英文就用英文" },
  { icon: "📞", text: "紧急情况直接拨打电话，非紧急问题尽量通过平台消息沟通" },
  { icon: "🧹", text: "如需额外保洁服务，可按次收费，请至少提前一天预约" },
];

// ── 进化阶段 ──────────────────────────────────
const LEVELS = [
  { min: 0,   emoji: "🥚", label: "新手" },
  { min: 5,   emoji: "🐣", label: "萌芽" },
  { min: 20,  emoji: "🌱", label: "成长" },
  { min: 50,  emoji: "🌿", label: "进化" },
  { min: 100, emoji: "⭐", label: "熟练" },
  { min: 200, emoji: "🏆", label: "大师" },
];

function getLevel(count) {
  let lv = LEVELS[0];
  for (const l of LEVELS) { if (count >= l.min) lv = l; }
  return lv;
}

// ── Tab 切换 ──────────────────────────────────
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// ── 状态提示 ─────────────────────────────────
function showStatus(id, msg, type = "ok") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.color = type === "ok" ? "#059669" : "#b91c1c";
  setTimeout(() => { el.textContent = ""; }, 3000);
}

// ═══════════════════════════════════════════════
// TAB: AI 配置 - 多模型版本
// ═══════════════════════════════════════════════

// ── Provider 默认配置 ─────────────────────────
const PROVIDER_DEFAULTS = {
  openai:   { baseUrl: "https://api.openai.com/v1",           model: "gpt-4o" },
  deepseek: { baseUrl: "https://api.deepseek.com/v1",         model: "deepseek-chat" },
  qwen:     { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  zhipu:    { baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  custom:   { baseUrl: "", model: "" },
};

let aiConfigs = [];     // 多模型配置数组
let editingAiIdx = -1;  // 当前编辑的配置索引，-1 表示新增

// ── 渲染 AI 配置列表 ─────────────────────────────
function renderAiConfigs() {
  const list = document.getElementById("ai-configs-list");
  list.innerHTML = "";

  if (aiConfigs.length === 0) {
    list.innerHTML = '<div class="empty-tip">还没有配置大模型，请点击下方按钮添加</div>';
    return;
  }

  aiConfigs.forEach((cfg, idx) => {
    const card = document.createElement("div");
    card.className = "ai-config-card" + (cfg.isDefault ? " default" : "");

    const providerName = {
      openai: "OpenAI",
      deepseek: "DeepSeek",
      qwen: "通义千问",
      zhipu: "智谱 GLM",
      custom: "自定义"
    }[cfg.provider] || cfg.provider;

    card.innerHTML = `
      <div class="ai-card-header">
        <div>
          <span class="ai-card-name">${escapeHtml(cfg.name || "未命名")}</span>
          ${cfg.isDefault ? '<span class="ai-card-default-badge">默认</span>' : ''}
        </div>
        <div class="ai-card-actions">
          <button class="btn-icon-sm" data-edit="${idx}" title="编辑">✏️</button>
          <button class="btn-icon-sm" data-test="${idx}" title="测试">🔍</button>
          <button class="btn-icon-sm" data-del="${idx}" title="删除" style="color:#ef4444">🗑️</button>
        </div>
      </div>
      <div class="ai-card-info">
        <div><strong>提供商：</strong>${escapeHtml(providerName)}</div>
        <div class="ai-card-model"><strong>模型：</strong>${escapeHtml(cfg.model || "默认")}</div>
        <div style="margin-top:4px">
          <span class="tag">${cfg.apiKey ? "API Key 已配置" : "❌ 未配置 API Key"}</span>
        </div>
      </div>
    `;

    // 绑定事件
    card.querySelector("[data-edit]").addEventListener("click", () => openAiConfigModal(idx));
    card.querySelector("[data-test]").addEventListener("click", () => testAiConfig(idx));
    card.querySelector("[data-del]").addEventListener("click", () => {
      if (confirm(`确定删除「${cfg.name}」配置？`)) {
        // 如果删除的是默认配置，需要把第一个设为默认
        if (cfg.isDefault && aiConfigs.length > 1) {
          aiConfigs[(idx + 1) % aiConfigs.length].isDefault = true;
        }
        aiConfigs.splice(idx, 1);
        saveAiConfigs();
        renderAiConfigs();
      }
    });

    list.appendChild(card);
  });
}

// ── 打开添加/编辑 Modal ─────────────────────────
function openAiConfigModal(idx = -1) {
  editingAiIdx = idx;
  const modal = document.getElementById("ai-config-modal");
  const title = document.getElementById("ai-modal-title");

  title.textContent = idx === -1 ? "添加模型配置" : "编辑模型配置";

  // 清空或填充表单
  if (idx === -1) {
    document.getElementById("ai-config-name").value = "";
    document.getElementById("ai-provider").value = "openai";
    document.getElementById("ai-base-url").value = "";
    document.getElementById("ai-api-key").value = "";
    document.getElementById("ai-model").value = "";
    document.getElementById("ai-config-default").checked = (aiConfigs.length === 0);
    setApiModalStatus("ok", "");
  } else {
    const cfg = aiConfigs[idx];
    document.getElementById("ai-config-name").value = cfg.name || "";
    document.getElementById("ai-provider").value = cfg.provider || "openai";
    document.getElementById("ai-base-url").value = cfg.baseUrl || "";
    document.getElementById("ai-api-key").value = cfg.apiKey || "";
    document.getElementById("ai-model").value = cfg.model || "";
    document.getElementById("ai-config-default").checked = !!cfg.isDefault;
    setApiModalStatus("ok", "已配置");
  }

  // 触发 provider 变化以更新 UI
  document.getElementById("ai-provider").dispatchEvent(new Event("change"));

  modal.classList.add("open");
}

// ── Provider 选择事件 ─────────────────────────────
document.getElementById("ai-provider").addEventListener("change", function() {
  const val = this.value;
  const group = document.getElementById("group-base-url");
  group.style.display = val === "custom" ? "block" : "none";
  const defaults = PROVIDER_DEFAULTS[val] || {};
  if (defaults.model) document.getElementById("ai-model").placeholder = defaults.model;
  if (val !== "custom" && defaults.baseUrl) {
    document.getElementById("ai-base-url").value = defaults.baseUrl;
  }
});

// ── Modal 中测试 API 连接 ───────────────────────
document.getElementById("btn-test-api-in-modal").addEventListener("click", async () => {
  const provider = document.getElementById("ai-provider").value;
  const baseUrl = document.getElementById("ai-base-url").value.trim()
    || PROVIDER_DEFAULTS[provider]?.baseUrl || "";
  const apiKey = document.getElementById("ai-api-key").value.trim();
  const model = document.getElementById("ai-model").value.trim()
    || PROVIDER_DEFAULTS[provider]?.model || "gpt-4o";

  if (!apiKey) { setApiModalStatus("err", "请先填写 API Key"); return; }

  setApiModalStatus("loading", "连接中...");

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
      }),
    });

    if (resp.ok) {
      setApiModalStatus("ok", `✅ 连接成功（${model}）`);
    } else {
      const err = await resp.json().catch(() => ({}));
      setApiModalStatus("err", `❌ ${err?.error?.message || "连接失败 " + resp.status}`);
    }
  } catch (e) {
    setApiModalStatus("err", "❌ 网络错误：" + e.message);
  }
});

function setApiModalStatus(state, text) {
  const dot = document.getElementById("api-dot-modal");
  const span = document.getElementById("api-status-text-modal");
  dot.className = "status-dot " + state;
  span.textContent = text;
}

// ── 保存 AI 配置 ─────────────────────────────────
document.getElementById("btn-save-ai-config").addEventListener("click", async () => {
  const name = document.getElementById("ai-config-name").value.trim();
  const provider = document.getElementById("ai-provider").value;
  const baseUrl = document.getElementById("ai-base-url").value.trim()
    || PROVIDER_DEFAULTS[provider]?.baseUrl || "";
  const apiKey = document.getElementById("ai-api-key").value.trim();
  const model = document.getElementById("ai-model").value.trim()
    || PROVIDER_DEFAULTS[provider]?.model || "gpt-4o";
  const isDefault = document.getElementById("ai-config-default").checked;

  if (!name) { alert("请填写配置名称"); return; }
  if (!apiKey) { alert("请填写 API Key"); return; }

  const newConfig = { id: Date.now().toString(), name, provider, baseUrl, apiKey, model, isDefault };

  if (editingAiIdx === -1) {
    // 新增：如果设为默认，清除其他默认标记
    if (isDefault) {
      aiConfigs.forEach(c => c.isDefault = false);
    }
    aiConfigs.push(newConfig);
  } else {
    // 编辑：更新配置，如果设为默认，清除其他默认标记
    if (isDefault) {
      aiConfigs.forEach((c, i) => {
        if (i !== editingAiIdx) c.isDefault = false;
      });
    }
    aiConfigs[editingAiIdx] = { ...aiConfigs[editingAiIdx], ...newConfig };
  }

  // 确保至少有一个默认配置
  if (!aiConfigs.some(c => c.isDefault)) {
    aiConfigs[0].isDefault = true;
  }

  await saveAiConfigs();
  renderAiConfigs();

  // 关闭 Modal
  document.getElementById("ai-config-modal").classList.remove("open");
  showStatus("status-msg", "✅ 配置已保存");
});

// ── 测试指定配置 ─────────────────────────────────
async function testAiConfig(idx) {
  const cfg = aiConfigs[idx];
  if (!cfg.apiKey) {
    alert("该配置未设置 API Key");
    return;
  }

  try {
    const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
      }),
    });

    if (resp.ok) {
      alert(`✅ 「${cfg.name}」连接成功！
模型：${cfg.model}`);
    } else {
      const err = await resp.json().catch(() => ({}));
      alert(`❌ 连接失败：
${err?.error?.message || "HTTP " + resp.status}`);
    }
  } catch (e) {
    alert(`❌ 网络错误：${e.message}`);
  }
}

// ── 保存 AI 配置到存储 ─────────────────────────────
async function saveAiConfigs() {
  const maxSugg = parseInt(document.getElementById("ai-max-suggestions").value, 10) || 5;
  const lang = document.getElementById("ai-lang").value || "auto";

  await chrome.storage.local.set({
    aiConfigs,
    maxSuggestions: maxSugg,
    lang,
    // 兼容旧版：保存第一个配置作为 aiConfig 和 mha_config
    aiConfig: aiConfigs[0] || {},
    mha_config: aiConfigs[0] ? {
      apiKey: aiConfigs[0].apiKey,
      model: aiConfigs[0].model,
      provider: aiConfigs[0].provider,
      baseUrl: aiConfigs[0].baseUrl,
      maxSuggestions: maxSugg,
      lang,
    } : {}
  });
}

// ── 加载 AI 配置 ─────────────────────────────────
async function loadAiConfigs() {
  const res = await chrome.storage.local.get(["aiConfigs", "maxSuggestions", "lang", "aiConfig"]);
  
  // 优先使用新的 aiConfigs 数组，如果没有则从旧版 aiConfig 迁移
  if (res.aiConfigs && res.aiConfigs.length > 0) {
    aiConfigs = res.aiConfigs;
  } else if (res.aiConfig && res.aiConfig.apiKey) {
    // 迁移旧版配置
    aiConfigs = [{
      id: Date.now().toString(),
      name: "默认配置",
      provider: res.aiConfig.provider || "openai",
      baseUrl: res.aiConfig.baseUrl || "",
      apiKey: res.aiConfig.apiKey,
      model: res.aiConfig.model || "gpt-4o",
      isDefault: true,
    }];
    await saveAiConfigs();
  }

  if (res.maxSuggestions) document.getElementById("ai-max-suggestions").value = res.maxSuggestions;
  if (res.lang) document.getElementById("ai-lang").value = res.lang;

  renderAiConfigs();
}

// ── Modal 关闭按钮 ───────────────────────────────
document.querySelectorAll("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => {
    const modalId = btn.dataset.close;
    document.getElementById(modalId).classList.remove("open");
  });
});

// ── 添加按钮 ─────────────────────────────────────
document.getElementById("btn-add-ai-config").addEventListener("click", () => openAiConfigModal(-1));

// ── 批量导入通义千问模型 ─────────────────────────
document.getElementById("btn-import-qwen").addEventListener("click", async () => {
  const apiKey = prompt("请输入您的阿里云 API Key（sk-开头）：");
  if (!apiKey) return;

  // 通义千问免费模型列表（按过期时间排序，基于阿里云控制台真实数据）
  const qwenModels = [
    // 已用完额度的模型（不导入或标记为禁用）
    // { name: "Qwen-Max-2025-04-03（已用完）", model: "qwen-max-2025-04-03", disabled: true },

    // 快过期的模型（优先消耗）
    { name: "Qwen-Plus-2025-04-07（快过期-优先）", model: "qwen-plus-2025-04-07" },

    // 其他可用模型（按过期时间排序）
    { name: "Qwen-Plus-2025-04-20", model: "qwen-plus-2025-04-20" },
    { name: "Qwen-Plus-2025-04-25", model: "qwen-plus-2025-04-25" },
    { name: "Qwen-Max-2025-04-25", model: "qwen-max-2025-04-25" },
    { name: "Qwen-Plus-2025-05-01", model: "qwen-plus-2025-05-01" },
    { name: "Qwen-Max-2025-05-01", model: "qwen-max-2025-05-01" },
    { name: "Qwen-Plus-2025-05-10", model: "qwen-plus-2025-05-10" },
    { name: "Qwen-Turbo-2025-05-15", model: "qwen-turbo-2025-05-15" },
    { name: "Qwen-Max-2025-05-20", model: "qwen-max-2025-05-20" },
    { name: "Qwen-Turbo-2025-05-20", model: "qwen-turbo-2025-05-20" },

    // 最新版本模型（最后使用）
    { name: "Qwen-Max-Latest", model: "qwen-max" },
    { name: "Qwen-Plus-Latest", model: "qwen-plus" },
    { name: "Qwen-Turbo-Latest", model: "qwen-turbo" },
  ];

  // 生成配置
  const newConfigs = qwenModels.map((m, idx) => ({
    id: Date.now().toString() + "_" + idx,
    name: m.name,
    provider: "qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKey: apiKey,
    model: m.model,
    isDefault: idx === 0, // 第一个（最快过期的）设为默认
    disabled: m.disabled || false, // 标记是否禁用
  }));

  // 合并到现有配置
  aiConfigs = [...aiConfigs, ...newConfigs];
  await saveAiConfigs();
  renderAiConfigs();

  showStatus("status-msg", `✅ 已导入 ${qwenModels.length} 个通义千问模型，最快过期的已设为默认`);
});


// ═══════════════════════════════════════════════
// TAB: 房间信息 - 链接抓取
// ═══════════════════════════════════════════════
let rooms = [];
let editingRoomIdx = -1;
let scrapedData = null; // 当前抓取到的未确认数据
let batchScraping = false; // 是否正在批量抓取

// ── 抓取按钮（智能判断列表页/详情页）────────────────
document.getElementById("btn-scrape").addEventListener("click", async () => {
  const url = document.getElementById("scrape-url").value.trim();
  if (!url) { alert("请填写链接"); return; }

  if (!url.startsWith("http")) {
    alert("请输入有效的 HTTP/HTTPS 链接");
    return;
  }

  // 判断是列表页还是详情页（通用规则）
  const isList = /\/(?:listings|rooms|properties|houses|homes|stays|accommodations|list)(\/|\?|$)/.test(url)
                || /\/host\/house\/list/.test(url)
                || /[\?\&](?:list|all|filter|page)/.test(url);

  if (isList) {
    // 批量抓取
    await startBatchScrape(url);
  } else {
    // 单条抓取
    await startSingleScrape(url);
  }
});

// ── 单条抓取 ─────────────────────────────────
async function startSingleScrape(url) {
  setScrapeStatus("show", "正在打开页面，等待加载...");
  document.getElementById("scrape-preview").style.display = "none";
  document.getElementById("batch-progress").style.display = "none";
  document.getElementById("btn-scrape").disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "SCRAPE_ROOM",
      url,
    });

    if (!response.ok) {
      setScrapeStatus("error", "❌ 抓取失败：" + response.error);
      return;
    }

    setScrapeStatus("hide");
    scrapedData = response.data;
    showScrapePreview(scrapedData);

  } catch (err) {
    setScrapeStatus("error", "❌ 出错：" + err.message);
  } finally {
    document.getElementById("btn-scrape").disabled = false;
  }
}

// ── 批量抓取 ─────────────────────────────────
async function startBatchScrape(url) {
  batchScraping = true;
  document.getElementById("scrape-status").style.display = "none";
  document.getElementById("scrape-preview").style.display = "none";
  document.getElementById("batch-progress").style.display = "block";
  document.getElementById("btn-scrape").disabled = true;

  const progressBar = document.getElementById("batch-bar");
  const progressText = document.getElementById("batch-status-text");
  const detailText = document.getElementById("batch-detail-text");
  const percentText = document.getElementById("batch-percent");
  const cancelBtn = document.getElementById("btn-cancel-batch");

  let cancelled = false;
  cancelBtn.onclick = () => { cancelled = true; };

  function updateProgress(data) {
    if (cancelled) return;
    const { status, current = 0, total = 0, name = "", successCount = 0, failCount = 0 } = data;
    progressText.textContent = status;
    percentText.textContent = total > 0 ? Math.round((current / total) * 100) + "%" : "0%";
    progressBar.style.width = total > 0 ? (current / total) * 100 + "%" : "0%";

    const detailParts = [];
    if (current > 0 && total > 0) detailParts.push(`进度：${current}/${total}`);
    if (successCount > 0) detailParts.push(`<span class="batch-row-success">✅ ${successCount} 成功</span>`);
    if (failCount > 0) detailParts.push(`<span class="batch-row-fail">❌ ${failCount} 失败</span>`);
    if (name) detailParts.push(`当前：${name.substring(0, 20)}`);
    detailText.innerHTML = detailParts.join(" | ");
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "SCRAPE_ROOM_LIST",
      url,
      onProgress: updateProgress,
    });

    if (cancelled) {
      progressText.textContent = "已停止";
      return;
    }

    if (!response.ok) {
      progressText.textContent = "❌ 抓取失败：" + response.error;
      progressText.style.color = "#ef4444";
      return;
    }

    const { rooms: scrapedRooms = [], successCount = 0, failCount = 0 } = response.data || {};

    // 保存到 rooms
    const existingNames = new Set(rooms.map((r) => r.name));
    let newCount = 0;
    for (const room of scrapedRooms) {
      if (!existingNames.has(room.name)) {
        rooms.push(room);
        existingNames.add(room.name);
        newCount++;
      }
    }

    await chrome.storage.local.set({ rooms });
    renderRooms();

    // 显示结果摘要
    progressText.textContent = `✅ 抓取完成！新增 ${newCount} 个房间（重复 ${scrapedRooms.length - newCount} 个）`;
    progressText.style.color = "#059669";
    percentText.textContent = "100%";
    progressBar.style.width = "100%";

    if (newCount > 0) {
      setTimeout(() => {
        document.getElementById("room-list").scrollIntoView({ behavior: "smooth" });
      }, 500);
    }

    document.getElementById("scrape-url").value = "";

  } catch (err) {
    progressText.textContent = "❌ 出错：" + err.message;
    progressText.style.color = "#ef4444";
  } finally {
    batchScraping = false;
    document.getElementById("btn-scrape").disabled = false;
  }
}

function setScrapeStatus(state, text = "") {
  const box = document.getElementById("scrape-status");
  const txt = document.getElementById("scrape-status-text");
  const spinner = document.getElementById("scrape-spinner");

  if (state === "hide") {
    box.style.display = "none";
  } else if (state === "show") {
    box.style.display = "block";
    txt.textContent = text;
    spinner.style.display = "block";
    // 更新进度提示
    setTimeout(() => { if (box.style.display !== "none") txt.textContent = "等待页面渲染 (SPA)..."; }, 3000);
    setTimeout(() => { if (box.style.display !== "none") txt.textContent = "正在提取房源信息..."; }, 6000);
    if (scrapedData?.aiEnriched === undefined) {
      setTimeout(() => { if (box.style.display !== "none") txt.textContent = "AI 正在整理数据..."; }, 9000);
    }
  } else if (state === "error") {
    box.style.display = "block";
    txt.textContent = text;
    txt.style.color = "#b91c1c";
    spinner.style.display = "none";
  }
}

function showScrapePreview(data) {
  const preview = document.getElementById("scrape-preview");
  document.getElementById("preview-name").textContent =
    (data.aiEnriched ? "🤖 " : "") + (data.name || "未识别到名称");

  const fields = [
    { label: "描述",   value: data.description?.substring(0, 120) },
    { label: "价格",   value: data.price },
    { label: "位置",   value: data.location },
    { label: "入住",   value: data.checkin || data.checkout ? `${data.checkin || ""} / ${data.checkout || ""}` : "" },
    { label: "WiFi",   value: data.wifi },
    { label: "停车",   value: data.parking },
    { label: "联系",   value: data.contact },
    { label: "注意",   value: data.notes?.substring(0, 100) },
  ].filter((f) => f.value);

  const amenities = data.amenities || [];

  const container = document.getElementById("preview-fields");
  container.innerHTML = "";

  fields.forEach(({ label, value }) => {
    const row = document.createElement("div");
    row.className = "preview-field";
    row.innerHTML = `
      <span class="preview-field-label">${label}</span>
      <span class="preview-field-value">${escapeHtml(value)}</span>
    `;
    container.appendChild(row);
  });

  if (amenities.length > 0) {
    const row = document.createElement("div");
    row.className = "preview-field";
    row.innerHTML = `
      <span class="preview-field-label">设施</span>
      <span class="preview-field-value">${amenities.slice(0, 10).map((a) =>
        `<span class="preview-tag">${escapeHtml(a)}</span>`).join("")}</span>
    `;
    container.appendChild(row);
  }

  if (fields.length === 0 && amenities.length === 0) {
    container.innerHTML = `<div style="color:#9ca3af;font-size:12px;padding:4px 0">
      ⚠️ 未能识别到具体字段，将以原始文本形式添加。<br>
      建议切换到"编辑后添加"手动补充信息。
    </div>`;
  }

  preview.style.display = "block";
}

function escapeHtml(str) {
  return (str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ── 丢弃预览 ─────────────────────────────────
document.getElementById("btn-discard-preview").addEventListener("click", () => {
  document.getElementById("scrape-preview").style.display = "none";
  scrapedData = null;
});

// ── 直接添加（用抓取数据）──────────────────────
document.getElementById("btn-confirm-scraped").addEventListener("click", () => {
  if (!scrapedData) return;
  const room = buildRoomFromScrape(scrapedData);
  rooms.push(room);
  saveRooms();
  renderRooms();
  document.getElementById("scrape-preview").style.display = "none";
  document.getElementById("scrape-url").value = "";
  scrapedData = null;
  // 跳到已保存房间列表
  document.getElementById("room-list").scrollIntoView({ behavior: "smooth" });
});

// ── 编辑后添加（预填 Modal）───────────────────
document.getElementById("btn-edit-scraped").addEventListener("click", () => {
  if (!scrapedData) return;
  editingRoomIdx = -1;
  prefillRoomModal(scrapedData);
  document.getElementById("room-modal").classList.add("open");
});

function buildRoomFromScrape(data) {
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

// ═══════════════════════════════════════════════
// TAB: 房间信息 - 房间列表 & Modal
// ═══════════════════════════════════════════════

function renderRooms() {
  const list = document.getElementById("room-list");
  list.innerHTML = "";
  if (rooms.length === 0) {
    list.innerHTML = '<div class="empty-tip">还没有添加房间，请通过上方链接抓取或手动添加</div>';
    return;
  }
  rooms.forEach((room, idx) => {
    const div = document.createElement("div");
    div.className = "room-card";

    const badges = [];
    if (room.aiEnriched) badges.push('<span style="font-size:10px;background:#dbeafe;color:#1e40af;border-radius:4px;padding:1px 5px">AI整理</span>');
    if (room.sourceUrl)  badges.push('<span style="font-size:10px;background:#d1fae5;color:#065f46;border-radius:4px;padding:1px 5px">已抓取</span>');

    div.innerHTML = `
      <div class="room-card-header">
        <span class="room-name">🏠 ${room.name} ${badges.join(" ")}</span>
        <div class="room-actions">
          <button class="btn-icon-sm" data-edit="${idx}" title="编辑">✏️</button>
          <button class="btn-icon-sm" data-del="${idx}" title="删除">🗑️</button>
        </div>
      </div>
      <div class="room-desc">
        ${room.price ? `<b>价格：</b>${room.price}　` : ""}
        ${room.location ? `<b>位置：</b>${room.location.substring(0, 30)}　` : ""}
        ${room.desc ? room.desc.substring(0, 60) + (room.desc.length > 60 ? "…" : "") : ""}
      </div>
    `;
    div.querySelector("[data-edit]").addEventListener("click", () => openRoomModal(idx));
    div.querySelector("[data-del]").addEventListener("click", () => {
      if (confirm(`确定删除房间「${room.name}」？`)) {
        rooms.splice(idx, 1);
        saveRooms();
        renderRooms();
      }
    });
    list.appendChild(div);
  });
}

function openRoomModal(idx) {
  editingRoomIdx = idx;
  const modal = document.getElementById("room-modal");
  document.getElementById("room-modal-title").textContent = idx === -1 ? "手动添加房间" : "编辑房间";
  const room = idx === -1 ? {} : rooms[idx];
  prefillRoomModal(room);
  modal.classList.add("open");
}

function prefillRoomModal(data) {
  document.getElementById("room-name").value     = data.name     || "";
  document.getElementById("room-desc").value     = data.desc || data.description || "";
  document.getElementById("room-price").value    = data.price    || "";
  document.getElementById("room-location").value = data.location || "";
  document.getElementById("room-checkin").value  = [data.checkin, data.checkout].filter(Boolean).join(" / ");
  document.getElementById("room-wifi").value     = data.wifi     || "";
  document.getElementById("room-parking").value  = data.parking  || "";
  document.getElementById("room-notes").value    = data.notes    || "";
  document.getElementById("room-url").value      = data.sourceUrl || data.url || "";
}

document.getElementById("btn-add-room").addEventListener("click", () => openRoomModal(-1));

document.getElementById("room-modal-cancel").addEventListener("click", () => {
  document.getElementById("room-modal").classList.remove("open");
});

document.getElementById("room-modal-save").addEventListener("click", () => {
  const name    = document.getElementById("room-name").value.trim();
  const desc    = document.getElementById("room-desc").value.trim();
  const price   = document.getElementById("room-price").value.trim();
  const location = document.getElementById("room-location").value.trim();
  const checkin = document.getElementById("room-checkin").value.trim();
  const wifi    = document.getElementById("room-wifi").value.trim();
  const parking = document.getElementById("room-parking").value.trim();
  const notes   = document.getElementById("room-notes").value.trim();
  const url     = document.getElementById("room-url").value.trim();

  if (!name) { alert("请填写房间名称"); return; }

  const room = {
    name, desc, price, location, checkin, wifi, parking, notes,
    sourceUrl: url,
    // 保留已有的 amenities / aiEnriched 等字段（编辑模式）
    ...(editingRoomIdx >= 0 ? {
      amenities:  rooms[editingRoomIdx].amenities  || [],
      aiEnriched: rooms[editingRoomIdx].aiEnriched || false,
      scrapedAt:  rooms[editingRoomIdx].scrapedAt  || "",
    } : {}),
    ...(scrapedData && editingRoomIdx === -1 ? {
      amenities:  scrapedData.amenities  || [],
      aiEnriched: scrapedData.aiEnriched || false,
      scrapedAt:  scrapedData.scrapedAt  || "",
    } : {}),
  };

  if (editingRoomIdx === -1) {
    rooms.push(room);
  } else {
    rooms[editingRoomIdx] = { ...rooms[editingRoomIdx], ...room };
  }

  scrapedData = null;
  saveRooms();
  renderRooms();
  document.getElementById("room-modal").classList.remove("open");
  document.getElementById("scrape-preview").style.display = "none";
});

async function saveRooms() {
  await chrome.storage.local.set({ rooms });
}

// ═══════════════════════════════════════════════
// TAB: 回复规则 - 知识库
// ═══════════════════════════════════════════════
let knowledgeBase = []; // 全量知识库条目（已启用的）
let kbFiltered   = []; // 当前过滤后的条目
let kbPage       = 1;
const KB_PAGE_SIZE = 15;

// ── 文件选择 ──────────────────────────────────
const kbFileInput = document.getElementById("kb-file-input");
const kbDropZone  = document.getElementById("kb-drop-zone");

kbDropZone.addEventListener("dragover", (e) => { e.preventDefault(); kbDropZone.classList.add("drag-over"); });
kbDropZone.addEventListener("dragleave", () => kbDropZone.classList.remove("drag-over"));
kbDropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  kbDropZone.classList.remove("drag-over");
  const file = e.dataTransfer?.files?.[0];
  if (file) importKbFile(file);
});
kbFileInput.addEventListener("change", () => {
  if (kbFileInput.files[0]) importKbFile(kbFileInput.files[0]);
});
document.getElementById("kb-reload-btn").addEventListener("click", () => {
  document.getElementById("kb-empty-state").style.display = "block";
  document.getElementById("kb-loaded-state").style.display = "none";
  // 让用户重新选择文件
  kbFileInput.value = "";
  kbFileInput.click();
});
document.getElementById("kb-clear-btn").addEventListener("click", async () => {
  if (!confirm("确定清空知识库？")) return;
  await chrome.storage.local.remove("knowledgeBase");
  knowledgeBase = [];
  kbFiltered = [];
  document.getElementById("kb-empty-state").style.display = "block";
  document.getElementById("kb-loaded-state").style.display = "none";
  setKbImportStatus("✅ 已清空");
});

// ── 手动添加规则 ──────────────────────────────
document.getElementById("btn-add-manual-kb").addEventListener("click", async () => {
  const keyword = document.getElementById("kb-manual-keyword").value.trim();
  const reply = document.getElementById("kb-manual-reply").value.trim();
  const properties = document.getElementById("kb-manual-properties").value.trim();
  const enabled = document.getElementById("kb-manual-enabled").checked;

  if (!keyword) {
    alert("请输入关键词");
    return;
  }
  if (!reply) {
    alert("请输入回复内容");
    return;
  }

  // 检查关键词是否已存在（精确匹配独立关键词，避免"价格"匹配"最低价格"）
  const existingEntry = knowledgeBase.find(e => {
    const cond = e.trigger_condition || "";
    const cleaned = cond.replace(/^(?:关键字|关键词|keyword)[\s]*[:：][\s]*/i, "").trim();
    const keywords = cleaned.split(/[,，、;；\/|]/).map(k => k.trim().toLowerCase());
    return keywords.includes(keyword.trim().toLowerCase());
  });
  if (existingEntry) {
    alert(`关键词"${keyword}"已存在！\n现有规则：${existingEntry.reply_content.substring(0, 50)}...`);
    return;
  }

  // 创建新的知识库条目
  const newEntry = {
    id: Date.now().toString(),
    trigger_type: "关键词回复",
    trigger_condition: `关键字:${keyword}`,
    reply_content: reply,
    applicable_properties: properties || "全部", // 空值表示全部房源
    status: enabled ? "启用" : "禁用",
    trigger_count: 0,
  };

  // 添加到知识库
  knowledgeBase.push(newEntry);
  await chrome.storage.local.set({ knowledgeBase });

  // 清空输入框
  document.getElementById("kb-manual-keyword").value = "";
  document.getElementById("kb-manual-reply").value = "";
  document.getElementById("kb-manual-properties").value = "";
  document.getElementById("kb-manual-enabled").checked = true;

  // 更新 UI
  document.getElementById("kb-empty-state").style.display = "none";
  document.getElementById("kb-loaded-state").style.display = "block";
  applyKbFilter();

  setKbImportStatus("✅ 已添加规则");
});

// ── 导入 ──────────────────────────────────────
async function importKbFile(file) {
  setKbImportStatus("⏳ 读取文件...");
  try {
    const text = await file.text();
    let entries = [];

    // 支持 ndjson（每行一条）或标准 JSON 数组
    const trimmed = text.trim();
    if (trimmed.startsWith("[")) {
      entries = JSON.parse(trimmed);
    } else {
      // NDJSON
      entries = trimmed.split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l));
    }

    if (!Array.isArray(entries) || entries.length === 0) throw new Error("文件无有效数据");

    // 标准化字段
    const normalized = entries.map((e) => ({
      id:             e.id || Math.random().toString(36).slice(2),
      trigger_type:   e.trigger_type || "关键词回复",
      trigger_condition: e.trigger_condition || "",
      reply_content:  e.reply_content || "",
      applicable_properties: e.applicable_properties || "全部",
      applicable_stages: e.applicable_stages || "",
      status:         e.status === "禁用" ? "禁用" : "启用", // 缺少字段默认为启用
      trigger_count:  e.trigger_count || 0,
    }));

    knowledgeBase = normalized;
    await chrome.storage.local.set({ knowledgeBase: normalized });
    setKbImportStatus(`✅ 成功导入 ${normalized.length} 条规则（${normalized.filter(e=>e.status==="启用").length} 条已启用）`);
    applyKbFilter();
    showKbLoaded();
  } catch (err) {
    setKbImportStatus("❌ 导入失败：" + err.message);
  }
}

function setKbImportStatus(msg) {
  const el = document.getElementById("kb-import-status");
  if (el) el.textContent = msg;
}

function showKbLoaded() {
  document.getElementById("kb-empty-state").style.display = "none";
  document.getElementById("kb-loaded-state").style.display = "block";
}

// ── 过滤 + 渲染 ───────────────────────────────
document.getElementById("kb-search").addEventListener("input", () => { kbPage = 1; applyKbFilter(); });
document.getElementById("kb-filter-type").addEventListener("change", () => { kbPage = 1; applyKbFilter(); });

function applyKbFilter() {
  const search = document.getElementById("kb-search").value.trim().toLowerCase();
  const typeFilter = document.getElementById("kb-filter-type").value;

  kbFiltered = knowledgeBase.filter((e) => {
    if (typeFilter && !e.trigger_type.includes(typeFilter)) return false;
    if (search) {
      const haystack = (e.trigger_condition + e.reply_content + e.applicable_properties).toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  // 更新统计
  const enabled = knowledgeBase.filter((e) => e.status === "启用").length;
  const types   = new Set(knowledgeBase.map((e) => e.trigger_type)).size;
  document.getElementById("kb-total").textContent   = knowledgeBase.length;
  document.getElementById("kb-enabled").textContent = enabled;
  document.getElementById("kb-types").textContent   = types;

  renderKbList();
}

function renderKbList() {
  const list = document.getElementById("kb-list");
  const start = (kbPage - 1) * KB_PAGE_SIZE;
  const page  = kbFiltered.slice(start, start + KB_PAGE_SIZE);

  list.innerHTML = "";
  if (kbFiltered.length === 0) {
    list.innerHTML = '<div class="empty-tip">没有匹配的规则</div>';
    document.getElementById("kb-pagination").innerHTML = "";
    return;
  }

  page.forEach((entry, displayIndex) => {
    const div = document.createElement("div");
    div.className = "kb-item" + (entry.status !== "启用" ? " disabled" : "");

    // 关键词提取
    const keyword = entry.trigger_condition
      .replace(/^关键字[:：]\s*/i, "")
      .replace(/^咨询问题[:：]\s*/i, "❓")
      .replace(/^新的订单$/, "新订单")
      .substring(0, 50);

    const typeClass = entry.trigger_type === "booking" ? "booking"
                    : entry.trigger_type === "checkin_checkout" ? "checkin" : "";
    const isEnabled = entry.status === "启用";

    // 在 knowledgeBase 中查找真实索引
    const realIndex = knowledgeBase.findIndex(e => e.id === entry.id);

    div.innerHTML = `
      <div class="kb-item-header">
        <span class="kb-keyword" title="${escapeHtml(entry.trigger_condition)}">${escapeHtml(keyword)}</span>
        <span class="kb-type-badge ${typeClass}">${escapeHtml(entry.trigger_type)}</span>
        ${!isEnabled ? '<span style="font-size:10px;color:#ef4444">禁用</span>' : ""}
      </div>
      <div class="kb-item-content">${escapeHtml(entry.reply_content)}</div>
      ${entry.applicable_properties && entry.applicable_properties !== "全部"
        ? `<div class="kb-item-prop">📍 ${escapeHtml(entry.applicable_properties.substring(0, 60))}</div>`
        : ""}
      <div class="kb-item-actions">
        <button class="kb-btn-toggle" data-idx="${realIndex}" title="${isEnabled ? '禁用' : '启用'}">
          ${isEnabled ? '🔌' : '▶️'}
        </button>
        <button class="kb-btn-delete" data-idx="${realIndex}" title="删除">🗑️</button>
      </div>
    `;

    // 绑定事件
    div.querySelector(".kb-btn-toggle").addEventListener("click", () => {
      if (realIndex === -1) return;
      knowledgeBase[realIndex].status = isEnabled ? "禁用" : "启用";
      chrome.storage.local.set({ knowledgeBase });
      applyKbFilter();
    });

    div.querySelector(".kb-btn-delete").addEventListener("click", () => {
      if (realIndex === -1) return;
      if (!confirm(`确定删除这条规则？\n关键词：${keyword}`)) return;
      knowledgeBase.splice(realIndex, 1);
      chrome.storage.local.set({ knowledgeBase });
      applyKbFilter();
    });

    list.appendChild(div);
  });

  // 分页
  const totalPages = Math.ceil(kbFiltered.length / KB_PAGE_SIZE);
  const pag = document.getElementById("kb-pagination");
  pag.innerHTML = "";
  if (totalPages <= 1) return;

  const makeBtn = (label, page, isActive) => {
    const btn = document.createElement("button");
    btn.className = "kb-page-btn" + (isActive ? " active" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => { kbPage = page; renderKbList(); });
    pag.appendChild(btn);
  };

  if (kbPage > 1) makeBtn("‹", kbPage - 1, false);
  const startP = Math.max(1, kbPage - 2);
  const endP   = Math.min(totalPages, kbPage + 2);
  for (let p = startP; p <= endP; p++) makeBtn(p, p, p === kbPage);
  if (kbPage < totalPages) makeBtn("›", kbPage + 1, false);
}

// ═══════════════════════════════════════════════
// TAB: 回复规则
// ═══════════════════════════════════════════════
let rules = [];

function renderRules() {
  const list = document.getElementById("rule-list");
  list.innerHTML = "";
  if (rules.length === 0) {
    list.innerHTML = '<div class="empty-tip">还没有添加规则</div>';
    return;
  }
  rules.forEach((rule, idx) => {
    const li = document.createElement("div");
    li.className = "rule-item";
    li.innerHTML = `
      <div class="rule-number">${idx + 1}</div>
      <div class="rule-text">${rule}</div>
      <button class="btn-del-rule" data-idx="${idx}" title="删除">✕</button>
    `;
    li.querySelector(".btn-del-rule").addEventListener("click", () => {
      rules.splice(idx, 1);
      saveRules();
      renderRules();
    });
    list.appendChild(li);
  });
}

document.getElementById("btn-add-rule").addEventListener("click", addRule);
document.getElementById("new-rule-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addRule();
});

function addRule() {
  const input = document.getElementById("new-rule-input");
  const text = input.value.trim();
  if (!text) return;
  rules.push(text);
  saveRules();
  renderRules();
  input.value = "";
}

async function saveRules() {
  await chrome.storage.local.set({ replyRules: rules });
}

function renderRuleTemplates() {
  const wrap = document.getElementById("rule-templates");
  wrap.innerHTML = "";
  RULE_TEMPLATES.forEach((tpl) => {
    const btn = document.createElement("button");
    btn.style.cssText = `
      display:flex;align-items:flex-start;gap:8px;
      background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;
      padding:8px 10px;width:100%;text-align:left;cursor:pointer;
      font-size:12px;color:#374151;line-height:1.5;
      transition:background 0.15s;font-family:inherit;
    `;
    btn.innerHTML = `<span style="flex-shrink:0">${tpl.icon}</span><span>${tpl.text}</span>`;
    btn.addEventListener("mouseover", () => { btn.style.background = "#ede9fe"; });
    btn.addEventListener("mouseout",  () => { btn.style.background = "#f5f3ff"; });
    btn.addEventListener("click", () => {
      if (!rules.includes(tpl.text)) {
        rules.push(tpl.text);
        saveRules();
        renderRules();
      }
    });
    wrap.appendChild(btn);
  });
}

// ═══════════════════════════════════════════════
// TAB: 风格学习
// ═══════════════════════════════════════════════
async function loadStyleStats() {
  const res = await chrome.storage.local.get("userStyle");
  const style = res.userStyle || {};
  const count = style.sampleCount || 0;
  const lv = getLevel(count);

  document.getElementById("stat-count").textContent = count;
  document.getElementById("stat-level").textContent = lv.emoji;

  const tagLang = document.getElementById("tag-lang");
  const tagTone = document.getElementById("tag-tone");
  const tagLen  = document.getElementById("tag-len");

  if (style.language) {
    tagLang.textContent = style.language === "zh" ? "🇨🇳 中文为主" : "🇬🇧 英文为主";
    tagLang.style.display = "inline";
  }
  if (style.tone) {
    tagTone.textContent = style.tone === "formal" ? "🎩 正式" : "😊 轻松";
    tagTone.style.display = "inline";
  }
  if (style.avgLength) {
    tagLen.textContent = `✏️ 均 ${style.avgLength} 字`;
    tagLen.style.display = "inline";
  }

  const cloud = document.getElementById("phrase-cloud");
  const phrases = style.commonPhrases || [];
  if (phrases.length > 0) {
    cloud.innerHTML = phrases.slice(0, 16).map((p) =>
      `<span class="phrase-item">${p}</span>`).join("");
  } else {
    cloud.innerHTML = '<span class="empty-tip">回复更多消息后将显示常用词汇</span>';
  }
}

async function loadSettings() {
  const res = await chrome.storage.local.get("settings");
  const s = res.settings || {};
  document.getElementById("setting-autoExpand").checked    = s.autoExpand    !== false;
  document.getElementById("setting-learnMode").checked     = s.learnMode     !== false;
  document.getElementById("setting-notifyEnabled").checked = s.notifyEnabled !== false;
}

document.getElementById("btn-save-settings").addEventListener("click", async () => {
  await chrome.storage.local.set({
    settings: {
      autoExpand:     document.getElementById("setting-autoExpand").checked,
      learnMode:      document.getElementById("setting-learnMode").checked,
      notifyEnabled:  document.getElementById("setting-notifyEnabled").checked,
      checkInterval:  5000,
    },
  });
  showStatus("status-msg-style", "✅ 设置已保存");
});

document.getElementById("btn-clear-style").addEventListener("click", async () => {
  if (!confirm("确定清除所有学习数据？")) return;
  await chrome.storage.local.set({ userStyle: { samples: [], sampleCount: 0 } });
  showStatus("status-msg-style", "🗑️ 已清除", "err");
  loadStyleStats();
});

// ═══════════════════════════════════════════════
// 初始化
// ═══════════════════════════════════════════════
async function init() {
  const data = await chrome.storage.local.get([
    "aiConfigs", "aiConfig", "rooms", "propInfo", "replyRules", "userStyle", "settings", "knowledgeBase", "mha_config", "maxSuggestions", "lang",
  ]);

  // AI 配置 - 新版多模型配置
  await loadAiConfigs();

  // 房间
  rooms = data.rooms || [];
  renderRooms();

  // 规则
  rules = data.replyRules || [];
  renderRules();
  renderRuleTemplates();

  // 知识库
  if (data.knowledgeBase?.length > 0) {
    knowledgeBase = data.knowledgeBase;
    applyKbFilter();
    showKbLoaded();
  }

  // 风格
  loadStyleStats();
  loadSettings();

  // 同步状态
  loadSyncStatus();

  // 初始化同步登录
  SyncUI.initSyncUI();
  initSyncAuth();
}

// ═══════════════════════════════════════════════
// TAB: 同步 ☁️
// ═══════════════════════════════════════════════

// ── 加载同步状态 ─────────────────────────────
async function loadSyncStatus() {
  try {
    const metadata = await syncService.getSyncMetadata();
    const stats = await syncService.getStorageStats();

    // 更新上次同步时间
    const lastTimeEl = document.getElementById("sync-last-time");
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

    // 更新数据统计
    const totalKeys = Object.keys(stats.byKey).filter(
      k => stats.byKey[k].type !== "empty"
    ).length;
    document.getElementById("sync-data-count").textContent =
      `${totalKeys} 个模块（${stats.totalItems} 条记录）`;

    // 更新同步状态徽章
    const badge = document.getElementById("sync-status-badge");
    badge.className = "sync-badge";
    if (metadata.lastSyncTime) {
      const lastSync = new Date(metadata.lastSyncTime);
      const now = new Date();
      const hoursDiff = (now - lastSync) / (1000 * 60 * 60);

      if (hoursDiff < 24) {
        badge.textContent = "✅ 已同步";
        badge.classList.add("synced");
      } else {
        badge.textContent = "⚠️ 需更新";
        badge.classList.add("pending");
      }
    } else {
      badge.textContent = "未同步";
      badge.classList.add("pending");
    }
  } catch (err) {
    console.error("[Popup] 加载同步状态失败:", err);
  }
}

// ── 导出数据 ────────────────────────────────
document.getElementById("btn-sync-export").addEventListener("click", async () => {
  const msgEl = document.getElementById("sync-msg");
  try {
    msgEl.textContent = "⏳ 正在导出数据...";
    msgEl.style.color = "#6b7280";

    const jsonData = await syncService.exportData();

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

    msgEl.textContent = "✅ 导出成功！";
    msgEl.style.color = "#059669";
    loadSyncStatus();

    setTimeout(() => { msgEl.textContent = ""; }, 3000);
  } catch (err) {
    msgEl.textContent = "❌ 导出失败：" + err.message;
    msgEl.style.color = "#dc2626";
    console.error("[Popup] 导出失败:", err);
  }
});

// ── 导入数据 ────────────────────────────────
document.getElementById("btn-sync-import").addEventListener("click", async () => {
  // 创建文件输入
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const msgEl = document.getElementById("sync-msg");
    try {
      msgEl.textContent = "⏳ 正在读取文件...";
      msgEl.style.color = "#6b7280";

      const text = await file.text();

      // 验证格式
      const validation = syncService.validateImportData(text);
      if (!validation.valid) {
        msgEl.textContent = "❌ 无效文件：" + validation.error;
        msgEl.style.color = "#dc2626";
        return;
      }

      // 询问合并策略
      const merge = confirm(
        '导入模式选择：\n\n✅ 确定：合并模式（保留已有数据，新增数据合并）\n❌ 取消：覆盖模式（完全替换为导入数据）\n\n建议首次导入选择"确定"，后续同步选择"取消"覆盖。'
      );

      msgEl.textContent = "⏳ 正在导入数据...";
      const result = await syncService.importData(text, { merge });

      // 更新同步状态
      await syncService.updateSyncMetadata({
        lastSyncTime: new Date().toISOString(),
        lastSyncStatus: "import",
      });

      msgEl.textContent = `✅ 导入成功！新增 ${result.imported} 项，跳过 ${result.skipped} 项`;
      msgEl.style.color = "#059669";

      // 刷新页面数据
      await init();

      setTimeout(() => { msgEl.textContent = ""; }, 5000);
    } catch (err) {
      msgEl.textContent = "❌ 导入失败：" + err.message;
      msgEl.style.color = "#dc2626";
      console.error("[Popup] 导入失败:", err);
    }
  });
  input.click();
});

// 同步 tab 切换时刷新状态
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.tab === "tab-sync") {
      loadSyncStatus();
    }
  });
});

// 等待 DOM 加载完成后再初始化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// ── 同步登录/注册事件绑定 ─────────────────────
async function initSyncAuth() {
  // 先确保同步设置已加载
  await SyncUI.loadSyncSettings();

  // 加载认证状态
  await syncAuthManager.loadAuthState();
  updateSyncAuthUI();

  // 监听认证状态变更
  syncAuthManager.addListener(updateSyncAuthUI);

  // 登录按钮
  document.getElementById("btn-sync-login")?.addEventListener("click", () => {
    document.getElementById("login-modal").classList.add("open");
  });

  // 注册按钮
  document.getElementById("btn-sync-register")?.addEventListener("click", () => {
    document.getElementById("register-modal").classList.add("open");
  });

  // 登录对话框取消
  document.getElementById("login-cancel")?.addEventListener("click", () => {
    document.getElementById("login-modal").classList.remove("open");
  });

  // 注册对话框取消
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
  document.getElementById("sync-detail").style.display = "none";
}

// 处理云端同步（需登录）
async function handleCloudSync() {
  if (!syncAuthManager.isLoggedIn()) {
    document.getElementById("login-modal").classList.add("open");
    return;
  }
  await handleSyncNow();
}

