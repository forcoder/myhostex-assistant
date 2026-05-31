/**
 * 美团民宿 Token 和房源信息提取工具（增强版 - 详细日志）
 * 
 * 使用方法：
 * 1. 在浏览器中登录美团民宿房东后台
 * 2. 按 F12 打开开发者工具
 * 3. 切换到 Console 标签
 * 4. 粘贴并运行此脚本
 * 5. 刷新页面，脚本会自动捕获 token
 */

(async function extractFromNetwork() {
  console.clear();
  console.log('%c🚀 开始从网络请求中提取 Token 和房源信息...', 'color: green; font-size: 14px; font-weight: bold;');
  console.log('%c当前时间:', 'color: blue;', new Date().toLocaleTimeString());
  
  let capturedToken = null;
  let capturedListings = [];
  let requestLog = [];
  
  // ========== 第一步：拦截 fetch 请求 ==========
  console.log('%c='.repeat(60), 'color: gray;');
  console.log('%c第一步：设置请求拦截器', 'color: yellow; font-weight: bold;');
  console.log('%c='.repeat(60), 'color: gray;');
  
  const originalFetch = window.fetch;
  
  window.fetch = async function(...args) {
    const [url, options] = args;
    const urlString = String(url);
    
    // 记录所有请求
    requestLog.push({
      time: new Date().toLocaleTimeString(),
      url: urlString,
      hasToken: !!(options && options.headers && (options.headers['x-phx-auth-token'] || options.headers['X-Phx-Auth-Token']))
    });
    
    // 详细日志：所有请求
    if (urlString.includes('meituan') || urlString.includes('dianping') || urlString.includes('phx')) {
      console.log(`%c📡 [${new Date().toLocaleTimeString()}] 请求: ${urlString.substring(0, 80)}...`, 'color: #666;');
    }
    
    // 检查是否是房源列表 API（扩大匹配范围）
    const isProductApi = urlString.includes('listWithPending') 
      || urlString.includes('product/list') 
      || urlString.includes('product/listWithPending')
      || urlString.includes('/api/v2/product/')
      || urlString.includes('/product/api/')
      || urlString.match(/product.*list/i);
    
    if (isProductApi) {
      console.log(`%c✨ 拦截到产品 API 请求:`, 'color: orange; font-weight: bold;', urlString);
      
      // 提取 token
      if (options && options.headers) {
        const headers = options.headers;
        const token = headers['x-phx-auth-token'] || headers['X-Phx-Auth-Token'];
        if (token) {
          capturedToken = token;
          console.log(`%c✅ 捕获到 x-phx-auth-token:`, 'color: green; font-weight: bold;', token.substring(0, 50) + '...');
        } else {
          console.log(`%c⚠️ 请求未携带 x-phx-auth-token`, 'color: orange;');
        }
      }
      
      // 执行原始请求并获取响应
      try {
        const response = await originalFetch.apply(this, args);
        const clone = response.clone();
        
        // 解析响应数据
        const data = await clone.json();
        console.log(`%c📦 API 响应状态:`, 'color: blue;', data.code, data.msg || '');
        
        if (data.code === 0 && data.data) {
          // 尝试多种可能的列表字段名
          let pageListings = data.data.list 
            || data.data.products 
            || data.data.items 
            || data.data.data
            || data.data.listing
            || data.data.houseList
            || [];
          
          // 如果上面都没找到，尝试从其他字段
          if (!pageListings || !Array.isArray(pageListings) || pageListings.length === 0) {
            const dataKeys = Object.keys(data.data);
            console.log(`%c🔍 查找可能的列表字段:`, 'color: purple;', dataKeys);
            
            for (const key of dataKeys) {
              const val = data.data[key];
              if (Array.isArray(val) && val.length > 0) {
                pageListings = val;
                console.log(`%c✅ 在字段 "${key}" 中找到 ${val.length} 个房源`, 'color: green;');
                break;
              }
            }
          }
          
          if (pageListings && pageListings.length > 0) {
            capturedListings = capturedListings.concat(pageListings);
            console.log(`%c📊 累计捕获 ${capturedListings.length} 个房源`, 'color: green; font-weight: bold;');
            
            // 显示第一个房源的结构
            if (pageListings[0]) {
              console.log(`%c🔍 房源数据结构:`, 'color: blue;');
              console.log(pageListings[0]);
            }
          } else {
            console.log(`%c⚠️ 响应中未找到房源列表`, 'color: orange;');
            console.log(`%c完整响应数据:`, 'color: purple;');
            console.log(data.data);
          }
        } else {
          console.log(`%c⚠️ API 返回非成功状态`, 'color: orange;');
          console.log(data);
        }
        
        return response;
      } catch (e) {
        console.error(`%c❌ 解析响应失败:`, 'color: red;', e);
        return originalFetch.apply(this, args);
      }
    }
    
    return originalFetch.apply(this, args);
  };
  
  console.log(`%c✅ 请求拦截器已设置`, 'color: green; font-weight: bold;');
  console.log(`%c拦截器会监听所有包含以下关键词的请求:`, 'color: blue;');
  console.log(`%c  - listWithPending`, 'color: gray;');
  console.log(`%c  - product/list`, 'color: gray;');
  console.log(`%c  - /api/v2/product/`, 'color: gray;');
  console.log(`%c  - /product/api/`, 'color: gray;`);
  
  // ========== 第二步：刷新页面触发请求 ==========
  console.log(`\n%c${'='.repeat(60)}`, 'color: gray;');
  console.log('%c第二步：刷新页面以触发 API 请求', 'color: yellow; font-weight: bold;');
  console.log(`%c${'='.repeat(60)}`, 'color: gray;');
  console.log(`%c⏳ 请手动刷新页面（按 F5 或 Ctrl+R）`, 'color: blue; font-size: 16px;');
  console.log(`%c⏳ 等待页面加载完成后，房源信息会自动捕获`, 'color: blue;');
  console.log(`%c⏳ 或者直接运行: showCapturedData()`, 'color: blue;`);
  
  // ========== 第三步：显示结果 ==========
  window.showCapturedData = function() {
    console.log(`\n%c${'='.repeat(60)}`, 'color: gray;');
    console.log('%c📋 捕获结果', 'color: yellow; font-weight: bold;');
    console.log(`%c${'='.repeat(60)}`, 'color: gray;');
    
    if (capturedToken) {
      console.log(`\n%c✅ Token 已捕获:`, 'color: green; font-weight: bold;');
      console.log(`%c${capturedToken}`, 'color: green;');
    } else {
      console.log(`\n%c❌ 未捕获到 Token`, 'color: red; font-weight: bold;');
    }
    
    if (capturedListings.length > 0) {
      console.log(`\n%c✅ 房源已捕获: ${capturedListings.length} 个`, 'color: green; font-weight: bold;');
      
      // 提取房源信息
      const listings = capturedListings.map(item => ({
        id: item.id || item.productId || item.houseId || item.product_id || item.house_id || 'unknown',
        name: item.name || item.title || item.houseName || item.product_name || item.house_name || '未知房源',
        url: item.url || item.detailUrl || item.detail_url || item.productUrl || item.product_url,
        price: item.price || item.defaultPrice || item.default_price || item.priceStr || item.price_str,
        status: item.status,
        address: item.address || item.location || item.province || '未知地址',
        city: item.city || '未知城市',
        _raw: item
      }));
      
      // 构造 URL
      listings.forEach(item => {
        if (!item.url && item.id !== 'unknown') {
          item.url = item.id.match(/^[a-f0-9]{24}$/)
            ? `https://www.meituan.com/hotel/${item.id}`
            : `https://minsu.dianping.com/room/${item.id}`;
        }
      });
      
      console.log(`\n%c📋 房源列表:`, 'color: blue;');
      listings.forEach((item, index) => {
        console.log(`\n%c${index + 1}. ${item.name}`, 'color: yellow; font-weight: bold;');
        console.log(`%c   ID: ${item.id}`, 'color: gray;');
        console.log(`%c   URL: ${item.url}`, 'color: gray;`);
        if (item.price) {
          console.log(`%c   价格: ${item.price}`, 'color: gray;`);
        }
      });
      
      // 复制到剪贴板
      const jsonStr = JSON.stringify(listings, null, 2);
      const urlList = listings.map(item => item.url).join('\n');
      
      navigator.clipboard.writeText(jsonStr)
        .then(() => console.log(`\n%c✅ 已复制 JSON 到剪贴板`, 'color: green;'))
        .catch(() => console.log(`\n%c⚠️ 复制 JSON 失败`, 'color: orange;`));
      
      navigator.clipboard.writeText(urlList)
        .then(() => console.log(`%c✅ 已复制 URL 列表到剪贴板`, 'color: green;`))
        .catch(() => {});
      
      console.log(`\n%c📦 完整数据:`, 'color: blue;');
      console.log(listings);
      
      return listings;
    } else {
      console.log(`\n%c❌ 未捕获到房源`, 'color: red; font-weight: bold;`);
      console.log(`%c💡 提示：请先刷新页面触发 API 请求`, 'color: blue;`);
    }
  };
  
  // 显示请求日志
  window.showRequestLog = function() {
    console.log(`\n%c📋 请求日志:`, 'color: yellow; font-weight: bold;');
    console.log(`%c共拦截 ${requestLog.length} 个请求`, 'color: blue;`);
    requestLog.forEach((req, i) => {
      console.log(`${i + 1}. [${req.time}] ${req.hasToken ? '✅' : '❌'} ${req.url.substring(0, 60)}...`);
    });
  };
  
  // 自动检查（每2秒检查一次）
  let checkCount = 0;
  const checkInterval = setInterval(() => {
    checkCount++;
    
    if (capturedToken && capturedListings.length > 0) {
      clearInterval(checkInterval);
      console.log(`\n%c🎉 自动捕获完成！`, 'color: green; font-size: 16px; font-weight: bold;`);
      window.showCapturedData();
    } else if (checkCount >= 30) { // 60秒后停止
      clearInterval(checkInterval);
      console.log(`\n%c⏰ 等待超时`, 'color: orange; font-weight: bold;`);
      console.log(`%c💡 请手动刷新页面`, 'color: blue;`);
      window.showRequestLog();
    }
  }, 2000);
  
})();
