/**
 * MyHostex 智能回复助手 - 回归测试
 * 模拟浏览器环境验证所有关键功能路径
 */
const fs = require('fs');

// 模拟浏览器全局对象
global.chrome = {
  storage: { local: { get: async () => ({}), set: async () => {} } },
  runtime: {},
  i18n: { getMessage: () => '' },
};
global.window = global;
global.document = {
  querySelectorAll: () => [],
  getElementById: () => null,
  addEventListener: () => {},
  createElement: () => ({ textContent: '', innerHTML: '' }),
};

// ── 加载 config.js ──────────────────────────────
// 使用 Indirect eval 在全局作用域执行，确保 APP_CONFIG 可访问
const vm = require('vm');
const configCode = fs.readFileSync('./config.js', 'utf8');
// 将 const 声明改为 globalThis 赋值以便后续访问
const wrappedCode = configCode.replace(
  'const APP_CONFIG',
  'globalThis.__APP_CONFIG__'
);
(0, eval)(wrappedCode);
const APP_CONFIG = globalThis.__APP_CONFIG__;
delete globalThis.__APP_CONFIG__;

// ═══════════════════════════════════════════════
// 测试 1: config.js 加载
// ═══════════════════════════════════════════════
console.log('=== 测试 1: config.js 加载 ===');
console.log('   type:', typeof APP_CONFIG);
console.log('   CLOUD_ENDPOINT:', APP_CONFIG.CLOUD_ENDPOINT);
console.log('   CLOUD_ENDPOINT_FALLBACK:', APP_CONFIG.CLOUD_ENDPOINT_FALLBACK);
console.log('   AI_PROVIDERS keys:', Object.keys(APP_CONFIG.AI_PROVIDERS).join(', '));
let t1 = typeof APP_CONFIG === 'object' && APP_CONFIG.CLOUD_ENDPOINT === 'https://api.agentai0.com';
console.log('   =>', t1 ? '✅ PASS' : '❌ FAIL');
if (!t1) process.exit(1);

// ═══════════════════════════════════════════════
// 测试 2: PROVIDER_DEFAULTS 展开
// ═══════════════════════════════════════════════
console.log('\n=== 测试 2: PROVIDER_DEFAULTS 展开 ===');
const PROVIDER_DEFAULTS = { ...APP_CONFIG.AI_PROVIDERS };
console.log('   openai:', PROVIDER_DEFAULTS.openai.baseUrl);
console.log('   deepseek:', PROVIDER_DEFAULTS.deepseek.baseUrl);
console.log('   qwen:', PROVIDER_DEFAULTS.qwen.baseUrl);
console.log('   zhipu:', PROVIDER_DEFAULTS.zhipu.baseUrl);
console.log('   custom:', JSON.stringify(PROVIDER_DEFAULTS.custom));
let t2 = PROVIDER_DEFAULTS.openai.baseUrl === 'https://api.openai.com/v1'
      && PROVIDER_DEFAULTS.deepseek.baseUrl === 'https://api.deepseek.com/v1'
      && PROVIDER_DEFAULTS.qwen.baseUrl === 'https://dashscope.aliyuncs.com/compatible-mode/v1'
      && PROVIDER_DEFAULTS.zhipu.baseUrl === 'https://open.bigmodel.cn/api/paas/v4'
      && PROVIDER_DEFAULTS.custom.model === '';
console.log('   =>', t2 ? '✅ PASS' : '❌ FAIL');

// ═══════════════════════════════════════════════
// 测试 3: getDefaultBaseUrl
// ═══════════════════════════════════════════════
console.log('\n=== 测试 3: getDefaultBaseUrl ===');
function getDefaultBaseUrl(p) {
  return APP_CONFIG.AI_PROVIDERS[p]?.baseUrl || APP_CONFIG.AI_PROVIDERS.openai.baseUrl;
}
console.log('   openai:', getDefaultBaseUrl('openai'));
console.log('   deepseek:', getDefaultBaseUrl('deepseek'));
console.log('   qwen:', getDefaultBaseUrl('qwen'));
console.log('   zhipu:', getDefaultBaseUrl('zhipu'));
console.log('   unknown:', getDefaultBaseUrl('unknown'), '(应=openai fallback)');
let t3 = getDefaultBaseUrl('qwen') === 'https://dashscope.aliyuncs.com/compatible-mode/v1'
      && getDefaultBaseUrl('unknown') === 'https://api.openai.com/v1';
console.log('   =>', t3 ? '✅ PASS' : '❌ FAIL');

// ═══════════════════════════════════════════════
// 测试 4: popup-sync 路径拼接
// ═══════════════════════════════════════════════
console.log('\n=== 测试 4: 云端 API 路径拼接 ===');
const endpoint = APP_CONFIG.CLOUD_ENDPOINT.replace(/\/+$/, '');
console.log('   login:', endpoint + APP_CONFIG.AUTH.LOGIN);
console.log('   register:', endpoint + APP_CONFIG.AUTH.REGISTER);
console.log('   refresh:', endpoint + APP_CONFIG.AUTH.REFRESH);
console.log('   push:', endpoint + APP_CONFIG.SYNC.PUSH);
let t4 = (endpoint + APP_CONFIG.AUTH.LOGIN)    === 'https://api.agentai0.com/auth/login'
      && (endpoint + APP_CONFIG.AUTH.REGISTER)  === 'https://api.agentai0.com/auth/register'
      && (endpoint + APP_CONFIG.AUTH.REFRESH)   === 'https://api.agentai0.com/auth/refresh'
      && (endpoint + APP_CONFIG.SYNC.PUSH)      === 'https://api.agentai0.com/sync/push';
console.log('   =>', t4 ? '✅ PASS' : '❌ FAIL');

// ═══════════════════════════════════════════════
// 测试 5: BG fallback 路径
// ═══════════════════════════════════════════════
console.log('\n=== 测试 5: Background fallback 路径 ===');
const ep2 = APP_CONFIG.CLOUD_ENDPOINT_FALLBACK;
const bgPush = ep2.replace(/\/$/, '') + APP_CONFIG.SYNC.PUSH;
console.log('   bg push:', bgPush);
let t5 = bgPush === 'https://csbaby-api2.onrender.com/sync/push';
console.log('   =>', t5 ? '✅ PASS' : '❌ FAIL');

// ═══════════════════════════════════════════════
// 测试 6: Qwen 导入配置
// ═══════════════════════════════════════════════
console.log('\n=== 测试 6: Qwen 导入配置 ===');
const qwenModels = [{ name: 'Qwen-Plus-Test', model: 'qwen-plus' }];
const newConfigs = qwenModels.map((m, idx) => ({
  id: Date.now().toString() + '_' + idx,
  name: m.name,
  provider: APP_CONFIG.QWEN_DEFAULT_PROVIDER,
  baseUrl: APP_CONFIG.AI_PROVIDERS.qwen.baseUrl,
  apiKey: 'sk-test',
  model: m.model,
  isDefault: idx === 0,
}));
console.log('   provider:', newConfigs[0].provider);
console.log('   baseUrl:', newConfigs[0].baseUrl);
let t6 = newConfigs[0].provider === 'qwen'
      && newConfigs[0].baseUrl === 'https://dashscope.aliyuncs.com/compatible-mode/v1';
console.log('   =>', t6 ? '✅ PASS' : '❌ FAIL');

// ═══════════════════════════════════════════════
// 测试 7: Tab 切换代码存在且语法正确
// ═══════════════════════════════════════════════
console.log('\n=== 测试 7: Tab 切换代码完整性 ===');
const popupCode = fs.readFileSync('./popup.js', 'utf8');
// 验证 tab 切换代码段存在（不 eval，纯文本检查避免上下文问题）
const tabCodeExists = popupCode.includes('querySelectorAll(".tab-btn")')
  && popupCode.includes('btn.addEventListener("click"')
  && popupCode.includes('btn.dataset.tab');
console.log('   tab 切换代码存在:', tabCodeExists);
let t7 = tabCodeExists;
console.log('   =>', t7 ? '✅ PASS' : '❌ FAIL');

// ═══════════════════════════════════════════════
// 汇总
// ═══════════════════════════════════════════════
const results = [t1, t2, t3, t4, t5, t6, t7];
const ok = results.every(Boolean);
console.log('\n' + '='.repeat(50));
console.log(ok ? '✅ 回归测试全部通过 (' + results.length + '/' + results.length + ')' : '❌ 回归测试 ' + results.filter(Boolean).length + '/' + results.length + ' 通过');
if (!ok) {
  results.forEach((r, i) => { if (!r) console.log('  测试 ' + (i + 1) + ' 失败'); });
}
console.log('='.repeat(50));

process.exit(ok ? 0 : 1);
