// 高级房源链接提取脚本 - 适用于动态加载页面
// 使用方法：在目标页面按 F12 打开控制台，粘贴此脚本并按回车

(function() {
  console.log('=== 开始高级链接提取 ===\n');

  const results = {
    aTags: [],
    dataAttributes: [],
    textMatches: [],
    scriptMatches: [],
    windowObjects: []
  };

  const origin = window.location.origin;

  // 1. 扫描所有 a 标签
  console.log('🔍 扫描所有 <a> 标签...');
  document.querySelectorAll('a[href]').forEach((a, i) => {
    const href = a.getAttribute('href');
    if (href) {
      const fullUrl = href.startsWith('http') ? href : (href.startsWith('/') ? origin + href : href);
      results.aTags.push({
        index: i,
        href: fullUrl,
        text: a.textContent.substring(0, 50),
        id: a.id,
        class: a.className,
        onclick: a.getAttribute('onclick')
      });
    }
  });
  console.log(`✓ 找到 ${results.aTags.length} 个链接标签\n`);

  // 2. 扫描所有 data-* 属性
  console.log('🔍 扫描 data-* 属性...');
  const dataSelectors = [
    '[data-room-id]',
    '[data-house-id]',
    '[data-listing-id]',
    '[data-property-id]',
    '[data-id]',
    '[data-href]',
    '[data-url]',
    '[data-to]',
    '[data-link]'
  ];

  dataSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach((el, i) => {
      const data = {
        selector: selector,
        index: i,
        room_id: el.getAttribute('data-room-id'),
        house_id: el.getAttribute('data-house-id'),
        listing_id: el.getAttribute('data-listing-id'),
        property_id: el.getAttribute('data-property-id'),
        id: el.getAttribute('data-id'),
        href: el.getAttribute('data-href'),
        url: el.getAttribute('data-url'),
        to: el.getAttribute('data-to'),
        link: el.getAttribute('data-link'),
        text: el.textContent.substring(0, 50),
        class: el.className,
        onclick: el.getAttribute('onclick')
      };
      if (Object.values(data).some(v => v && typeof v === 'string' && v.length > 0)) {
        results.dataAttributes.push(data);
      }
    });
  });
  console.log(`✓ 找到 ${results.dataAttributes.length} 个 data-* 元素\n`);

  // 3. 从页面文本中匹配可能的路径
  console.log('🔍 从页面文本中匹配路径...');
  const pageText = document.body.innerText || document.body.textContent || '';
  const pathPatterns = [
    /\/room\/[\w\-]{3,50}/g,
    /\/rooms\/[\w\-]{3,50}/g,
    /\/house\/[\w\-]{3,50}/g,
    /\/houses\/[\w\-]{3,50}/g,
    /\/property\/[\w\-]{3,50}/g,
    /\/listing\/[\w\-]{3,50}/g,
    /\/listings\/[\w\-]{3,50}/g,
    /\/home\/[\w\-]{3,50}/g,
    /\/stay\/[\w\-]{3,50}/g,
    /\/detail\/[\w\-]{3,50}/g,
    /\/accommodation\/[\w\-]{3,50}/g,
    /\/apartment\/[\w\-]{3,50}/g,
    /\/villa\/[\w\-]{3,50}/g,
  ];

  pathPatterns.forEach(pattern => {
    const matches = pageText.match(pattern) || [];
    matches.forEach(m => {
      const fullUrl = m.startsWith('/') ? origin + m : m;
      if (!results.textMatches.includes(fullUrl)) {
        results.textMatches.push(fullUrl);
      }
    });
  });
  console.log(`✓ 从文本中找到 ${results.textMatches.length} 个路径\n`);

  // 4. 从脚本标签中提取
  console.log('🔍 从脚本标签中提取...');
  const scripts = document.querySelectorAll('script');
  scripts.forEach(script => {
    const content = script.textContent || script.innerHTML;
    if (content) {
      // 匹配常见的 ID 模式
      const idPatterns = [
        /"id"\s*:\s*"([^"]{5,50})"/g,
        /"room_id"\s*:\s*"([^"]{5,50})"/g,
        /"house_id"\s*:\s*"([^"]{5,50})"/g,
        /"listing_id"\s*:\s*"([^"]{5,50})"/g,
        /"property_id"\s*:\s*"([^"]{5,50})"/g,
        /"roomId"\s*:\s*"([^"]{5,50})"/g,
        /"houseId"\s*:\s*"([^"]{5,50})"/g,
        /'id'\s*:\s*'([^']{5,50})'/g,
        /'room_id'\s*:\s*'([^']{5,50})'/g,
        /'house_id'\s*:\s*'([^']{5,50})'/g,
        /id\s*:\s*"([^"]{5,50})"/g,
        /id\s*:\s*'([^']{5,50})'/g,
      ];

      idPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          if (match[1] && match[1].length >= 5 && match[1].length <= 50) {
            if (!results.scriptMatches.includes(match[1])) {
              results.scriptMatches.push(match[1]);
            }
          }
        }
      });
    }
  });
  console.log(`✓ 从脚本中找到 ${results.scriptMatches.length} 个 ID\n`);

  // 5. 检查 window 全局对象
  console.log('🔍 检查 window 全局对象...');
  const globalKeys = Object.keys(window).filter(k =>
    k.includes('data') || k.includes('state') || k.includes('store') ||
    k.includes('listing') || k.includes('room') || k.includes('house') ||
    k.includes('list') || k.includes('cache')
  );

  globalKeys.slice(0, 20).forEach(key => {
    try {
      const value = window[key];
      if (value && typeof value === 'object') {
        const str = JSON.stringify(value).substring(0, 200);
        if (str.includes('id') || str.includes('room') || str.includes('house')) {
          results.windowObjects.push({
            key: key,
            preview: str
          });
        }
      }
    } catch (e) {}
  });
  console.log(`✓ 找到 ${results.windowObjects.length} 个可能相关的全局对象\n`);

  // === 汇总结果 ===
  console.log('=== 提取结果汇总 ===\n');

  // 去重并分类
  const allUrls = new Set();
  const allIds = new Set();

  // 从 a 标签提取可能的详情页链接
  results.aTags.forEach(item => {
    const url = item.href;
    if (url && !url.includes('/list') && !url.includes('/filter') && !url.includes('/api/')) {
      allUrls.add(url);
    }
  });

  // 从 textMatches 提取
  results.textMatches.forEach(url => {
    if (!url.includes('/list')) {
      allUrls.add(url);
    }
  });

  // 从 scriptMatches 提取 ID
  results.scriptMatches.forEach(id => {
    if (id.match(/^[a-zA-Z0-9\-_]{5,50}$/)) {
      allIds.add(id);
    }
  });

  console.log(`📊 最终统计：`);
  console.log(`   - 唯一 URL: ${allUrls.size}`);
  console.log(`   - 唯一 ID: ${allIds.size}`);

  console.log('\n--- 找到的所有 URL ---');
  Array.from(allUrls).forEach((url, i) => {
    console.log(`${i + 1}. ${url}`);
  });

  console.log('\n--- 找到的所有 ID ---');
  Array.from(allIds).slice(0, 50).forEach((id, i) => {
    console.log(`${i + 1}. ${id}`);
  });

  console.log('\n--- Data 属性样本（前 5 个）---');
  results.dataAttributes.slice(0, 5).forEach((item, i) => {
    console.log(`${i + 1}.`, JSON.stringify(item, null, 2));
  });

  console.log('\n--- 全局对象样本（前 5 个）---');
  results.windowObjects.slice(0, 5).forEach((item, i) => {
    console.log(`${i + 1}. window.${item.key}: ${item.preview}`);
  });

  console.log('\n=== 完整数据已保存到 results 变量 ===');
  console.log('在控制台输入 `results` 查看完整数据');

  // 保存到全局变量
  window.extractResults = results;

  // 尝试复制结果
  const output = {
    urls: Array.from(allUrls),
    ids: Array.from(allIds),
    dataAttributes: results.dataAttributes,
    windowObjects: results.windowObjects
  };

  try {
    // 使用 textarea 方式复制（避免 focus 问题）
    const textarea = document.createElement('textarea');
    textarea.value = JSON.stringify(output, null, 2);
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    console.log('\n✅ 结果已复制到剪贴板！');
  } catch (e) {
    console.log('\n⚠️ 无法自动复制，请手动复制结果');
  }

  return results;
})();
