/**
 * 美团民宿房源链接提取脚本
 * 在浏览器控制台中运行此脚本
 * 
 * 使用方法：
 * 1. 打开美团民宿列表页并登录
 * 2. 按 F12 打开开发者工具
 * 3. 切换到 Network 标签
 * 4. 刷新页面，找到 listWithPending 请求
 * 5. 复制 x-phx-auth-token 的值
 * 6. 在 Console 中粘贴并运行此脚本
 */
async function extractMeituanListings() {
  try {
    // 提示用户输入 token
    const token = prompt(
      '请输入 x-phx-auth-token\n\n获取方法：\n1. 按 F12 打开开发者工具\n2. 切换到 Network 标签\n3. 刷新页面\n4. 找到 listWithPending 请求\n5. 复制请求头中的 x-phx-auth-token'
    );

    if (!token) {
      console.error('❌ 未提供 token，无法继续');
      return;
    }

    console.log('🚀 开始提取房源链接...');
    console.log('🔑 Token:', token.substring(0, 20) + '...');

    const results = [];
    let pageNow = 1;
    const pageSize = 20;
    const maxPages = 10; // 限制最大页数，防止请求过多
    let hasMore = true;

    while (hasMore && pageNow <= maxPages) {
      console.log(`📄 正在获取第 ${pageNow} 页...`);

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
        hasMore = false;
        break;
      }

      const data = await response.json();

      console.log('📦 API 响应结构:', Object.keys(data));

      // 根据实际 API 响应结构调整
      if (data.code === 0 && data.data) {
        // 可能的列表字段名
        const listings = data.data.list 
          || data.data.products 
          || data.data.items 
          || data.data.data
          || [];

        console.log(`📋 第 ${pageNow} 页数据字段:`, Object.keys(data.data));

        if (listings.length === 0) {
          console.log('✅ 没有更多数据了');
          hasMore = false;
          break;
        }

        listings.forEach(item => {
          console.log('🔍 房源对象字段:', Object.keys(item));
          
          const listing = {
            id: item.id || item.productId || item.houseId || item.product_id || 'unknown',
            name: item.name || item.title || item.houseName || item.product_name || '未知房源',
            url: item.url || item.detailUrl || item.detail_url || item.productUrl || item.product_url || `https://www.meituan.com/hotel/${item.id || item.productId}`,
            price: item.price || item.defaultPrice || item.default_price || item.priceStr || null,
            // 添加更多字段
          };
          results.push(listing);
        });

        console.log(`✅ 第 ${pageNow} 页找到 ${listings.length} 个房源，累计 ${results.length} 个`);

        // 判断是否还有更多
        hasMore = listings.length === pageSize;
        pageNow++;
      } else {
        console.error('❌ API 返回错误:', data);
        console.log('完整响应:', JSON.stringify(data, null, 2));
        hasMore = false;
      }

      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('='.repeat(60));
    console.log(`🎉 完成！共提取 ${results.length} 个房源`);
    console.log('='.repeat(60));

    // 输出结果
    if (results.length > 0) {
      console.log('\n📋 房源列表：');
      results.forEach((item, index) => {
        console.log(`\n${index + 1}. [${item.id}] ${item.name}`);
        console.log(`   URL: ${item.url}`);
        if (item.price) {
          console.log(`   价格: ${item.price}`);
        }
      });

      // 复制到剪贴板
      const urls = results.map(item => item.url).join('\n');
      try {
        await navigator.clipboard.writeText(urls);
        console.log('\n✅ 已复制所有房源链接到剪贴板！');
        console.log(`\n📄 JSON 格式（可在扩展中使用）：`);
        console.log(JSON.stringify(results, null, 2));
      } catch (e) {
        console.log('\n⚠️ 自动复制失败，请手动复制链接');
      }
    } else {
      console.log('⚠️ 未找到任何房源，请检查：');
      console.log('1. Token 是否正确');
      console.log('2. 是否有权限访问该 API');
      console.log('3. API 响应结构是否已变化');
    }

    return results;

  } catch (error) {
    console.error('❌ 提取失败:', error);
    console.error('错误详情:', error.stack);
  }
}

// 运行
console.log('========================================');
console.log('美团民宿房源链接提取工具');
console.log('========================================\n');
extractMeituanListings();
