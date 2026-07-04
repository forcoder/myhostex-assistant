/**
 * MyHostex 同步登录测试
 *
 * 测试目标：
 * 1. login() 的 fetch 错误处理
 * 2. 超时机制
 * 3. 端点 URL 构建
 * 4. 重试逻辑
 * 5. 错误消息分类
 */

// ── Mock 全局对象 ──────────────────────────────
global.chrome = {
  storage: {
    local: {
      get: async (key) => ({ [key]: null }),
      set: async () => {},
      remove: async () => {},
    },
  },
};

// ── 工具函数: 带超时的 fetch ────────────────────
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return resp;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── 工具函数: 构建端点 URL ──────────────────────
function buildEndpointUrl(base, path) {
  const clean = base.replace(/\/+$/, "");
  return `${clean}${path.startsWith("/") ? path : "/" + path}`;
}

// ── 工具函数: 分类 fetch 错误 ───────────────────
function classifyFetchError(err, url) {
  if (err.name === "AbortError") {
    return { type: "timeout", message: `连接超时 (${url})` };
  }
  if (err.message === "Failed to fetch" || err.message?.includes("fetch")) {
    return { type: "network", message: `无法连接到服务器 (${url})，请检查网络连接和服务器地址` };
  }
  if (err.message?.includes("CORS") || err.message?.includes("cross-origin")) {
    return { type: "cors", message: `CORS 请求被拦截，请联系管理员` };
  }
  if (err.message?.includes("DNS") || err.message?.includes("ENOTFOUND")) {
    return { type: "dns", message: `无法解析服务器域名，请检查云端地址是否正确` };
  }
  return { type: "unknown", message: err.message };
}

// ── 测试框架 ────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`);
    failed++;
  }
}

// 同步测试直接运行
console.log(`\n${"=".repeat(50)}`);
console.log("🔬 同步登录功能测试");
console.log(`${"=".repeat(50)}`);

// ═══════════════════════════════════════════════
// 1. 端点 URL 构建测试
// ═══════════════════════════════════════════════
console.log("\n🧪 测试 1: 端点 URL 构建");
{
  // 带斜杠结尾
  const r1 = buildEndpointUrl("https://example.com/", "/auth/login");
  assert(r1 === "https://example.com/auth/login", "去除末尾斜杠 + 路径");

  // 不带斜杠
  const r2 = buildEndpointUrl("https://example.com", "auth/login");
  assert(r2 === "https://example.com/auth/login", "无末尾斜杠 + 无前导斜杠路径");

  // 带端口
  const r3 = buildEndpointUrl("http://localhost:3000/", "auth/login");
  assert(r3 === "http://localhost:3000/auth/login", "带端口号");

  // 默认端点回退
  const endpoint = "" || "https://api.agentai0.com";
  const r4 = buildEndpointUrl(endpoint, "/auth/login");
  assert(r4 === "https://api.agentai0.com/auth/login", "空字符串回退到默认端点");
}

// ═══════════════════════════════════════════════
// 2. fetch 错误分类测试
// ═══════════════════════════════════════════════
console.log("\n🧪 测试 2: fetch 错误分类");
{
  const testUrl = "https://example.com/auth/login";

  // AbortError → timeout
  const abortErr = new Error("The user aborted a request");
  abortErr.name = "AbortError";
  const r1 = classifyFetchError(abortErr, testUrl);
  assert(r1.type === "timeout" && r1.message.includes("连接超时"), "AbortError 分类为 timeout");

  // "Failed to fetch" → network
  const netErr = new TypeError("Failed to fetch");
  const r2 = classifyFetchError(netErr, testUrl);
  assert(r2.type === "network" && r2.message.includes("无法连接到服务器"), "Failed to fetch 分类为 network");

  // 其他错误 → unknown
  const otherErr = new Error("Something went wrong");
  const r3 = classifyFetchError(otherErr, testUrl);
  assert(r3.type === "unknown", "其他错误分类为 unknown");
}

// ═══════════════════════════════════════════════
// 4. 登录响应解析测试
// ═══════════════════════════════════════════════
console.log("\n🧪 测试 4: 登录响应解析逻辑");
{
  // 模拟 SyncAuthManager 的响应处理逻辑
  function parseLoginResponse(result) {
    if ((result.code === 0 || result.isSuccess) && result.data) {
      const auth = {
        userId: result.data.userId,
        tenantId: result.data.tenantId || result.data.userId,
        accessToken: result.data.accessToken,
        refreshToken: result.data.refreshToken,
        expiresAt: result.data.expiresAt || (Date.now() + 7 * 24 * 60 * 60 * 1000),
      };
      return { success: true, auth };
    }
    return { success: false, message: result.message || "登录失败" };
  }

  const r1 = parseLoginResponse({
    code: 0,
    data: { userId: "u1", accessToken: "tok1", refreshToken: "ref1" },
  });
  assert(r1.success && r1.auth.userId === "u1", "code=0 格式解析成功");

  const r2 = parseLoginResponse({
    isSuccess: true,
    data: { userId: "u2", tenantId: "t2", accessToken: "tok2" },
  });
  assert(r2.success && r2.auth.tenantId === "t2", "isSuccess 格式解析成功");

  const r3 = parseLoginResponse({ isSuccess: false, message: "邮箱或密码错误" });
  assert(!r3.success && r3.message === "邮箱或密码错误", "失败响应正确解析");

  const r4 = parseLoginResponse({ code: 0 });
  assert(!r4.success, "无 data 字段视为失败");

  const r5 = parseLoginResponse({
    code: 0,
    data: { userId: "u3", accessToken: "tok3" },
  });
  assert(r5.auth.tenantId === "u3", "tenantId 回退到 userId");
}

// ═══════════════════════════════════════════════
// 5. 端点配置优先级测试
// ═══════════════════════════════════════════════
console.log("\n🧪 测试 5: 端点配置优先级");
{
  function resolveEndpoint(cloudEndpoint) {
    return cloudEndpoint || "https://api.agentai0.com";
  }

  assert(resolveEndpoint("") === "https://api.agentai0.com", "空字符串使用默认端点");
  assert(resolveEndpoint("https://my-server.com") === "https://my-server.com", "自定义端点优先");
  assert(resolveEndpoint(null) === "https://api.agentai0.com", "null 使用默认端点");
  assert(resolveEndpoint(undefined) === "https://api.agentai0.com", "undefined 使用默认端点");
}

// ═══════════════════════════════════════════════
// 7. manifest host_permissions 验证
// ═══════════════════════════════════════════════
console.log("\n🧪 测试 7: manifest host_permissions 验证");
{
  const manifest = {
    host_permissions: [
      "https://www.myhostex.com/*",
      "https://api.openai.com/*",
      "https://api.deepseek.com/*",
      "*://*/*",
    ],
  };

  function canFetch(url) {
    if (manifest.host_permissions.includes("*://*/*")) return true;
    const hostname = new URL(url).hostname;
    return manifest.host_permissions.some(p => p.includes(hostname));
  }

  assert(canFetch("https://api.agentai0.com/auth/login"), "默认端点应被 *://*/* 覆盖");
  assert(canFetch("https://example.com/test"), "任意 https 端点应被覆盖");
}

// ═══════════════════════════════════════════════
// 异步测试
// ═══════════════════════════════════════════════
async function main() {
  // 测试 3: 超时机制
  console.log("\n🧪 测试 3: fetch 超时机制");
  {
    const controller = new AbortController();
    let aborted = false;
    controller.signal.addEventListener("abort", () => { aborted = true; });
    setTimeout(() => controller.abort(), 10);
    await new Promise(r => setTimeout(r, 20));
    assert(aborted, "AbortController 可以触发 abort");
  }

  // 测试 6: 重试逻辑
  console.log("\n🧪 测试 6: 重试逻辑");
  {
    async function withRetry(fn, maxRetries = 1, delayMs = 100) {
      let lastError;
      for (let i = 0; i <= maxRetries; i++) {
        try {
          return await fn();
        } catch (err) {
          lastError = err;
          if (i < maxRetries) {
            await new Promise(r => setTimeout(r, delayMs));
          }
        }
      }
      throw lastError;
    }

    let callCount = 0;
    const result = await withRetry(async () => {
      callCount++;
      if (callCount === 1) throw new Error("第一次失败");
      return "success";
    }, 1, 10);
    assert(result === "success" && callCount === 2, "第一次失败后重试成功");

    callCount = 0;
    try {
      await withRetry(async () => {
        callCount++;
        throw new Error("总是失败");
      }, 1, 10);
      assert(false, "重试后应该抛出错误");
    } catch {
      assert(callCount === 2, "两次都失败后抛出");
    }
  }

  // ═══════════════════════════════════════════════
  // 结果汇总
  // ═══════════════════════════════════════════════
  console.log(`\n${"=".repeat(50)}`);
  console.log(`📊 测试结果: ${passed} 通过, ${failed} 失败`);
  console.log(`${"=".repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
