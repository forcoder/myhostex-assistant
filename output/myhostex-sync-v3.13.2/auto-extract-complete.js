/**
 * 美团民宿房源信息自动提取完整流程
 * 
 * 使用方法：
 * 1. 在浏览器中登录美团民宿房东后台
 * 2. 按 F12 打开开发者工具
 * 3. 切换到 Console 标签
 * 4. 粘贴并运行此脚本
 */

(async function autoExtractMeituanListings() {
  console.log('🚀 开始自动提取美团民宿房源信息...\n');
  
  try {
    // ========== 第一步：提取 Token ==========
    console.log('='.repeat(60));
    console.log('第一步：提取 x-phx-auth-token');
    console.log('='.repeat(60));
    
    let token = null;
    
    // 从 Cookie 中查找
    document.cookie.split('; ').forEach(cookie => {
      const [name, value] = cookie.split('=');
      if (name.toLowerCase() === 'x-phx-auth-token') {
        token = value;
      }
    });
    
    // 从 localStorage 中查找
    if (!token) {
      token = localStorage.getItem('x-phx-auth-token');
    }
    
    if (!token) {
      console.error('❌ 未找到 x-phx-auth-token');
      console.log('\n💡 请确保：');
      console.log('   1. 已在美团民宿房东后台登录');
      console.log('   2. 页面已完全加载');
      return;
    }
    
    console.log('✅ Token 已获取:', token.substring(0, 30) + '...\n');

    // ========== 第二步：调用 API 获取房源列表 ==========
    console.log('='.repeat(60));
    console.log('第二步：获取房源列表');
    console.log('='.repeat(60));
    
    const listings = [];
    let pageNow = 1;
    const pageSize = 20;
    const maxPages = 5; // 最多获取5页
    let hasMore = true;

    while (hasMore && pageNow <= maxPages) {
      console.log(`\n📄 正在获取第 ${pageNow} 页...`);

      const response = await fetch(
        'https://api-phx.meituan.com/product/api/v2/product/listWithPending?phx_appnm=phoenix&phx_plat=www&phx_app_version=3.0.0&yodaReady=h5&csecplatform=4&csecversion=4.2.0',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-phx-auth-token': token,
          },
          body: JSON.stringify({
            showType: 1,
            status: 0,
            pageNow: pageNow,
            pageSize: pageSize,
          }),
        }
      );

      if (!response.ok) {
        console.error(`❌ 请求失败: ${response.status} ${response.statusText}`);
        break;
      }

      const data = await response.json();
      
      console.log('📦 API 响应状态:', data.code);
      
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
              console.log(`✅ 在字段 "${key}" 中找到列表`);
              break;
            }
          }
        }

        if (pageListings.length === 0) {
          console.log('✅ 没有更多数据了');
          hasMore = false;
          break;
        }

        console.log(`✅ 第 ${pageNow} 页找到 ${pageListings.length} 个房源`);

        // 提取房源信息
        pageListings.forEach(item => {
          const listing = {
            // 房源 ID（多种可能的字段名）
            id: item.id || item.productId || item.houseId || item.product_id || item.house_id || 'unknown',
            
            // 房源名称
            name: item.name || item.title || item.houseName || item.product_name || item.house_name || '未知房源',
            
            // 房源详情页 URL
            url: item.url || item.detailUrl || item.detail_url || item.productUrl || item.product_url,
            
            // 价格
            price: item.price || item.defaultPrice || item.default_price || item.priceStr || item.price_str,
            
            // 其他常用字段
            status: item.status,
            address: item.address || item.location || item.province || '未知地址',
            city: item.city || '未知城市',
            
            // 保存原始数据以便调试
            _raw: item
          };
          
          // 如果没有 url，尝试构造
          if (!listing.url && listing.id !== 'unknown') {
            // 尝试多种可能的 URL 格式
            listing.url = listing.id.match(/^[a-f0-9]{24}$/)
              ? `https://www.meituan.com/hotel/${listing.id}`
              : `https://minsu.dianping.com/room/${listing.id}`;
          }
          
          listings.push(listing);
        });

        console.log(`📊 累计 ${listings.length} 个房源\n`);

        // 判断是否还有更多
        hasMore = pageListings.length === pageSize;
        pageNow++;
      } else {
        console.error('❌ API 返回错误:', data);
        console.log('完整响应:', JSON.stringify(data, null, 2));
        hasMore = false;
      }

      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // ========== 第三步：输出结果 ==========
    console.log('='.repeat(60));
    console.log('🎉 提取完成！');
    console.log('='.repeat(60));
    console.log(`\n✅ 共提取 ${listings.length} 个房源\n`);

    // 输出房源列表
    if (listings.length > 0) {
      console.log('📋 房源列表：\n');
      
      listings.forEach((item, index) => {
        console.log(`\n${index + 1}. ${item.name}`);
        console.log(`   ID: ${item.id}`);
        console.log(`   URL: ${item.url}`);
        if (item.price) {
          console.log(`   价格: ${item.price}`);
        }
        if (item.address) {
          console.log(`   地址: ${item.address}`);
        }
      });

      // ========== 第四步：复制到剪贴板 ==========
      console.log('\n' + '='.repeat(60));
      console.log('📋 正在复制到剪贴板...');
      console.log('='.repeat(60));
      
      // 复制 JSON 格式
      try {
        await navigator.clipboard.writeText(JSON.stringify(listings, null, 2));
        console.log('✅ 已复制 JSON 格式到剪贴板！');
      } catch (e) {
        console.log('⚠️ JSON 格式复制失败');
      }
      
      // 复制 URL 列表
      try {
        const urls = listings.map(item => item.url).join('\n');
        await navigator.clipboard.writeText(urls);
        console.log('✅ 已复制 URL 列表到剪贴板！');
      } catch (e) {
        console.log('⚠️ URL 列表复制失败');
      }
      
      console.log('\n💡 提示：');
      console.log('   - 可以直接在 MyHostex 扩展中粘贴这些 URL');
      console.log('   - 或者将 JSON 格式保存到文件中');
      
    } else {
      console.log('❌ 未找到任何房源');
      console.log('\n💡 可能的原因：');
      console.log('   1. Token 已过期，需要重新登录');
      console.log('   2. 没有房源权限');
      console.log('   3. API 响应结构已变化');
    }

    console.log('\n' + '='.repeat(60));
    console.log('📦 完整 JSON 数据（可在控制台上方查看）:');
    console.log('='.repeat(60));
    console.log(JSON.stringify(listings, null, 2));

    return listings;

  } catch (error) {
    console.error('❌ 提取失败:', error);
    console.error('错误详情:', error.stack);
  }
})();
