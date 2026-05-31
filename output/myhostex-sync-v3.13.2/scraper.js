/**
 * MyHostex 房源信息抓取器
 * 在 background service worker 中使用
 * 通过打开一个临时 Tab 抓取已登录用户的房源页面
 */

/**
 * 主入口：抓取指定 URL 的房源信息
 * @param {string} url - myhostex 房源或房型页面链接
 * @returns {Promise<Object>} - 提取到的房源数据
 */
export async function scrapeRoomFromUrl(url) {
  return new Promise((resolve, reject) => {
    let tabId = null;
    let settled = false;
    const timeout = 30000; // 30s 超时

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("抓取超时，请确认链接可以正常访问"));
      }
    }, timeout);

    function cleanup() {
      clearTimeout(timer);
      if (tabId !== null) {
        chrome.tabs.remove(tabId, () => {});
        tabId = null;
      }
    }

    // 创建隐藏 Tab（不激活，用户几乎感知不到）
    chrome.tabs.create({ url, active: false }, (tab) => {
      tabId = tab.id;

      // 监听页面加载完成
      const onUpdated = (updatedTabId, changeInfo) => {
        if (updatedTabId !== tabId) return;
        if (changeInfo.status !== "complete") return;

        chrome.tabs.onUpdated.removeListener(onUpdated);

        // 等待 JS 渲染（Vue/React SPA 需要等待）
        setTimeout(() => {
          if (settled) return;

          // 注入抓取脚本
          chrome.scripting.executeScript(
            {
              target: { tabId },
              func: extractPageData,
              args: [url],
            },
            (results) => {
              settled = true;
              cleanup();

              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }

              const result = results?.[0]?.result;
              if (!result || result.error) {
                reject(new Error(result?.error || "页面数据提取失败"));
              } else {
                resolve(result);
              }
            }
          );
        }, 2500); // 等待2.5秒让SPA渲染完成
      };

      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

/**
 * 在目标页面中执行的数据提取函数
 * 此函数会被 chrome.scripting.executeScript 注入到目标页面运行
 * 注意：不能引用外部变量，必须完全独立
 */
function extractPageData(originalUrl) {
  try {
    const result = {
      url: originalUrl,
      scrapedAt: new Date().toISOString(),
      pageTitle: document.title || "",
      name: "",
      description: "",
      price: "",
      notes: "",
      location: "",
      checkin: "",
      checkout: "",
      wifi: "",
      parking: "",
      contact: "",
      amenities: [],
      images: [],
      rawText: "",
      pageType: "unknown",
    };

    // ─── 辅助函数 ───────────────────────────────────────────
    function getText(selectors) {
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          if (el && el.textContent.trim()) return el.textContent.trim();
        } catch (_) {}
      }
      return "";
    }

    function getAllText(selectors) {
      const texts = [];
      for (const sel of selectors) {
        try {
          document.querySelectorAll(sel).forEach((el) => {
            const t = el.textContent.trim();
            if (t) texts.push(t);
          });
        } catch (_) {}
      }
      return texts;
    }

    // ─── 判断页面类型 ───────────────────────────────────────
    const pathname = window.location.pathname;
    const pageText = document.body.innerText || document.body.textContent || "";
    result.rawText = pageText.substring(0, 3000); // 保留前3000字用于AI分析

    if (pathname.includes("/room") || pathname.includes("/listing")) {
      result.pageType = "room_detail";
    } else if (pathname.includes("/property") || pathname.includes("/house")) {
      result.pageType = "property";
    } else {
      result.pageType = "other";
    }

    // ─── 通用字段提取（针对 myhostex 常见 DOM 结构）──────────

    // 标题/名称：尝试多种选择器
    result.name = getText([
      "h1.room-name",
      "h1.property-name",
      ".room-title",
      ".listing-name",
      ".property-title",
      "[class*='room-name']",
      "[class*='listing-name']",
      "[class*='property-name']",
      "h1",
    ]) || document.title.replace(/[-|].*$/, "").trim();

    // 描述
    result.description = getText([
      ".room-description",
      ".listing-description",
      ".property-description",
      "[class*='description']",
      ".desc-content",
      ".info-desc",
    ]);

    // 价格
    result.price = getText([
      ".price-value",
      ".room-price",
      "[class*='price']",
      ".per-night",
      ".nightly-rate",
    ]);

    // 位置
    result.location = getText([
      ".address",
      ".location",
      "[class*='address']",
      "[class*='location']",
      ".property-address",
    ]);

    // 入退房时间
    const checkinEl = getText([
      "[class*='checkin']",
      "[class*='check-in']",
      ".check-in-time",
      ".checkin-time",
    ]);
    const checkoutEl = getText([
      "[class*='checkout']",
      "[class*='check-out']",
      ".check-out-time",
      ".checkout-time",
    ]);
    if (checkinEl) result.checkin = checkinEl;
    if (checkoutEl) result.checkout = checkoutEl;

    // WiFi
    const wifiMatch = pageText.match(/WiFi[：:]\s*([^\n,，。]{1,40})/i) ||
                      pageText.match(/无线网络[：:]\s*([^\n,，。]{1,40})/i) ||
                      pageText.match(/密码[：:]\s*([^\n,，。]{1,20})/i);
    if (wifiMatch) result.wifi = wifiMatch[0].substring(0, 60);

    // 停车
    const parkMatch = pageText.match(/停车[^。\n]{0,60}/) ||
                      pageText.match(/车位[^。\n]{0,60}/) ||
                      pageText.match(/parking[^.\n]{0,60}/i);
    if (parkMatch) result.parking = parkMatch[0].substring(0, 80);

    // 联系方式
    const contactMatch = pageText.match(/微信[：:\s]*([a-zA-Z0-9_\-]{4,30})/) ||
                         pageText.match(/手机[：:\s]*(1[3-9]\d{9})/) ||
                         pageText.match(/电话[：:\s]*([\d\-+\s]{8,20})/);
    if (contactMatch) result.contact = contactMatch[0].substring(0, 60);

    // 设施列表
    result.amenities = getAllText([
      ".amenity-item",
      ".facility-item",
      "[class*='amenity'] li",
      "[class*='facility'] li",
      ".room-features li",
      ".listing-amenities li",
    ]).slice(0, 20);

    // 特殊注意事项
    result.notes = getText([
      ".house-rules",
      ".rules",
      "[class*='rules']",
      "[class*='notice']",
      ".special-notes",
    ]);

    // ─── 如果常规选择器都没抓到，尝试从原始文本提取关键信息 ────
    // 使用正则从 rawText 中再补充
    if (!result.name && document.title) {
      result.name = document.title.replace(/[-|–].*$/, "").trim().substring(0, 60);
    }

    // 提取所有可见文本段落（作为兜底）
    if (!result.description) {
      const paras = [];
      document.querySelectorAll("p, .desc, [class*='description']").forEach((el) => {
        const t = el.textContent.trim();
        if (t.length > 20 && t.length < 500) paras.push(t);
      });
      result.description = paras.slice(0, 3).join(" ").substring(0, 500);
    }

    // ─── 封面图片 ─────────────────────────────────────────
    const imgs = document.querySelectorAll(
      ".room-image img, .listing-image img, .property-image img, .cover-img, .hero-image img"
    );
    imgs.forEach((img) => {
      if (img.src && img.src.startsWith("http")) result.images.push(img.src);
    });
    result.images = result.images.slice(0, 3);

    // ─── 尝试读取 Vue/React 状态中的数据 ────────────────────
    // 很多 SPA 会把数据挂在 window.__STORE__ 或 window.__INITIAL_STATE__ 等
    const storeKeys = ["__STORE__", "__INITIAL_STATE__", "__APP_STATE__", "pageData", "__DATA__"];
    for (const key of storeKeys) {
      try {
        if (window[key]) {
          const storeStr = JSON.stringify(window[key]).substring(0, 5000);
          result.storeData = storeStr;
          break;
        }
      } catch (_) {}
    }

    // ─── 尝试抓取网络请求缓存（XHR 数据）────────────────────
    // 某些 SPA 框架会在 window.__nuxt__ 或 Vuex store 里存数据
    try {
      if (window.__nuxt__?.state) {
        result.nuxtState = JSON.stringify(window.__nuxt__.state).substring(0, 3000);
      }
    } catch (_) {}

    return result;
  } catch (err) {
    return { error: err.message };
  }
}
