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
      alert(`✅ 「${cfg.name}」连接成功！\n模型：${cfg.model}`);
    } else {
      const err = await resp.json().catch(() => ({}));
      alert(`❌ 连接失败：\n${err?.error?.message || "HTTP " + resp.status}`);
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
