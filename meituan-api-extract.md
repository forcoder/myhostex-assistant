# 美团民宿 API 分析和提取工具

## API 信息

**接口地址**:
```
POST https://api-phx.meituan.com/product/api/v2/product/listWithPending
```

**Query 参数**:
- `phx_appnm=phoenix`
- `phx_plat=www`
- `phx_app_version=3.0.0`
- `yodaReady=h5`
- `csecplatform=4`
- `csecversion=4.2.0`

**Request Headers**:
- `Content-Type: application/json`
- `x-phx-auth-token`: 用户登录 token（需要从浏览器中复制）

**Request Body**:
```json
{
  "showType": 1,
  "status": 0,
  "pageNow": 1,
  "pageSize": 20
}
```

## 使用方法

### 方案 1：在浏览器控制台运行（推荐）

1. 打开美团民宿列表页并登录
2. 按 F12 打开开发者工具
3. 切换到 Network 标签
4. 刷新页面，找到 `listWithPending` 请求
5. 复制 `x-phx-auth-token` 的值
6. 在 Console 中运行下面的脚本

### 方案 2：使用提取工具

复制下面的脚本到浏览器控制台运行：

```javascript
/**
 * 美团民宿房源链接提取脚本
 * 在浏览器控制台中运行此脚本
 */
async function extractMeituanListings() {
  try {
    // 从 localStorage 或 cookie 中获取 token
    const token = localStorage.getItem('token') 
      || document.cookie.match(/x-phx-auth-token=([^;]+)/)?.[1]
      || prompt('请输入 x-phx-auth-token（从 Network 标签的 listWithPending 请求中复制）：');

    if (!token) {
      console.error('❌ 未找到 token，请手动输入');
      return;
    }

    console.log('🚀 开始提取房源链接...');

    const results = [];
    let pageNow = 1;
    const pageSize = 20;
    let hasMore = true;

    while (hasMore) {
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

      const data = await response.json();

      if (data.code === 0 && data.data) {
        // 房源列表数据结构需要根据实际响应调整
        const listings = data.data.list || data.data.products || data.data.items || [];

        if (listings.length === 0) {
          hasMore = false;
          break;
        }

        listings.forEach(item => {
          const listing = {
            id: item.id || item.productId || item.houseId,
            name: item.name || item.title || item.houseName,
            url: item.url || item.detailUrl || `https://www.meituan.com/hotel/${item.id || item.productId}`,
            price: item.price || item.defaultPrice,
            // 添加其他需要的字段
          };
          results.push(listing);
        });

        console.log(`✅ 第 ${pageNow} 页找到 ${listings.length} 个房源，累计 ${results.length} 个`);

        // 判断是否还有更多
        hasMore = listings.length === pageSize;
        pageNow++;
      } else {
        console.error('❌ API 返回错误:', data);
        hasMore = false;
      }

      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('='.repeat(50));
    console.log(`🎉 完成！共提取 ${results.length} 个房源`);
    console.log('='.repeat(50));

    // 输出结果
    results.forEach((item, index) => {
      console.log(`${index + 1}. [${item.id}] ${item.name}`);
      console.log(`   URL: ${item.url}`);
      console.log('');
    });

    // 复制到剪贴板
    const urls = results.map(item => item.url).join('\n');
    navigator.clipboard.writeText(urls).then(() => {
      alert(`✅ 已复制 ${results.length} 个房源链接到剪贴板！`);
    });

    return results;

  } catch (error) {
    console.error('❌ 提取失败:', error);
  }
}

// 运行
extractMeituanListings();
```

## 注意事项

1. **Token 有效期**：`x-phx-auth-token` 可能有时效性，过期后需要重新获取
2. **请求频率**：避免请求过快，脚本中已添加 500ms 延迟
3. **数据结构**：根据实际 API 响应调整字段映射
4. **分页控制**：默认获取所有页面，可以在 while 循环中添加最大页数限制

## 扩展集成

可以将此逻辑集成到 background.js 中，在抓取时自动调用 API：
1. 在页面加载时自动检测 API token
2. 调用 API 获取所有房源链接
3. 批量抓取房源详情
