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

  if (!syncConfig.enabled || !syncConfig.cloudEndpoint) {
    return { success: false, message: "请先配置云端同步" };
  }

  const msgEl = document.getElementById("sync-msg");
  const badge = document.getElementById("sync-status-badge");

  try {
    // 更新 UI 状态
    if (msgEl) {
      msgEl.textContent = "正在同步...";
      msgEl.style.color = "#6b7280";
    }
    if (badge) {
      badge.textContent = "同步中";
      badge.className = "sync-badge pending";
    }

    // 导出数据
    const jsonData = await syncService.exportData();

    // 上传到云端
    const uploadResult = await uploadToCloud(jsonData);
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

    if (msgEl) {
      msgEl.textContent = "同步成功";
      msgEl.style.color = "#059669";
      setTimeout(() => {
        msgEl.textContent = "";
      }, 3000);
    }

    console.log("[Popup-Sync] 同步完成");
    return { success: true, message: "同步成功" };
  } catch (err) {
    console.error("[Popup-Sync] 同步失败:", err);

    if (msgEl) {
      msgEl.textContent = `同步失败: ${err.message}`;
      msgEl.style.color = "#dc2626";
    }

    showSyncError();

    return { success: false, message: err.message };
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
        "导入模式选择:\n\n确定: 合并模式（保留已有数据，新增数据合并）\n取消: 覆盖模式（完全替换为导入数据）\n\n建议首次导入选择"确定"，后续同步选择"取消"覆盖。"
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
  };
}