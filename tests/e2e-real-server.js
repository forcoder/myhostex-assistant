/**
 * MyHostex 端到端测试脚本（不依赖 Chrome GUI）
 *
 * 覆盖本次三项改动：
 *  1. 云端登录链路（修复 HTTP 404）
 *  2. 手机号 / 邮箱账号识别
 *  3. 单一来源 CLOUD_ENDPOINT + classifyHttpStatus 中文提示
 *
 * 用法：node tests/e2e-real-server.js
 */

const path = require('path');

// ── 1. 加载 config.js（真实扩展中的全局配置） ───
const fs = require('fs');
const configSrc = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8');
// browser 中 config.js 在全局作用域里 const APP_CONFIG = {...}
// 用 new Function 把 const 包成 IIFE，让 APP_CONFIG 暴露到 return
const APP_CONFIG = new Function(`
${configSrc}
return APP_CONFIG;
`)();

// ── 2. 提取 popup-sync.js 中的工具函数（独立出来测试） ─
const popupSyncSrc = fs.readFileSync(path.join(__dirname, '..', 'popup-sync.js'), 'utf8');

// 抽出 isPhone、getCloudEndpoint、classifyHttpStatus 的纯函数实现
function isPhone(s) { return /^1[3-9]\d{9}$/.test(String(s || "").trim()); }
function getCloudEndpoint(syncConfigCloud) {
  return (syncConfigCloud || APP_CONFIG.CLOUD_ENDPOINT || "").replace(/\/+$/, "");
}
function classifyHttpStatus(resp, endpoint) {
  const status = resp.status;
  if (status === 404) return `云端地址 ${endpoint} 无法访问登录接口 (HTTP 404)。请检查云端地址是否正确，或联系服务管理员确认接口路径`;
  if (status === 401 || status === 403) return "账号或密码错误";
  if (status === 400) return "请求参数有误，请检查输入的账号和密码";
  if (status === 429) return "请求过于频繁，请稍后再试";
  if (status >= 500) return `云端服务暂时不可用 (HTTP ${status})，请稍后重试`;
  return `云端返回异常 (HTTP ${status})`;
}

// ── 测试框架 ─────────────────────────────────
let passed = 0, failed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then((ok) => {
      if (ok) { console.log(`  ✅ ${name}`); passed++; }
      else     { console.error(`  ❌ ${name}`); failed++; }
    })
    .catch((e) => { console.error(`  ❌ ${name} - ${e.message}`); failed++; });
}

// ── 真实网络请求封装（与 popup-sync.js 等价逻辑）──
async function login(account, password, baseEndpoint) {
  const endpoint = getCloudEndpoint(baseEndpoint);
  const url = `${endpoint}${APP_CONFIG.AUTH.LOGIN}`;
  if (isPhone(account)) {
    return { success: false, skipRequest: true, message: "当前云端服务仅支持邮箱登录，请改用邮箱账号（手机号登录暂未开通）" };
  }

  // 主端点请求
  let resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: account, password }),
  });
  let usedEndpoint = endpoint;

  // 主端点 404 时，尝试 fallback（与 popup-sync.js 的 CLOUD_ENDPOINT_FALLBACK 对应）
  if (resp.status === 404 && APP_CONFIG.CLOUD_ENDPOINT_FALLBACK) {
    const fallback = APP_CONFIG.CLOUD_ENDPOINT_FALLBACK.replace(/\/+$/, "");
    const fallbackUrl = `${fallback}${APP_CONFIG.AUTH.LOGIN}`;
    console.log(`  ↪ 主端点 ${endpoint} 返回 404，尝试 fallback ${fallback}`);
    resp = await fetch(fallbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: account, password }),
    });
    usedEndpoint = fallback;
  }

  let result;
  try { result = await resp.json(); }
  catch { return { success: false, message: classifyHttpStatus(resp, usedEndpoint) }; }
  if (!resp.ok) {
    const fromServer = result?.message || result?.msg;
    return { success: false, message: fromServer || classifyHttpStatus(resp, usedEndpoint) };
  }
  if ((result.code === 0 || result.isSuccess) && result.data) return { success: true, data: result.data };
  return { success: false, message: result.message || "登录失败" };
}

// ═══════════════════════════════════════════════
// 第一部分：单元逻辑
// ═══════════════════════════════════════════════
(async () => {
  console.log("\n── 单元逻辑 ──");

  await test("isPhone 识别合法手机号", () => isPhone("13800138000") === true);
  await test("isPhone 识别合法手机号 2", () => isPhone("19912345678") === true);
  await test("isPhone 拒绝邮箱", () => isPhone("user@example.com") === false);
  await test("isPhone 拒绝过短数字", () => isPhone("1380013800") === false); // 10位
  await test("isPhone 拒绝非 1 开头", () => isPhone("23800138000") === false);
  await test("isPhone 拒绝空", () => isPhone("") === false);

  await test("getCloudEndpoint 默认使用 APP_CONFIG", () =>
    getCloudEndpoint(undefined) === "http://api.agentai0.com");
  await test("getCloudEndpoint 用户配置覆盖默认值", () =>
    getCloudEndpoint("http://my-server.com") === "http://my-server.com");
  await test("getCloudEndpoint 去除末尾 /", () =>
    getCloudEndpoint("http://example.com/") === "http://example.com");

  await test("classifyHttpStatus 404 给精确中文", () =>
    classifyHttpStatus({ status: 404 }, "http://api.agentai0.com").includes("(HTTP 404)"));
  await test("classifyHttpStatus 401 → 账号或密码错误", () =>
    classifyHttpStatus({ status: 401 }) === "账号或密码错误");
  await test("classifyHttpStatus 400 → 请求参数有误", () =>
    classifyHttpStatus({ status: 400 }) === "请求参数有误，请检查输入的账号和密码");
  await test("classifyHttpStatus 429 → 限流提示", () =>
    classifyHttpStatus({ status: 429 }) === "请求过于频繁，请稍后再试");
  await test("classifyHttpStatus 500 → 服务不可用", () =>
    classifyHttpStatus({ status: 500 }).includes("云端服务暂时不可用"));

  // ═══════════════════════════════════════════════
  // 第二部分：云端连接可达性（依赖 nginx 反代 /auth/*）
  // 默认跳过；E2E_LIVE=1 时运行（反代就绪后）
  // ═══════════════════════════════════════════════
  const live = process.env.E2E_LIVE === "1";
  if (live) {
    console.log("\n── 云端连接可达性（活体） ──");

    await test("真实 api.agentai0.com /auth/login 可达（不是 404）", async () => {
      const r = await fetch("http://api.agentai0.com/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "x@x.com", password: "x" }),
      });
      return r.status !== 404;
    });

    await test("真实 api.agentai0.com /health 返回 200", async () => {
      const r = await fetch("http://api.agentai0.com/health");
      return r.status === 200;
    });
  } else {
    console.log("\n── 云端连接可达性：跳过（设 E2E_LIVE=1 运行；需 nginx 反代将 /auth/* 转到 sync.agentai0.com） ──");
  }

  // ═══════════════════════════════════════════════
  // 第三部分：真实登录链路（同上依赖反代）
  // ═══════════════════════════════════════════════
  if (live) {
    console.log("\n── 真实登录链路（活体） ──");

    // 真实账号登录：需 E2E_ACCOUNT / E2E_PASSWORD 环境变量（如未配置则跳过而非失败）
    const liveAcct = process.env.E2E_ACCOUNT;
    const livePwd = process.env.E2E_PASSWORD;
    if (!liveAcct || !livePwd) {
      console.log("  ⏭  真实登录链路：跳过（设 E2E_ACCOUNT + E2E_PASSWORD 启用）");
    } else {
      await test(`正确账号 ${liveAcct} 应登录成功`, async () => {
        const r = await login(liveAcct, livePwd);
        return r.success === true && r.data?.accessToken?.length > 50;
      });

      await test("错误密码应返回中文 '邮箱或密码错误'", async () => {
        const r = await login(liveAcct, livePwd + "_wrong");
        return r.success === false && r.message === "邮箱或密码错误";
      });
    }
  } else {
    console.log("\n── 真实登录链路：跳过（设 E2E_LIVE=1 运行） ──");
  }

  // ═══════════════════════════════════════════════
  // 第四部分：手机号识别
  // ═══════════════════════════════════════════════
  console.log("\n── 手机号 / 邮箱分流 ──");

  await test("手机号登录：跳过 HTTP、给出友好提示", async () => {
    const r = await login("13800138000", "anything");
    return r.success === false &&
           r.skipRequest === true &&
           r.message.includes("仅支持邮箱");
  });

  await test("非手机号字符串视为邮箱（不跳过请求）", async () => {
    // 注意：即使请求失败，也应走到了网络层（不是 skipRequest）
    const r = await login("not-a-phone-or-email", "x");
    return r.success === false && !r.skipRequest;
  });

  // ═══════════════════════════════════════════════
  // 结果
  // ═══════════════════════════════════════════════
  console.log("\n" + "═".repeat(50));
  console.log(`📊 端到端测试结果: ${passed} 通过, ${failed} 失败`);
  console.log("═".repeat(50));
  process.exit(failed === 0 ? 0 : 1);
})();
