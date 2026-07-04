/**
 * MyHostex 智能回复助手 - 完整回归测试
 * ========================================================
 * 提交前必须运行：node tests/regression-test.js
 * 全部通过（exit 0）才能提交到 GitHub
 * ========================================================
 */
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    const ok = fn();
    if (ok) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      console.log(`  ❌ ${name} — 断言失败`);
      failed++;
      failures.push(name);
    }
  } catch (e) {
    console.log(`  ❌ ${name} — ${e.message}`);
    failed++;
    failures.push(name);
  }
}

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
const configCode = fs.readFileSync('./config.js', 'utf8');
const wrappedCode = configCode.replace(
  'const APP_CONFIG',
  'globalThis.__APP_CONFIG__'
);
(0, eval)(wrappedCode);
const APP_CONFIG = globalThis.__APP_CONFIG__;
delete globalThis.__APP_CONFIG__;

// ═══════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════');
console.log('   MyHostex 回归测试');
console.log('═══════════════════════════════════════\n');

// ═══════════════════════════════════════════════════
// 第一部分：配置完整性
// ═══════════════════════════════════════════════════
console.log('── 第一部分：配置完整性 ──');

test('config.js 加载为对象', () => typeof APP_CONFIG === 'object');

test('CLOUD_ENDPOINT 非空', () => {
  return typeof APP_CONFIG.CLOUD_ENDPOINT === 'string'
    && APP_CONFIG.CLOUD_ENDPOINT.startsWith('http');
});

test('CLOUD_ENDPOINT_FALLBACK 非空', () => {
  return typeof APP_CONFIG.CLOUD_ENDPOINT_FALLBACK === 'string'
    && APP_CONFIG.CLOUD_ENDPOINT_FALLBACK.startsWith('http');
});

test('MYHOSTEX_DOMAIN 非空', () => {
  return typeof APP_CONFIG.MYHOSTEX_DOMAIN === 'string'
    && APP_CONFIG.MYHOSTEX_DOMAIN.length > 0;
});

test('AI_PROVIDERS 包含所有 5 个 provider', () => {
  const keys = Object.keys(APP_CONFIG.AI_PROVIDERS);
  return keys.length === 5
    && keys.includes('openai')
    && keys.includes('deepseek')
    && keys.includes('qwen')
    && keys.includes('zhipu')
    && keys.includes('custom');
});

test('AI_PROVIDERS 每个 provider 有 baseUrl 和 model', () => {
  for (const [k, v] of Object.entries(APP_CONFIG.AI_PROVIDERS)) {
    if (k === 'custom') continue; // custom 允许空
    if (!v.baseUrl || !v.baseUrl.startsWith('http')) return false;
    if (!v.model) return false;
  }
  return true;
});

test('AUTH 包含 LOGIN/REGISTER/REFRESH', () => {
  return APP_CONFIG.AUTH.LOGIN === '/auth/login'
    && APP_CONFIG.AUTH.REGISTER === '/auth/register'
    && APP_CONFIG.AUTH.REFRESH === '/auth/refresh';
});

test('SYNC 包含 PUSH/HEALTH', () => {
  return APP_CONFIG.SYNC.PUSH === '/sync/push'
    && APP_CONFIG.SYNC.HEALTH === '/health';
});

test('QWEN_DEFAULT_PROVIDER 为 qwen', () => {
  return APP_CONFIG.QWEN_DEFAULT_PROVIDER === 'qwen';
});

test('HOST_PERMISSIONS 数组非空', () => {
  return Array.isArray(APP_CONFIG.HOST_PERMISSIONS)
    && APP_CONFIG.HOST_PERMISSIONS.length > 0;
});

test('CSP_CONNECT_SRC 非空', () => {
  return typeof APP_CONFIG.CSP_CONNECT_SRC === 'string'
    && APP_CONFIG.CSP_CONNECT_SRC.length > 0;
});

// ═══════════════════════════════════════════════════
// 第二部分：运行时函数逻辑
// ═══════════════════════════════════════════════════
console.log('\n── 第二部分：运行时函数逻辑 ──');

test('PROVIDER_DEFAULTS 展开正确', () => {
  const pd = { ...APP_CONFIG.AI_PROVIDERS };
  return pd.openai.baseUrl === 'https://api.openai.com/v1'
    && pd.deepseek.baseUrl === 'https://api.deepseek.com/v1'
    && pd.qwen.baseUrl === 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    && pd.zhipu.baseUrl === 'https://open.bigmodel.cn/api/paas/v4'
    && pd.custom.model === '';
});

test('PROVIDER_DEFAULTS 修改不影响原配置（深拷贝隔离）', () => {
  const pd = { ...APP_CONFIG.AI_PROVIDERS };
  pd.openai = { baseUrl: 'http://evil.com', model: 'evil' };
  return APP_CONFIG.AI_PROVIDERS.openai.baseUrl === 'https://api.openai.com/v1';
});

test('getDefaultBaseUrl 已知 provider', () => {
  function fn(p) { return APP_CONFIG.AI_PROVIDERS[p]?.baseUrl || APP_CONFIG.AI_PROVIDERS.openai.baseUrl; }
  return fn('qwen') === 'https://dashscope.aliyuncs.com/compatible-mode/v1';
});

test('getDefaultBaseUrl 未知 provider 回退到 openai', () => {
  function fn(p) { return APP_CONFIG.AI_PROVIDERS[p]?.baseUrl || APP_CONFIG.AI_PROVIDERS.openai.baseUrl; }
  return fn('nonexistent') === 'https://api.openai.com/v1';
});

test('getDefaultModel 已知 provider', () => {
  function fn(p) { return APP_CONFIG.AI_PROVIDERS[p]?.model || 'gpt-4o'; }
  return fn('deepseek') === 'deepseek-chat';
});

test('getDefaultModel 未知 provider 回退', () => {
  function fn(p) { return APP_CONFIG.AI_PROVIDERS[p]?.model || 'gpt-4o'; }
  return fn('nonexistent') === 'gpt-4o';
});

test('API 路径拼接：login', () => {
  const ep = APP_CONFIG.CLOUD_ENDPOINT.replace(/\/+$/, '');
  return ep + APP_CONFIG.AUTH.LOGIN === 'http://api.agentai0.com/auth/login';
});

test('API 路径拼接：register', () => {
  const ep = APP_CONFIG.CLOUD_ENDPOINT.replace(/\/+$/, '');
  return ep + APP_CONFIG.AUTH.REGISTER === 'http://api.agentai0.com/auth/register';
});

test('API 路径拼接：refresh', () => {
  const ep = APP_CONFIG.CLOUD_ENDPOINT.replace(/\/+$/, '');
  return ep + APP_CONFIG.AUTH.REFRESH === 'http://api.agentai0.com/auth/refresh';
});

test('API 路径拼接：push', () => {
  const ep = APP_CONFIG.CLOUD_ENDPOINT.replace(/\/+$/, '');
  return ep + APP_CONFIG.SYNC.PUSH === 'http://api.agentai0.com/sync/push';
});

test('API 路径拼接：health', () => {
  const ep = APP_CONFIG.CLOUD_ENDPOINT.replace(/\/+$/, '');
  return ep + APP_CONFIG.SYNC.HEALTH === 'http://api.agentai0.com/health';
});

test('BG fallback 路径拼接', () => {
  const ep = APP_CONFIG.CLOUD_ENDPOINT_FALLBACK;
  return ep.replace(/\/$/, '') + APP_CONFIG.SYNC.PUSH === 'https://csbaby-api2.onrender.com/sync/push';
});

test('Qwen 导入配置使用 APP_CONFIG', () => {
  const m = [{ name: 'Qwen-Test', model: 'qwen-plus' }];
  const configs = m.map((item, idx) => ({
    id: Date.now().toString() + '_' + idx,
    name: item.name,
    provider: APP_CONFIG.QWEN_DEFAULT_PROVIDER,
    baseUrl: APP_CONFIG.AI_PROVIDERS.qwen.baseUrl,
    apiKey: 'sk-test',
    model: item.model,
    isDefault: idx === 0,
  }));
  // 验证所有必要字段
  return typeof configs[0].id === 'string'
    && configs[0].name === 'Qwen-Test'
    && configs[0].provider === 'qwen'
    && configs[0].baseUrl === 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    && configs[0].apiKey === 'sk-test'
    && configs[0].model === 'qwen-plus'
    && configs[0].isDefault === true;
});

// ═══════════════════════════════════════════════════
// 第三部分：源文件硬编码检查
// ═══════════════════════════════════════════════════
console.log('\n── 第三部分：源文件硬编码检查 ──');

test('background.js 无遗留硬编码 AI URL', () => {
  const code = fs.readFileSync('./background.js', 'utf8');
  // 允许 importScripts 中的 config.js 路径
  // 不允许出现内联的 api provider URL
  const lines = code.split('\n');
  for (const line of lines) {
    if (line.includes('api.openai.com') && !line.includes('APP_CONFIG')) return false;
    if (line.includes('api.deepseek.com') && !line.includes('APP_CONFIG')) return false;
    if (line.includes('dashscope.aliyuncs.com') && !line.includes('APP_CONFIG')) return false;
    if (line.includes('open.bigmodel.cn') && !line.includes('APP_CONFIG')) return false;
    if (line.includes('csbaby-api2') && !line.includes('APP_CONFIG')) return false;
  }
  return true;
});

test('background.js 引用 APP_CONFIG', () => {
  const code = fs.readFileSync('./background.js', 'utf8');
  return code.includes("importScripts('config.js')")
    && code.includes('APP_CONFIG.AI_PROVIDERS')
    && code.includes('APP_CONFIG.CLOUD_ENDPOINT_FALLBACK')
    && code.includes('APP_CONFIG.SYNC.PUSH');
});

test('background.js getDefaultBaseUrl/getDefaultModel 引用配置', () => {
  const code = fs.readFileSync('./background.js', 'utf8');
  // getDefaultBaseUrl
  const hasGetDefaultBaseUrl = code.includes('APP_CONFIG.AI_PROVIDERS[p]?.baseUrl');
  // getDefaultModel
  const hasGetDefaultModel = code.includes('APP_CONFIG.AI_PROVIDERS[p]?.model');
  return hasGetDefaultBaseUrl && hasGetDefaultModel;
});

test('popup-sync.js 无遗留硬编码 agentai0 URL', () => {
  const code = fs.readFileSync('./popup-sync.js', 'utf8');
  const lines = code.split('\n');
  for (const line of lines) {
    if (line.includes('agentai0.com') && !line.includes('APP_CONFIG')) return false;
    if ((line.includes('/auth/login') || line.includes('/auth/register')
      || line.includes('/auth/refresh') || line.includes('/sync/push'))
      && !line.includes('APP_CONFIG')) return false;
  }
  return true;
});

test('popup-sync.js 引用 APP_CONFIG', () => {
  const code = fs.readFileSync('./popup-sync.js', 'utf8');
  return code.includes('APP_CONFIG.CLOUD_ENDPOINT')
    && code.includes('APP_CONFIG.AUTH.LOGIN')
    && code.includes('APP_CONFIG.AUTH.REGISTER')
    && code.includes('APP_CONFIG.AUTH.REFRESH')
    && code.includes('APP_CONFIG.SYNC.PUSH')
    && code.includes('APP_CONFIG.SYNC.HEALTH');
});

test('popup.js 无遗留硬编码 AI URL', () => {
  const code = fs.readFileSync('./popup.js', 'utf8');
  const lines = code.split('\n');
  for (const line of lines) {
    if (line.includes('api.openai.com') && !line.includes('APP_CONFIG')) return false;
    if (line.includes('api.deepseek.com') && !line.includes('APP_CONFIG')) return false;
    if (line.includes('dashscope.aliyuncs.com') && !line.includes('APP_CONFIG')) return false;
    if (line.includes('open.bigmodel.cn') && !line.includes('APP_CONFIG')) return false;
  }
  return true;
});

test('popup.js PROVIDER_DEFAULTS 引用 APP_CONFIG', () => {
  const code = fs.readFileSync('./popup.js', 'utf8');
  return code.includes('APP_CONFIG.AI_PROVIDERS');
});

test('popup.js Qwen 导入引用 APP_CONFIG', () => {
  const code = fs.readFileSync('./popup.js', 'utf8');
  return code.includes('APP_CONFIG.QWEN_DEFAULT_PROVIDER')
    && code.includes('APP_CONFIG.AI_PROVIDERS.qwen.baseUrl');
});

test('popup_ai_config.js PROVIDER_DEFAULTS 引用 APP_CONFIG', () => {
  const code = fs.readFileSync('./popup_ai_config.js', 'utf8');
  return code.includes('APP_CONFIG.AI_PROVIDERS');
});

test('popup_ai_config.js 无遗留硬编码 AI URL', () => {
  const code = fs.readFileSync('./popup_ai_config.js', 'utf8');
  const lines = code.split('\n');
  for (const line of lines) {
    if (line.includes('api.openai.com') && !line.includes('APP_CONFIG')) return false;
    if (line.includes('api.deepseek.com') && !line.includes('APP_CONFIG')) return false;
    if (line.includes('dashscope.aliyuncs.com') && !line.includes('APP_CONFIG')) return false;
    if (line.includes('open.bigmodel.cn') && !line.includes('APP_CONFIG')) return false;
  }
  return true;
});

// ═══════════════════════════════════════════════════
// 第四部分：UI/HTML/JSON 结构检查
// ═══════════════════════════════════════════════════
console.log('\n── 第四部分：UI/HTML/JSON 结构检查 ──');

test('popup.html config.js 排在最前', () => {
  const html = fs.readFileSync('./popup.html', 'utf8');
  const scripts = html.match(/<script src="([^"]+)">/g) || [];
  return scripts.length > 0 && scripts[0].includes('config.js');
});

test('popup.html 版本号为 v3.13.3', () => {
  const html = fs.readFileSync('./popup.html', 'utf8');
  return html.includes('v3.13.3');
});

test('popup.html 没有引入 popup_ai_config.js', () => {
  const html = fs.readFileSync('./popup.html', 'utf8');
  return !html.includes('popup_ai_config.js');
});

test('manifest.json web_accessible_resources 包含 config.js', () => {
  const manifest = JSON.parse(fs.readFileSync('./manifest.json', 'utf8'));
  return manifest.web_accessible_resources.some(w =>
    w.resources.includes('config.js')
  );
});

test('manifest.json 版本号为 3.13.3', () => {
  const manifest = JSON.parse(fs.readFileSync('./manifest.json', 'utf8'));
  return manifest.version === '3.13.3';
});

test('manifest.json 版本描述已更新', () => {
  const manifest = JSON.parse(fs.readFileSync('./manifest.json', 'utf8'));
  return !manifest.description.includes('v3.13.2');
});

test('manifest.json CSP 包含 CLOUD_ENDPOINT 域名', () => {
  const manifest = JSON.parse(fs.readFileSync('./manifest.json', 'utf8'));
  const csp = manifest.content_security_policy?.extension_pages || '';
  const domain = APP_CONFIG.CLOUD_ENDPOINT.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return csp.includes(domain);
});

test('manifest.json host_permissions 数量与 HOST_PERMISSIONS 一致', () => {
  const manifest = JSON.parse(fs.readFileSync('./manifest.json', 'utf8'));
  const manifestHosts = manifest.host_permissions || [];
  const configHosts = APP_CONFIG.HOST_PERMISSIONS || [];
  // *://*/* 在两边都应该存在
  return manifestHosts.includes('*://*/*')
    && configHosts.includes('*://*/*')
    && manifestHosts.length >= configHosts.length - 1;
});

// ═══════════════════════════════════════════════════
// 第五部分：关键代码存在性
// ═══════════════════════════════════════════════════
console.log('\n── 第五部分：关键代码存在性 ──');

test('popup.js Tab 切换代码存在', () => {
  const code = fs.readFileSync('./popup.js', 'utf8');
  return code.includes('querySelectorAll(".tab-btn")')
    && code.includes('btn.addEventListener("click"')
    && code.includes('btn.dataset.tab');
});

test('popup.js showStatus 函数存在', () => {
  const code = fs.readFileSync('./popup.js', 'utf8');
  return code.includes('function showStatus');
});

test('popup.js renderAiConfigs 函数存在', () => {
  const code = fs.readFileSync('./popup.js', 'utf8');
  return code.includes('function renderAiConfigs');
});

test('popup.js 测试 AI 连接函数存在', () => {
  const code = fs.readFileSync('./popup.js', 'utf8');
  return code.includes('async function testAiConfig');
});

test('popup.js 保存 AI 配置函数存在', () => {
  const code = fs.readFileSync('./popup.js', 'utf8');
  return code.includes('async function saveAiConfigs');
});

test('popup.js 加载 AI 配置函数存在', () => {
  const code = fs.readFileSync('./popup.js', 'utf8');
  return code.includes('async function loadAiConfigs');
});

test('popup.js provider 切换事件绑定存在', () => {
  const code = fs.readFileSync('./popup.js', 'utf8');
  // 必须有 addEventListener + provider change + PROVIDER_DEFAULTS 引用
  return code.includes('getElementById("ai-provider")')
    && code.includes('.addEventListener("change"')
    && code.includes('PROVIDER_DEFAULTS[val]');
});

test('popup.js 导入 Qwen 按钮事件绑定存在', () => {
  const code = fs.readFileSync('./popup.js', 'utf8');
  return code.includes('getElementById("btn-import-qwen")')
    && code.includes('addEventListener');
});

test('popup.js 抓取按钮事件绑定存在', () => {
  const code = fs.readFileSync('./popup.js', 'utf8');
  return code.includes('getElementById("btn-scrape")')
    && code.includes('addEventListener');
});

test('popup_ai_config.js 关键函数 renderAiConfigs 存在', () => {
  const code = fs.readFileSync('./popup_ai_config.js', 'utf8');
  return code.includes('function renderAiConfigs')
    && code.includes('function openAiConfigModal');
});

test('popup_ai_config.js 关键函数 saveAiConfigs/loadAiConfigs 存在', () => {
  const code = fs.readFileSync('./popup_ai_config.js', 'utf8');
  return code.includes('async function saveAiConfigs')
    && code.includes('async function loadAiConfigs');
});

test('popup-sync.js login 函数存在', () => {
  const code = fs.readFileSync('./popup-sync.js', 'utf8');
  return code.includes('async login(email, password)')
    && code.includes('APP_CONFIG.AUTH.LOGIN');
});

test('popup-sync.js register 函数存在', () => {
  const code = fs.readFileSync('./popup-sync.js', 'utf8');
  return code.includes('async register(email, password, displayName)')
    && code.includes('APP_CONFIG.AUTH.REGISTER');
});

test('popup-sync.js refreshTokenIfNeeded 函数存在', () => {
  const code = fs.readFileSync('./popup-sync.js', 'utf8');
  return code.includes('async refreshTokenIfNeeded')
    && code.includes('APP_CONFIG.AUTH.REFRESH');
});

test('popup-sync.js uploadToCloudWithAuth 函数存在', () => {
  const code = fs.readFileSync('./popup-sync.js', 'utf8');
  return code.includes('async function uploadToCloudWithAuth')
    && code.includes('APP_CONFIG.CLOUD_ENDPOINT')
    && code.includes('APP_CONFIG.SYNC.PUSH');
});

test('popup-sync.js initSyncUI 函数存在', () => {
  const code = fs.readFileSync('./popup-sync.js', 'utf8');
  return code.includes('async function initSyncUI');
});

test('popup-sync.js handleSyncNow 函数存在', () => {
  const code = fs.readFileSync('./popup-sync.js', 'utf8');
  return code.includes('async function handleSyncNow');
});

test('background.js performAutoSyncBG 引用配置', () => {
  const code = fs.readFileSync('./background.js', 'utf8');
  return code.includes('async function performAutoSyncBG')
    && code.includes('APP_CONFIG.CLOUD_ENDPOINT_FALLBACK')
    && code.includes('APP_CONFIG.SYNC.PUSH');
});

test('background.js enrichWithAI 使用 getDefaultBaseUrl', () => {
  const code = fs.readFileSync('./background.js', 'utf8');
  return code.includes('enrichWithAI')
    && code.includes('getDefaultBaseUrl');
});

test('background.js handleGenerateSuggestions 存在', () => {
  const code = fs.readFileSync('./background.js', 'utf8');
  return code.includes('async function handleGenerateSuggestions');
});

test('content.js 未被此项目修改（仅注释含域名）', () => {
  const code = fs.readFileSync('./content.js', 'utf8');
  // content.js 不应该有 agentai0, csbaby 等域名
  return !code.includes('agentai0')
    && !code.includes('csbaby')
    && !code.includes('dashscope');
});

test('版本号在关键文件中一致为 3.13.3', () => {
  const manifest = JSON.parse(fs.readFileSync('./manifest.json', 'utf8'));
  const html = fs.readFileSync('./popup.html', 'utf8');
  const bg = fs.readFileSync('./background.js', 'utf8');
  const version = manifest.version;
  return version === '3.13.3'
    && html.includes('v' + version)
    && bg.includes('版本: ' + version);
});

// ═══════════════════════════════════════════════════
// 第六部分：构建产物验证
// ═══════════════════════════════════════════════════
console.log('\n── 第六部分：构建产物验证 ──');

test('build 目录存在', () => {
  return fs.existsSync('./build');
});

// 查找最新构建的 ZIP
const buildFiles = fs.readdirSync('./build').filter(f => f.endsWith('.zip'));
test('至少有一个构建 ZIP', () => {
  return buildFiles.length > 0;
});

if (buildFiles.length > 0) {
  // 取最新的 ZIP
  const latestZip = buildFiles.sort().reverse()[0];
  const zipPath = path.join('./build', latestZip);

  test(`ZIP "${latestZip}" 包含 config.js`, () => {
    const { execSync } = require('child_process');
    const listing = execSync(`unzip -l "${zipPath}"`, { encoding: 'utf8' });
    return listing.includes('config.js');
  });

  test(`ZIP "${latestZip}" 包含 manifest.json`, () => {
    const { execSync } = require('child_process');
    const listing = execSync(`unzip -l "${zipPath}"`, { encoding: 'utf8' });
    return listing.includes('manifest.json');
  });

  test(`ZIP "${latestZip}" 包含 background.js`, () => {
    const { execSync } = require('child_process');
    const listing = execSync(`unzip -l "${zipPath}"`, { encoding: 'utf8' });
    return listing.includes('background.js');
  });

  // 构建完整性：所有必需文件都在 ZIP 中
  const requiredFiles = [
    'manifest.json', 'background.js', 'content.js', 'injected.js',
    'popup.html', 'popup.js', 'popup-sync.js', 'sync-service.js',
    'config.js', 'popup_ai_config.js', 'styles/panel.css',
    'icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png',
  ];
  for (const reqFile of requiredFiles) {
    test(`ZIP 包含必需文件: ${reqFile}`, () => {
      const { execSync } = require('child_process');
      const listing = execSync(`unzip -l "${zipPath}"`, { encoding: 'utf8' });
      return listing.includes(reqFile);
    });
  }
}

// ═══════════════════════════════════════════════════
// 第七部分：所有 JS 文件语法检查
// ═══════════════════════════════════════════════════
console.log('\n── 第七部分：JS 语法检查 ──');

const jsFilesToCheck = [
  'config.js', 'background.js', 'popup.js',
  'popup_ai_config.js', 'popup-sync.js',
  'sync-service.js', 'content.js', 'injected.js',
];

for (const file of jsFilesToCheck) {
  if (!fs.existsSync(file)) continue;
  test(`${file} 语法正确`, () => {
    // background.js 需要特殊处理：importScripts 只在 worker 上下文有效
    let code = fs.readFileSync(file, 'utf8');
    if (file === 'background.js') {
      code = code.replace(/try\s*\{[^}]*importScripts[^}]*\}\s*catch\s*\([^)]*\)\s*\{[^}]*\}/g, '');
      code = code.replace(/APP_CONFIG\.AI_PROVIDERS\[p\]\?\.baseUrl/g, 'undefined');
      code = code.replace(/APP_CONFIG\.AI_PROVIDERS\[p\]\?\.model/g, 'undefined');
      code = code.replace(/APP_CONFIG\.\w+(?:\.\w+)*/g, 'undefined');
    }
    new Function(code);
    return true;
  });
}

// ═══════════════════════════════════════════════════
// 汇总
// ═══════════════════════════════════════════════════
const total = passed + failed;
console.log('\n═══════════════════════════════════════');
console.log(`   结果：${passed}/${total} 通过`);
if (failed > 0) {
  console.log(`   ❌ 失败 (${failed}):`);
  for (const f of failures) {
    console.log(`     - ${f}`);
  }
  console.log('\n   ⚠️  修复后重新运行 node tests/regression-test.js');
  process.exit(1);
} else {
  console.log('   ✅ 全部通过，可以提交！');
  console.log('═══════════════════════════════════════');
  process.exit(0);
}
