/**
 * 美团民宿 Token 和房源信息提取工具（从网络请求中捕获）
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
  console.log('🚀 开始从网络请求中提取 Token 和房源信息...\n');
  
  let capturedToken = null;
  let capturedListings = [];
  
  // ========== 第一步：拦截 fetch 请求 ==========
  console.log('='.repeat(60));
  console.log('第一步：设置请求拦截器');
  console.log('='.repeat(60));
  
  const originalFetch = window.fetch;
  
  window.fetch = async function(...args) {
    const [url, options] = args;
    
    // 检查是否是房源列表 API
    if (url.includes('listWithPending') || url.includes('product/list')) {
      console.log('📡 拦截到房源列表请求:', url);
      
      // 提取 token
      if (options && options.headers) {
        const headers = options.headers;
        const token = headers['x-phx-auth-token'] || headers['X-Phx-Auth-Token'];
        if (token) {
          capturedToken = token;
          console.log('✅ 捕获到 x-phx-auth-token:', token.substring(0, 30) + '...');
        }
      }
      
      // 执行原始请求并获取响应
      try {
        const response = await originalFetch.apply(this, args);
        const clone = response.clone();
        
        // 解析响应数据
        const data = await clone.json();
        console.log('📦 API 响应:', data);
        
        if (data.code === 0 && data.data) {
          // 尝试多种可能的列表字段名
          let pageListings = data.data.list 
            || data.data.products 
            || data.data.items 
            || data.data.data
            || [];
          
          // 如果上面都没找到，尝试从其他字段
          if (!pageListings.length) {
            const dataKeys = Object.keys(data.data);
            console.log('🔍 查找可能的列表字段:', dataKeys);
            
            for (const key of dataKeys) {
              const val = data.data[key];
              if (Array.isArray(val) && val.length > 0) {
                pageListings = val;
                console.log(`✅ 在字段 "${key}" 中找到 ${val.length} 个房源`);
                break;
              }
            }
          }
          
          if (pageListings.length > 0) {
            capturedListings = capturedListings.concat(pageListings);
            console.log(`📊 累计捕获 ${capturedListings.length} 个房源`);
          }
        }
        
        return response;
      } catch (e) {
        console.error('❌ 解析响应失败:', e);
        return originalFetch.apply(this, args);
      }
    }
    
    return originalFetch.apply(this, args);
  };
  
  console.log('✅ 请求拦截器已设置\n');
  
  // ========== 第二步：刷新页面触发请求 ==========
  console.log('='.repeat(60));
  console.log('第二步：刷新页面以触发 API 请求');
  console.log('='.repeat(60));
  console.log('⏳ 请手动刷新页面（按 F5 或 Ctrl+R）');
  console.log('⏳ 等待页面加载完成后，房源信息会自动捕获\n');
  
  // ========== 第三步：显示结果 ==========
  console.log('='.repeat(60));
  console.log('第三步：查看捕获结果');
  console.log('='.repeat(60));
  console.log('运行: window.showCapturedData() 查看结果\n');
  
  // 全局函数：显示捕获的数据
  window.showCapturedData = function() {
    console.log('\n' + '='.repeat(60));
    console.log('📋 捕获结果');
    console.log('='.repeat(60));
    
    if (capturedToken) {
      console.log('\n✅ Token 已捕获:');
      console.log('   ', capturedToken);
    } else {
      console.log('\n❌ 未捕获到 Token');
    }
    
    if (capturedListings.length > 0) {
      console.log(`\n✅ 房源已捕获: ${capturedListings.length} 个`);
      
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
      
      console.log('\n📋 房源列表：');
      listings.forEach((item, index) => {
        console.log(`\n${index + 1}. ${item.name}`);
        console.log(`   ID: ${item.id}`);
        console.log(`   URL: ${item.url}`);
        if (item.price) {
          console.log(`   价格: ${item.price}`);
        }
      });
      
      // 复制到剪贴板
      navigator.clipboard.writeText(JSON.stringify(listings, null, 2))
        .then(() => console.log('\n✅ 已复制 JSON 到剪贴板'))
        .catch(() => console.log('\n⚠️ 复制失败'));
      
      navigator.clipboard.writeText(listings.map(item => item.url).join('\n'))
        .then(() => console.log('✅ 已复制 URL 列表到剪贴板'))
        .catch(() => {});
      
      console.log('\n📦 完整数据:');
      console.log(JSON.stringify(listings, null, 2));
      
      return listings;
    } else {
      console.log('\n❌ 未捕获到房源');
      console.log('💡 提示：请先刷新页面触发 API 请求');
    }
  };
  
  // 自动检查（每2秒检查一次）
  let checkCount = 0;
  const checkInterval = setInterval(() => {
    checkCount++;
    
    if (capturedToken && capturedListings.length > 0) {
      clearInterval(checkInterval);
      console.log('\n🎉 自动捕获完成！运行 showCapturedData() 查看结果');
      window.showCapturedData();
    } else if (checkCount >= 30) { // 60秒后停止
      clearInterval(checkInterval);
      console.log('\n⏰ 等待超时，请手动刷新页面');
    }
  }, 2000);
  
})();
