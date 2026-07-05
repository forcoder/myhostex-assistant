/**
 * MyHostex longcat 模型提供商测试
 *
 * 覆盖：
 *  1. config.js 中 AI_PROVIDERS.longcat 字段正确
 *  2. DEFAULT_AI_PROVIDER === "longcat"
 *  3. baseUrl 拼出正确的 /v1/chat/completions URL
 *  4. manifest.json 已添加 longcat 域名
 *  5. popup.js / popup_ai_config.js / background.js 同步
 */

const fs = require('fs');
const path = require('path');

// ── 加载 config.js ────────────────────────────
const AC = new Function(fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8') + ';return APP_CONFIG')();

// ── 解析 manifest.json ─────────────────────────
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

// ── 读取 popup.js / background.js 源码做静态扫描 ─
const popupSrc = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');
const bgSrc    = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
const popupAiSrc = fs.readFileSync(path.join(__dirname, '..', 'popup_ai_config.js'), 'utf8');
const popupHtml = fs.readFileSync(path.join(__dirname, '..', 'popup.html'), 'utf8');

// ── 测试框架 ─────────────────────────────────
let passed = 0, failed = 0;
function test(name, fn) {
  try {
    const ok = fn();
    if (ok) { console.log(`  ✅ ${name}`); passed++; }
    else    { console.error(`  ❌ ${name}`); failed++; }
  } catch (e) { console.error(`  ❌ ${name} - ${e.message}`); failed++; }
}

console.log("\n── longcat 模型提供商集成 ──");

test("config.AI_PROVIDERS.longcat 存在", () =>
  AC.AI_PROVIDERS && AC.AI_PROVIDERS.longcat);

test("config.AI_PROVIDERS.longcat.baseUrl 是 /v1 结尾", () =>
  AC.AI_PROVIDERS.longcat.baseUrl.endsWith('/v1'));

test("config.AI_PROVIDERS.longcat.baseUrl 完整正确", () =>
  AC.AI_PROVIDERS.longcat.baseUrl === 'https://api.longcat.chat/openai/v1');

test("config.AI_PROVIDERS.longcat.model === 'LongCat-2.0'", () =>
  AC.AI_PROVIDERS.longcat.model === 'LongCat-2.0');

test("config.DEFAULT_AI_PROVIDER === 'longcat'", () =>
  AC.DEFAULT_AI_PROVIDER === 'longcat');

test("config.HOST_PERMISSIONS 包含 api.longcat.chat", () =>
  AC.HOST_PERMISSIONS.some(h => h.includes('api.longcat.chat')));

test("config.CSP_CONNECT_SRC 包含 api.longcat.chat", () =>
  AC.CSP_CONNECT_SRC && AC.CSP_CONNECT_SRC.includes('api.longcat.chat'));

test("config.AI_PROVIDERS 保留 openai / deepseek / qwen / zhipu / custom", () => {
  for (const k of ['openai', 'deepseek', 'qwen', 'zhipu', 'custom']) {
    if (!AC.AI_PROVIDERS[k]) return false;
  }
  return true;
});

test("manifest.host_permissions 包含 https://api.longcat.chat/*", () =>
  manifest.host_permissions.some(h => h.includes('api.longcat.chat')));

test("manifest.version >= 3.13.5", () => {
  const v = manifest.version || '';
  const parts = v.split('.').map(Number);
  if (parts.length < 3) return false;
  if (parts[0] > 3) return true;
  if (parts[0] === 3 && parts[1] > 13) return true;
  if (parts[0] === 3 && parts[1] === 13 && parts[2] >= 5) return true;
  return false;
});

test("popup.js PROVIDER_DEFAULTS 含 longcat 且 baseUrl 是 /v1", () =>
  /longcat:\s*\{\s*baseUrl:\s*\"https:\/\/api\.longcat\.chat\/openai\/v1\"/.test(popupSrc));

test("popup.js 默认 provider 改为 longcat（多处）", () => {
  // 至少出现 3+ 处 "longcat" 字符串
  return (popupSrc.match(/longcat/g) || []).length >= 3;
});

test("popup.js 默认模型改为 LongCat-2.0", () => {
  // 不能还有 "gpt-4o" 作为 hardcoded 默认
  return !/PROVIDER_DEFAULTS\[provider\]\?\.model\s*\|\|\s*"gpt-4o"/.test(popupSrc);
});

test("popup.js provider 显示标签含 LongCat", () =>
  /longcat:\s*"LongCat"/.test(popupSrc));

test("popup.html <option value=\"longcat\">存在", () =>
  /<option\s+value=["']longcat["']>/.test(popupHtml));

test("popup.html option 顺序：longcat 在 openai 之前", () => {
  const longcatIdx = popupHtml.indexOf('value="longcat"');
  const openaiIdx  = popupHtml.indexOf('value="openai"');
  return longcatIdx > 0 && longcatIdx < openaiIdx;
});

test("popup_ai_config.js 同步含 longcat", () =>
  /longcat:\s*\{\s*baseUrl:\s*\"https:\/\/api\.longcat\.chat\/openai\/v1\"/.test(popupAiSrc));

test("background.js getDefaultBaseUrl 含 longcat 返回 /v1", () =>
  /longcat:\s*"https:\/\/api\.longcat\.chat\/openai\/v1"/.test(bgSrc));

test("background.js getDefaultModel 含 longcat → LongCat-2.0", () =>
  /longcat:\s*"LongCat-2\.0"/.test(bgSrc));

test("background.js enrichWithAI 默认 provider 改为 longcat", () =>
  /enrichWithAI[\s\S]{0,200}provider\s*=\s*"longcat"/.test(bgSrc));

test("background.js 多模型回退默认 provider 改为 longcat", () => {
  // 在 for 循环里有一个 provider = "longcat" 默认值
  return /for\s*\([\s\S]*?\{[\s\S]*?const\s*\{\s*provider\s*=\s*"longcat"/.test(bgSrc);
});

test("background.js isFreeQuotaExceededError 含 longcat 关键词", () =>
  /longcat:\s*\[/.test(bgSrc));

test("popup.html 标题占位用 id=popup-subtitle（避免硬编码版本号漏改）", () =>
  /id="popup-subtitle"/.test(popupHtml) &&
  !/subtitle">MyHostex.*v\d+\.\d+\.\d+</.test(popupHtml));

test("popup.js init() 调用 chrome.runtime.getManifest().version 注入版本", () =>
  /chrome\.runtime\.getManifest\(\)\.version/.test(popupSrc) &&
  /popup-subtitle/.test(popupSrc));

test("popup.html 顶部默认模型提示横幅含 longcat", () =>
  /id="ai-default-banner"[\s\S]*?LongCat-2\.0/.test(popupHtml));

test("popup.html 有 'btn-add-longcat-quick' 一键配置按钮", () =>
  /id="btn-add-longcat-quick"/.test(popupHtml));

test("popup.js 一键配置按钮有 click handler，自动选 longcat", () => {
  return /btn-add-longcat-quick[\s\S]{0,300}\.value\s*=\s*"longcat"/.test(popupSrc);
});

console.log("\n" + "═".repeat(50));
console.log(`📊 longcat 测试结果: ${passed} 通过, ${failed} 失败`);
console.log("═".repeat(50));
process.exit(failed === 0 ? 0 : 1);
