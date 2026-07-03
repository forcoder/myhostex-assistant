/**
 * 美团民宿 Token 提取工具
 * 
 * 使用方法：
 * 1. 在浏览器中登录美团民宿房东后台
 * 2. 按 F12 打开开发者工具
 * 3. 切换到 Console 标签
 * 4. 粘贴并运行此脚本
 */

async function extractMeituanToken() {
  console.log('🔍 开始提取美团民宿 Token...\n');
  
  const results = {
    cookies: {},
    localStorage: {},
    sessionStorage: {},
    xPhxAuthToken: null,
    cookiesString: '',
  };

  // 1. 获取所有 Cookie
  console.log('📦 检查 Cookie...');
  document.cookie.split('; ').forEach(cookie => {
    const [name, value] = cookie.split('=');
    results.cookies[name] = value;
    
    if (name.toLowerCase().includes('token') || name.toLowerCase().includes('auth')) {
      console.log(`  ✅ ${name}: ${value.substring(0, 30)}...`);
    }
  });
  results.cookiesString = document.cookie;

  // 2. 检查 localStorage
  console.log('\n📦 检查 localStorage...');
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const value = localStorage.getItem(key);
    results.localStorage[key] = value;
    
    if (key.toLowerCase().includes('token') || key.toLowerCase().includes('auth')) {
      console.log(`  ✅ ${key}: ${value.substring(0, 30)}...`);
    }
  }

  // 3. 检查 sessionStorage
  console.log('\n📦 检查 sessionStorage...');
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    const value = sessionStorage.getItem(key);
    results.sessionStorage[key] = value;
    
    if (key.toLowerCase().includes('token') || key.toLowerCase().includes('auth')) {
      console.log(`  ✅ ${key}: ${value.substring(0, 30)}...`);
    }
  }

  // 4. 检查 window 对象中的 token
  console.log('\n📦 检查 window 全局对象...');
  const tokenKeys = ['token', 'authToken', 'xPhxAuthToken', 'phx_auth_token', 'auth_token'];
  tokenKeys.forEach(key => {
    if (window[key]) {
      console.log(`  ✅ window.${key}: ${String(window[key]).substring(0, 30)}...`);
    }
  });

  // 5. 尝试查找 x-phx-auth-token（可能存储在多个地方）
  results.xPhxAuthToken = 
    results.cookies['x-phx-auth-token'] ||
    results.cookies['X-Phx-Auth-Token'] ||
    results.cookies['phx_auth_token'] ||
    results.cookies['phx-auth-token'] ||
    localStorage.getItem('x-phx-auth-token') ||
    localStorage.getItem('X-Phx-Auth-Token') ||
    localStorage.getItem('phx_auth_token') ||
    sessionStorage.getItem('x-phx-auth-token') ||
    sessionStorage.getItem('X-Phx-Auth-Token');

  // 6. 输出结果
  console.log('\n' + '='.repeat(60));
  console.log('📋 提取结果');
  console.log('='.repeat(60));

  if (results.xPhxAuthToken) {
    console.log('\n✅ 找到 x-phx-auth-token:');
    console.log('   ', results.xPhxAuthToken);
    
    // 复制到剪贴板
    try {
      await navigator.clipboard.writeText(results.xPhxAuthToken);
      console.log('\n📋 已复制到剪贴板！');
    } catch (e) {
      console.log('\n⚠️ 自动复制失败，请手动复制');
    }
  } else {
    console.log('\n❌ 未找到 x-phx-auth-token');
    console.log('\n💡 请尝试以下方法：');
    console.log('   1. 按 F12 打开开发者工具');
    console.log('   2. 切换到 Network 标签');
    console.log('   3. 刷新页面');
    console.log('   4. 找到 listWithPending 请求');
    console.log('   5. 复制请求头中的 x-phx-auth-token');
  }

  console.log('\n📦 完整数据:');
  console.log(JSON.stringify(results, null, 2));

  return results;
}

// 执行
extractMeituanToken();
