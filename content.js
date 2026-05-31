/**
 * MyHostex 智能回复助手 - Content Script (v2, LLM 版)
 * 注入到 myhostex.com 页面，监听新消息，调用大模型生成建议回复
 */

(function () {
  "use strict";

  const CONFIG = {
    checkInterval: 5000,
    maxSuggestions: 5,
  };

  let state = {
    panelExpanded: false,
    lastMessageIds: new Set(),
    currentConversation: null,
    currentMessages: [],
    suggestions: [],
    isLearning: true,
    userStyle: null,
    observer: null,
    checkTimer: null,
    isGenerating: false,
  };

  function log(...args) { console.log("[MyHostex助手]", ...args); }

  // ============================================================
  // WebSocket 监听 - 通过页面注入脚本捕获实时消息
  // ============================================================
  const WebSocketMonitor = {
    hasInitialized: false,

    /**
     * 将 injected.js 注入到页面的真实 JS 上下文。
     * content script 运行在隔离沙盒中，无法直接拦截页面的 window.WebSocket。
     * 通过插入 <script> 标签，让脚本运行在页面上下文，绕开沙盒限制。
     */
    init() {
      if (this.hasInitialized) return;
      this.hasInitialized = true;

      // 1. 注入脚本到页面上下文
      try {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('injected.js');
        script.onload = function () {
          script.remove();
          console.log('[MyHostex助手] ✅ injected.js 加载完成');
        };
        script.onerror = function (e) {
          console.error('[MyHostex助手] ❌ injected.js 加载失败:', e);
        };
        // 尽可能早地注入
        (document.head || document.documentElement).appendChild(script);
      } catch (e) {
        log('❌ 注入脚本失败:', e);
        return;
      }

      // 2. 监听 injected.js 成功加载事件
      window.addEventListener('__mha_injected__', (e) => {
        const version = chrome.runtime.getManifest().version;
        log('🔌 WebSocket 拦截脚本已激活，版本:', version);
      });

      // 3. 监听 WebSocket 收到的消息（由 injected.js 通过 CustomEvent 转发）
      window.addEventListener('__mha_ws_message__', (e) => {
        const { url, data } = e.detail || {};
        this.parseMessage(data, url);
      });

      // 4. 监听 WebSocket 发送的消息（调试用）
      window.addEventListener('__mha_ws_send__', (e) => {
        const { url, data } = e.detail || {};
        if (data && (data.includes('subscribe') || data.includes('new_inquiry'))) {
          log('📤 WebSocket 发送:', data.slice(0, 200));
        }
      });

      log('🔌 WebSocket 监听器已启动 (页面注入模式)');
    },

    parseMessage(data, url) {
      if (!data || data === '__BINARY__') return;

      // 打印所有收到的消息（调试用）
      log('📥 WS消息:', data.slice(0, 200));

      // 检查是否包含关键词
      if (!data.includes('new_inquiry') && !data.includes('customer_inquiry')) return;

      log('🔔 检测到新消息信号!');
      log('📝 完整消息:', data.slice(0, 800));

      // 解析 JSON
      let json = null;
      try {
        json = JSON.parse(data);
      } catch (e) {
        log('⚠️ JSON 解析失败');
        return;
      }

      if (!json) return;

      const contentType = json.content?.type;

      // ── 格式1: new_inquiry（直接有租客消息）──────────────────────
      if (contentType === 'new_inquiry') {
        const body = json.content.body;
        const threadId = body?.thread_id || body?.new_inquiry?.thread_id;
        const preview  = body?.text_preview || body?.new_inquiry?.message || '';

        // 判断真实发送方：比较 origin_sender_id 和 origin_customer_id
        const originSenderId = body?.new_inquiry?.origin_sender_id || body?.origin_sender_id;
        const tenantCustomerId = body?.thirdparty_tenant_customer?.origin_customer_id;
        const senderId = originSenderId || tenantCustomerId;

        let sender = body?.thirdparty_tenant_customer?.name || '客人';
        let isFromCustomer = true;

        // 如果 origin_sender_id 不等于 origin_customer_id，说明不是客户发送的
        if (originSenderId && tenantCustomerId && originSenderId !== tenantCustomerId) {
          isFromCustomer = false;
          log(`🔍 发送方检测: origin_sender_id(${originSenderId}) ≠ origin_customer_id(${tenantCustomerId}), 非客户发送`);
        } else {
          log(`🔍 发送方检测: origin_sender_id(${originSenderId}) == origin_customer_id(${tenantCustomerId}), 客户发送`);
        }

        log('🆔 new_inquiry, Thread ID:', threadId, '| 预览:', preview, '| 是否客户:', isFromCustomer);

        if (threadId) {
          this.handleNewInquiry({ threadId, preview, sender, body, isFromCustomer });
        }
        return;
      }

      // ── 格式2: housing_status_notice（包含 customer_inquiry 子类型）──
      if (contentType === 'housing_status_notice') {
        const body = json.content.body;
        // 判断是不是新消息类通知
        if (body?.type === 'customer_inquiry' || body?.origin_data?.params?.thread_id) {
          const threadId = body?.origin_data?.params?.thread_id;
          const preview  = body?.content || body?.origin_data?.content || '';
          const sender   = preview ? preview.split(':')[0] : '客人';

          // housing_status_notice 类型没有 origin_sender_id 字段，默认为客户发送
          const isFromCustomer = true;

          log('🆔 housing_status_notice(customer_inquiry), Thread ID:', threadId, '| 预览:', preview, '| 是否客户:', isFromCustomer);

          if (threadId) {
            this.handleNewInquiry({ threadId, preview, sender, body, isFromCustomer });
          }
        }
        return;
      }

      // ── 格式3: customer_inquiry 顶层类型 ────────────────────────
      if (contentType === 'customer_inquiry') {
        const body = json.content.body;
        const threadId = body?.thread_id || body?.customer_inquiry?.thread_id;
        const preview  = body?.text_preview || body?.customer_inquiry?.message || '';

        // 判断真实发送方：比较 origin_sender_id 和 origin_customer_id
        const originSenderId = body?.customer_inquiry?.origin_sender_id || body?.origin_sender_id;
        const tenantCustomerId = body?.thirdparty_tenant_customer?.origin_customer_id;

        let sender = body?.thirdparty_tenant_customer?.name || '客人';
        let isFromCustomer = true;

        // 如果 origin_sender_id 不等于 origin_customer_id，说明不是客户发送的
        if (originSenderId && tenantCustomerId && originSenderId !== tenantCustomerId) {
          isFromCustomer = false;
          log(`🔍 发送方检测: origin_sender_id(${originSenderId}) ≠ origin_customer_id(${tenantCustomerId}), 非客户发送`);
        } else {
          log(`🔍 发送方检测: origin_sender_id(${originSenderId}) == origin_customer_id(${tenantCustomerId}), 客户发送`);
        }

        log('🆔 customer_inquiry, Thread ID:', threadId, '| 预览:', preview, '| 是否客户:', isFromCustomer);

        if (threadId) {
          this.handleNewInquiry({ threadId, preview, sender, body, isFromCustomer });
        }
      }
    },

    /**
     * 提取房源信息的独立方法（支持多次调用）
     */
    async extractHousingInfo(threadId, body, sender) {
      let housing = "";
      let housingSource = "";

      // 方案0: 调用 detail API 获取房源信息（最可靠）
      if (threadId && !housing) {
        try {
          log(`🔍 尝试调用 detail API 获取房源信息 (Thread ID: ${threadId})`);
          // 尝试通过 fetch 调用 detail API
          const apiResponse = await fetch(`/api/chat/v2/detail?thread_id=${threadId}`, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            }
          });

          if (apiResponse.ok) {
            const apiData = await apiResponse.json();
            log('📋 detail API 响应:', apiData);

            // 从 activities 中提取房源信息
            if (apiData?.data?.activities && apiData.data.activities.length > 0) {
              const property = apiData.data.activities[0].property;
              if (property && property.title) {
                housing = property.title.trim();
                housingSource = "Detail API";
                log(`🏠 从 detail API 中提取到房源: ${housing}`);
              }
            }
          } else {
            log(`⚠️ detail API 调用失败: ${apiResponse.status}`);
          }
        } catch (e) {
          log('⚠️ 调用 detail API 失败:', e);
        }
      }

      // 方案1: 从 WebSocket body.origin_data 中提取房源信息
      if (!housing && body && body.origin_data) {
        const title = body.origin_data.title || "";
        log('🔍 WebSocket 标题:', title);

        // 定义需要排除的渠道关键词（这些不是具体房号）
        const channelKeywords = ["美团民宿", "美团", "Airbnb", "Booking", "携程民宿", "途家", "小猪短租"];

        // 尝试多种正则表达式匹配
        // 模式1: "您有一条 [房源名称] 新询问消息"
        let match = title.match(/您有一条[\s\u3000]+(.+?)[\s\u3000]+新询问消息/);
        if (match && match[1]) {
          const candidate = match[1].trim();
          // 过滤掉渠道名称
          if (!channelKeywords.some(kw => candidate.includes(kw))) {
            housing = candidate;
            housingSource = "WebSocket标题(标准格式)";
            log('🏠 从 WebSocket 标题中提取到房源:', housing);
          } else {
            log('⚠️ WebSocket 标题提取的是渠道名称，跳过:', candidate);
          }
        }
        // 模式2: "您有一条 [房源名称] 新咨询消息" (咨询 vs 询问)
        else if ((match = title.match(/您有一条[\s\u3000]+(.+?)[\s\u3000]+新咨询消息/)) && match[1]) {
          const candidate = match[1].trim();
          // 过滤掉渠道名称
          if (!channelKeywords.some(kw => candidate.includes(kw))) {
            housing = candidate;
            housingSource = "WebSocket标题(咨询格式)";
            log('🏠 从 WebSocket 标题中提取到房源:', housing);
          } else {
            log('⚠️ WebSocket 标题提取的是渠道名称，跳过:', candidate);
          }
        }
        // 模式3: 尝试从 body.new_inquiry 或 body.thirdparty_host_customer 中提取
        else if (body.new_inquiry || body.thirdparty_host_customer) {
          const inquiry = body.new_inquiry || {};
          const hostCustomer = body.thirdparty_host_customer || {};
          // 尝试从 host_customer.name 中提取（可能包含房源名称）
          if (hostCustomer.name && hostCustomer.name !== sender) {
            const candidate = hostCustomer.name.trim();
            // 过滤掉渠道名称和掩码
            const isMasked = /\*{4,}/.test(candidate); // 如 "55272198****"
            const isChannel = channelKeywords.some(kw => candidate.includes(kw));
            if (!isMasked && !isChannel) {
              housing = candidate;
              housingSource = "host_customer.name";
              log('🏠 从 host_customer.name 中提取到房源:', housing);
            } else {
              log('⚠️ host_customer.name 是掩码或渠道名称，跳过:', candidate);
            }
          }
        }

        if (!housing) {
          log('⚠️ 所有 WebSocket 提取策略都失败或被过滤，title:', title);
        }
      }

      // 方案2: 从对话列表中查找房源信息（备用）
      if (!housing) {
        try {
          const conversations = MessageReader.getConversationList();
          log(`🔍 对话列表找到 ${conversations.length} 条对话，目标 Thread ID: ${threadId}`);
          const targetConv = conversations.find(c => c.id === threadId);
          if (targetConv) {
            log(`🔍 找到目标对话，房源信息: "${targetConv.housing}"`);
            if (targetConv.housing) {
              housing = targetConv.housing.trim();
              housingSource = "对话列表";
              log('🏠 从对话列表中提取到房源:', housing);
            } else {
              log('⚠️ 目标对话没有房源信息');
            }
          } else {
            log('⚠️ 对话列表中找不到目标对话');
          }
        } catch (e) {
          log('⚠️ 提取房源信息失败:', e);
        }
      }

      // 方案3: 尝试从页面 URL 中提取（如果已跳转到对话详情页）
      if (!housing) {
        try {
          const url = window.location.href;
          // 尝试从 URL 参数中提取房源信息
          const urlMatch = url.match(/[?&]room(?:_id|_name)?[=]([^&]+)/) ||
                          url.match(/[?&]housing(?:_id|_name)?[=]([^&]+)/) ||
                          url.match(/[?&]prop(?:_id|_erty)?[=]([^&]+)/);
          if (urlMatch && urlMatch[1]) {
            housing = decodeURIComponent(urlMatch[1]).trim();
            housingSource = "URL参数";
            log('🏠 从 URL 中提取到房源:', housing);
          }
        } catch (e) {
          log('⚠️ 从 URL 提取房源信息失败:', e);
        }
      }

      // 方案4: 尝试从页面标题或其他 DOM 元素中提取
      if (!housing) {
        try {
          // 查找页面标题
          const pageTitle = document.title || "";
          if (pageTitle && pageTitle !== "MyHostex" && pageTitle !== "消息") {
            // 如果页面标题不是默认值，尝试提取房源名称
            // 排除常见的非房源关键词
            const excludeKeywords = ["消息", "消息列表", "对话", "Inbox", "Messages", "美团", "Airbnb", "Booking"];
            const isExcluded = excludeKeywords.some(kw => pageTitle.includes(kw));

            if (!isExcluded && pageTitle.length > 0 && pageTitle.length < 50) {
              housing = pageTitle.trim();
              housingSource = "页面标题";
              log('🏠 从页面标题中提取到房源:', housing);
            }
          }

          // 查找页面中的房源信息元素（针对详情页右上角）
          const housingSelectors = [
            // 优先查找详情页右上角的房源名称
            "[class*='detail-header'] h2, [class*='detail-header'] h3",
            "[class*='conversation-header'] h2, [class*='conversation-header'] h3",
            "[class*='message-detail'] h2, [class*='message-detail'] h3",
            // 右侧面板的标题
            "[class*='right-panel'] h2, [class*='right-panel'] h3",
            "[class*='side-panel'] h2, [class*='side-panel'] h3",
            // 通用房源名称选择器
            "[class*='housing-name']",
            "[class*='property-name']",
            "[class*='room-name']",
            "[class*='prop-name']",
            // 页面主要标题（排除列表页的标题）
            "h1:not([class*='list']), h2:not([class*='list']), h3:not([class*='list'])",
            ".header-title, .page-title"
          ];

          for (const sel of housingSelectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent && el.textContent.trim()) {
              const text = el.textContent.trim();
              // 排除明显的非房源文本
              const excludeKeywords = ["消息", "消息列表", "对话", "Inbox", "Messages", "美团", "咨询", "询问"];
              const isExcluded = excludeKeywords.some(kw => text.includes(kw));

              if (!isExcluded && text.length > 0 && text.length < 50) {
                housing = text;
                housingSource = `DOM元素(${sel})`;
                log('🏠 从 DOM 元素中提取到房源:', housing);
                break;
              }
            }
          }
        } catch (e) {
          log('⚠️ 从 DOM 提取房源信息失败:', e);
        }
      }

      // 方案5: 智能查找包含房号特征的文本元素
      if (!housing) {
        try {
          // 房号特征：包含"街"字和数字（如"波韵5街6号"、"5街35"）
          const housingPattern = /.*街.*\d+.*/;
          const allElements = document.querySelectorAll('h1, h2, h3, h4, .title, [class*="title"]');

          for (const el of allElements) {
            const text = el.textContent?.trim();
            if (text && housingPattern.test(text) && text.length < 50) {
              // 排除包含明显非房源关键词的文本
              const excludeKeywords = ["消息", "消息列表", "对话", "Inbox", "Messages", "美团", "咨询", "询问"];
              const isExcluded = excludeKeywords.some(kw => text.includes(kw));

              if (!isExcluded) {
                housing = text;
                housingSource = "智能房号匹配";
                log('🏠 通过房号特征匹配到房源:', housing);
                break;
              }
            }
          }
        } catch (e) {
          log('⚠️ 智能房号匹配失败:', e);
        }
      }

      if (!housing) {
        log('⚠️ 无法获取房源信息（尝试了所有策略），建议可能不准确');
      } else {
        log(`✅ 房源信息获取成功 (${housingSource}): ${housing}`);
      }

      return housing;
    },

    /**
     * 收到新消息后，直接驱动面板展开并生成建议
     * 不依赖 DOM 查询，完全由 WebSocket 数据驱动
     */
    async handleNewInquiry({ threadId, preview, sender, body, isFromCustomer = true }) {
      log('✅ 处理新消息 — Thread:', threadId, '| 发件人:', sender, '| 预览:', preview, '| 是否客户:', isFromCustomer);

      // 如果 WebSocket 层面已经判断出不是客户发送的，直接跳过
      if (!isFromCustomer) {
        log(`⏭️ WebSocket 层面判断：不是客户发送的消息，不生成建议回复`);
        // 仍然展开面板但不生成建议
        if (!state.panelExpanded) {
          Panel.expand();
        }
        return;
      }

      // 再次检查发件人是否为自动化工具（双重保障）
      const isAutoTool = sender && (
        sender.toString().startsWith('15088670554') ||
        sender.toString().includes('自动化工具：') ||
        sender.toString().includes('客服') ||
        sender.toString().includes('系统') ||
        sender.toString().includes('Hostex') ||
        sender.toString().includes('Admin')
      );

      if (isAutoTool) {
        log(`⏭️ 跳过自动化工具消息（发件人：${sender}），不生成建议回复`);
        // 仍然展开面板但不生成建议
        if (!state.panelExpanded) {
          Panel.expand();
        }
        return;
      }

      // 尝试提取房源信息，首次失败则延迟重试
      let housing = await this.extractHousingInfo(threadId, body, sender);
      if (!housing) {
        log('⏳ 首次提取失败，3秒后重试（等待页面跳转）...');
        await sleep(3000);
        housing = await this.extractHousingInfo(threadId, body, sender);
        if (housing) {
          log('✅ 重试成功，获取到房源信息:', housing);
        }
      }



      // 组装对话信息
      const conv = {
        id: threadId,
        sender: sender,
        preview: preview,
        hasUnread: true,
        element: null,
        housing: housing  // 房源信息
      };
      state.currentConversation = conv;

      // 组装消息列表（至少包含这条预览消息）
      const wsMsg = { text: preview, isOutgoing: false };
      const msgs = [wsMsg];
      state.currentMessages = msgs;

      // 如果 Panel 还没初始化，等待后重试
      if (!Panel.root) {
        log('⏳ Panel 尚未初始化，500ms 后重试...');
        setTimeout(() => this.handleNewInquiry({ threadId, preview, sender, body }), 500);
        return;
      }

      // 更新面板预览
      Panel.updatePreview(conv, msgs);

      // 自动展开面板
      chromeGet(["settings"]).then((res) => {
        if ((res.settings?.autoExpand !== false) && !state.panelExpanded) {
          log('📂 自动展开面板');
          Panel.expand();
        }

        // 直接使用 WebSocket 消息生成建议，不依赖 DOM
        // 确保已经确认是客户发送的消息（isFromCustomer === true）
        if (isFromCustomer) {
          log('✅ 确认客户发送，直接生成建议');
          state.currentMessages = msgs;
          Panel.updatePreview(conv, msgs);

          // 立即生成建议，不等待 DOM
          log('🤖 开始生成建议，当前消息:', msgs);
          Panel.requestSuggestions(msgs);
        } else {
          log('⏭️ 非客户发送，跳过建议生成');
          state.currentMessages = msgs;
          Panel.updatePreview(conv, msgs);
        }
      });

      // 桌面通知
      Monitor.notify(conv);
    }
  };

  // ============================================================
  // 消息读取 - 解析页面 DOM
  // ============================================================
  const MessageReader = {
    getConversationList() {
      const selectors = [
        ".inbox-list .conversation-item",
        "[data-testid='conversation-item']",
        ".message-list-item",
        ".conversation-row",
        "li[class*='conversation']",
        "div[class*='inbox'] div[class*='item']",
        "[class*='ConversationItem']",
        "[class*='thread-item']",
      ];
      let items = [];
      for (const sel of selectors) {
        items = document.querySelectorAll(sel);
        if (items.length > 0) break;
      }

      const conversations = [];
      items.forEach((el) => {
        const id = el.dataset.id || el.dataset.conversationId || el.getAttribute("data-id") || el.id;
        const hasUnread =
          el.classList.contains("unread") ||
          !!el.querySelector(".unread-badge, .badge, [class*='unread'], [class*='badge']");
        const senderEl = el.querySelector("[class*='sender'],[class*='guest'],[class*='name'],[class*='title']");
        const previewEl = el.querySelector("[class*='preview'],[class*='snippet'],[class*='body'] p, p");
        const timeEl = el.querySelector("time,[class*='time']");

        // 尝试提取房源信息
        const housingEl = el.querySelector("[class*='housing'],[class*='property'],[class*='room'],[class*='prop']");
        const housingName = housingEl?.textContent?.trim() || "";

        // 如果没有找到专门的房源元素，尝试从元素文本中提取
        // 格式通常是：客户名称 - 房源名称 或者 客户名称 \n 房源名称
        let extractedHousing = "";
        if (!housingName && senderEl) {
          const text = el.textContent || "";
          const lines = text.split('\n').map(l => l.trim()).filter(l => l);
          // 尝试第二行作为房源名称（常见格式）
          if (lines.length >= 2 && lines[0] === senderEl.textContent.trim()) {
            extractedHousing = lines[1];
          }
        }

        const finalHousing = housingName || extractedHousing || "";

        conversations.push({
          id,
          element: el,
          hasUnread: !!hasUnread,
          sender: senderEl?.textContent?.trim() || "客人",
          preview: previewEl?.textContent?.trim() || "",
          time: timeEl?.textContent?.trim() || "",
          housing: finalHousing,  // 房源信息
        });
      });
      return conversations;
    },

    getCurrentMessages() {
      const selectors = [
        ".message-bubble",
        ".chat-message",
        "[class*='message-item']",
        "[class*='MessageItem']",
        "[data-testid='message']",
        "[class*='msg']",
      ];
      let items = [];
      for (const sel of selectors) {
        items = document.querySelectorAll(sel);
        if (items.length > 0) {
          log(`✅ 使用选择器 ${sel} 找到 ${items.length} 条消息`);
          break;
        }
      }

      const messages = [];
      items.forEach((el, idx) => {
        const isOutgoing =
          el.classList.contains("outgoing") ||
          el.classList.contains("sent") ||
          el.classList.contains("self") ||
          el.dataset.direction === "outgoing" ||
          el.dataset.sender === "host";

        const bodyEl = el.querySelector(".message-body,.text,.content,p,span[class*='body']") || el;
        const text = bodyEl?.textContent?.trim() || "";
        const timeEl = el.querySelector("time,[class*='time']");

        if (text && text.length > 0) {
          messages.push({
            id: el.dataset.id || String(idx),
            text,
            isOutgoing,
            time: timeEl?.textContent?.trim() || "",
          });
        }
      });
      log(`📊 最终获取到 ${messages.length} 条消息`);
      return messages;
    },

    getInputBox() {
      const selectors = [
        ".ant-input[placeholder*='message' i]",
        ".ant-input[placeholder*='撰写']",
        "textarea[placeholder*='message' i]",
        "textarea[placeholder*='撰写']",
        "textarea[placeholder*='回复']",
        "textarea[placeholder*='输入']",
        "div[contenteditable='true'][class*='editor']",
        "div[contenteditable='true'][class*='input']",
        "div[contenteditable='true'][class*='reply']",
        ".reply-input textarea",
        ".message-composer textarea",
        "textarea",
      ];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          // 跳过插件自己的输入框
          const id = el.id || '';
          const cls = el.className || '';
          if (!id.includes('mha') && !cls.includes('mha')) {
            return el;
          }
        }
      }
      return null;
    },

    getSendButton() {
      const selectors = [
        ".ant-btn-primary",
        ".ant-btn[class*='send']",
        "button[type='submit']",
        "button[class*='send']",
        "button[aria-label*='send' i]",
        "button[aria-label*='发送']",
        "[class*='send-btn']",
        ".send-button",
      ];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          // 跳过插件自己的按钮
          const id = el.id || '';
          const cls = el.className || '';
          const text = el.textContent.trim();
          if (!id.includes('mha') && !cls.includes('mha')) {
            // 优先选择有"发送"文本的按钮
            if (text.includes('发送') || text.includes('Send') || text.includes('提交')) {
              return el;
            }
          }
        }
      }
      // 如果没找到，返回第一个非插件按钮
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const id = el.id || '';
          const cls = el.className || '';
          if (!id.includes('mha') && !cls.includes('mha')) {
            return el;
          }
        }
      }
      return null;
    },
  };

  // ============================================================
  // LLM 调用（通过 background 代理，避免 CORS）
  // ============================================================
  const LLMClient = {
    async generate(messages, extraContext) {
      return new Promise((resolve, reject) => {
        try {
          // 检查扩展上下文是否有效
          if (!chrome.runtime || !chrome.runtime.id) {
            log('❌ 扩展上下文已失效，跳过 AI 生成');
            resolve({
              suggestions: [],
              fromKB: false,
              kbCount: 0,
              error: 'Extension context invalidated'
            });
            return;
          }

          chrome.runtime.sendMessage(
            {
              type: "GENERATE_SUGGESTIONS",
              messages,
              extraContext,
            },
            (res) => {
              if (chrome.runtime.lastError) {
                const errorMsg = chrome.runtime.lastError.message;
                // 识别"Extension context invalidated"错误
                if (errorMsg.includes('Extension context invalidated') ||
                    errorMsg.includes('The message port closed')) {
                  log('❌ 扩展上下文已失效，跳过 AI 生成');
                  resolve({
                    suggestions: [],
                    fromKB: false,
                    kbCount: 0,
                    error: 'Extension context invalidated'
                  });
                  return;
                }
                reject(new Error(errorMsg));
                return;
              }
              if (res?.error) {
                reject(new Error(res.error));
                return;
              }
              // 返回完整响应对象，包含 fromKB、kbCount 等额外信息
              resolve({
                suggestions: res?.suggestions || [],
                fromKB: res?.fromKB || false,
                kbCount: res?.kbCount || 0,
              });
            }
          );
        } catch (error) {
          log('❌ LLM 调用异常:', error.message);
          resolve({
            suggestions: [],
            fromKB: false,
            kbCount: 0,
            error: error.message
          });
        }
      });
    },
  };

  // ============================================================
  // 本地回退建议（LLM 不可用时）
  // ============================================================
  const FallbackEngine = {
    templates: {
      greeting:       ["你好，有什么可以帮助您的？", "您好，请问有什么需要吗？", "你好呀，有什么我可以帮忙的？"],
      priceInquiry:   ["一天200元，您要住几天？", "200一晚，住几天可以给您优惠", "房租200一天，您打算什么时候入住？"],
      availability:   ["有空的，请问您要住哪几天？", "有的，您打算什么时候入住？", "可以预订，您要住几号到几号？"],
      confirmation:   ["好的，已为您预订成功", "好的，收到，已确认", "没问题，已经预订好了"],
      problem:        ["不好意思，我马上处理", "抱歉，我这就去看看", "好的，我马上解决这个问题"],
      checkout:       ["好的，再见，欢迎下次再来", "好的，慢走，期待下次光临", "好的，感谢入住，再见"],
      thanks:         ["不客气", "没问题，应该的", "好的，满意就好"],
      default:        ["好的，收到了", "好的，了解", "好的，我知道了"],
    },

    analyze(text) {
      const t = (text || "").toLowerCase();
      if (["hello","hi ","hey","你好","您好","在吗"].some((k) => t.includes(k))) return "greeting";
      if (["price","cost","rate","价格","费用","多少钱","多少钱一晚","房租"].some((k) => t.includes(k))) return "priceInquiry";
      if (["available","空","有没有","can i book","还能住吗","还能订吗","还能住"].some((k) => t.includes(k))) return "availability";
      if (["confirm","book","reserve","预订","确认","我要订","我要预订"].some((k) => t.includes(k))) return "confirmation";
      if (["problem","issue","broken","问题","坏了","投诉","不好"].some((k) => t.includes(k))) return "problem";
      if (["check-out","退房","离开","退了"].some((k) => t.includes(k))) return "checkout";
      if (["thank","谢谢","感谢","太好了","great","wonderful","可以","满意","好的收到"].some((k) => t.includes(k))) return "thanks";
      return "default";
    },

    getSuggestions(messages, max = 3) {
      const last = [...messages].reverse().find((m) => !m.isOutgoing);
      const intent = this.analyze(last?.text || "");
      return (this.templates[intent] || this.templates.default).slice(0, max);
    },
  };

  // ============================================================
  // 用户风格学习
  // ============================================================
  const StyleLearner = {
    async learn(sentText) {
      const res = await chromeGet(["userStyle", "settings"]);
      const settings = res.settings || {};
      if (settings.learnMode === false) return;

      const data = res.userStyle || { samples: [] };
      data.samples = data.samples || [];
      data.samples.push({ text: sentText, timestamp: Date.now() });
      if (data.samples.length > 200) data.samples = data.samples.slice(-200);

      this.analyze(data);
      await chromeSet({ userStyle: data });
    },

    analyze(data) {
      const texts = (data.samples || []).map((s) => s.text);
      if (texts.length === 0) return;

      const zhCount = texts.filter((t) => /[\u4e00-\u9fa5]/.test(t)).length;
      data.language = zhCount > texts.length / 2 ? "zh" : "en";
      data.avgLength = Math.round(texts.reduce((s, t) => s + t.length, 0) / texts.length);

      const formalWords = ["您","请","非常","感谢","Dear","Sincerely"];
      const casualWords = ["嗯","哈","OK","ok","yep","yeah","好啊"];
      const formalScore = texts.filter((t) => formalWords.some((w) => t.includes(w))).length;
      const casualScore = texts.filter((t) => casualWords.some((w) => t.includes(w))).length;
      data.tone = formalScore >= casualScore ? "formal" : "casual";

      const freq = {};
      texts.forEach((t) => {
        const zh = t.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
        const en = t.match(/\b[a-zA-Z]{3,}\b/g) || [];
        [...zh, ...en].forEach((w) => { freq[w] = (freq[w] || 0) + 1; });
      });
      data.commonPhrases = Object.entries(freq)
        .filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1])
        .slice(0, 20).map(([w]) => w);

      data.sampleCount = texts.length;
      data.updatedAt = Date.now();
    },
  };

  // ============================================================
  // 悬浮面板 UI
  // ============================================================
  const Panel = {
    root: null,
    sugList: null,
    badgeEl: null,

    init() {
      if (document.getElementById("mha-root")) return;
      this.buildDOM();
      this.bindEvents();
    },

    buildDOM() {
      const root = document.createElement("div");
      root.id = "mha-root";
      root.innerHTML = `
        <!-- 折叠态 -->
        <div id="mha-collapsed">
          <div class="mha-icon">💬</div>
          <span class="mha-badge" id="mha-badge" style="display:none">0</span>
        </div>

        <!-- 展开态 -->
        <div id="mha-expanded" style="display:none">
          <div class="mha-header">
            <div class="mha-title"><span>🏠</span><span>智能回复助手</span></div>
            <div class="mha-hactions">
              <button class="mha-ibtn" id="mha-refresh" title="重新生成">🔄</button>
              <button class="mha-ibtn" id="mha-collapse" title="收起">✕</button>
            </div>
          </div>

          <div class="mha-preview-box" id="mha-preview-box">
            <div class="mha-preview-lbl">最新消息</div>
            <div class="mha-preview-text" id="mha-preview-text">暂无消息</div>
            <div class="mha-preview-from" id="mha-preview-from"></div>
          </div>

          <div class="mha-sugg-wrap">
            <div class="mha-sugg-label">
              建议回复
              <span class="mha-ai-badge" id="mha-ai-badge" style="display:none">✨ AI</span>
              <span class="mha-style-badge" id="mha-style-badge" style="display:none"></span>
            </div>
            <div class="mha-loading" id="mha-loading" style="display:none">
              <span class="mha-spinner"></span> AI 正在生成建议…
            </div>
            <ul class="mha-sugg-list" id="mha-sugg-list">
              <li class="mha-sugg-empty">等待新消息…</li>
            </ul>
          </div>

          <div class="mha-footer">
            <div class="mha-input-row">
              <textarea class="mha-input" id="mha-input" rows="2" placeholder="自定义回复（Ctrl+Enter 发送）"></textarea>
              <button class="mha-btn-send" id="mha-send">发送</button>
            </div>
            <div class="mha-stats" id="mha-stats"></div>
          </div>
        </div>
      `;
      document.body.appendChild(root);

      this.root     = root;
      this.sugList  = root.querySelector("#mha-sugg-list");
      this.badgeEl  = root.querySelector("#mha-badge");
    },

    bindEvents() {
      this.root.querySelector("#mha-collapsed").addEventListener("click", () => this.expand());
      this.root.querySelector("#mha-collapse").addEventListener("click", () => this.collapse());
      this.root.querySelector("#mha-refresh").addEventListener("click", () => {
        this.requestSuggestions(state.currentMessages, true);
      });
      this.root.querySelector("#mha-send").addEventListener("click", () => {
        const v = this.root.querySelector("#mha-input").value.trim();
        if (v) { this.sendReply(v); this.root.querySelector("#mha-input").value = ""; }
      });
      this.root.querySelector("#mha-input").addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          const v = e.target.value.trim();
          if (v) { this.sendReply(v); e.target.value = ""; }
        }
      });
    },

    expand() {
      state.panelExpanded = true;
      this.root.querySelector("#mha-collapsed").style.display = "none";
      this.root.querySelector("#mha-expanded").style.display  = "flex";
      this.clearBadge();
      this.updateStats();
    },

    collapse() {
      state.panelExpanded = false;
      this.root.querySelector("#mha-collapsed").style.display = "flex";
      this.root.querySelector("#mha-expanded").style.display  = "none";
    },

    setBadge(n) {
      if (!this.badgeEl) return;
      if (n > 0) {
        this.badgeEl.textContent = n > 99 ? "99+" : String(n);
        this.badgeEl.style.display = "flex";
        this.root.classList.add("mha-shake");
        setTimeout(() => this.root.classList.remove("mha-shake"), 600);
      } else {
        this.badgeEl.style.display = "none";
      }
    },

    clearBadge() { if (this.badgeEl) this.badgeEl.style.display = "none"; },

    updatePreview(conv, messages) {
      const last = [...messages].reverse().find((m) => !m.isOutgoing);
      if (!last) return;
      const textEl = this.root.querySelector("#mha-preview-text");
      const fromEl = this.root.querySelector("#mha-preview-from");
      if (textEl) textEl.textContent = last.text.length > 80 ? last.text.slice(0, 80) + "…" : last.text;
      if (fromEl) fromEl.textContent = conv?.sender || "";
    },

    setLoading(on) {
      this.root.querySelector("#mha-loading").style.display = on ? "flex" : "none";
      this.root.querySelector("#mha-sugg-list").style.display = on ? "none" : "block";
    },

    renderSuggestions(list, fromAI = false) {
      log("🎨 renderSuggestions 被调用，list.length:", list?.length, "fromAI:", fromAI);

      const ul = this.sugList;
      ul.innerHTML = "";

      const aiBadge = this.root.querySelector("#mha-ai-badge");
      if (aiBadge) {
        if (fromAI === "kb") {
          aiBadge.textContent = "📚 知识库";
          aiBadge.style.display = "inline";
          aiBadge.title = "建议来自回复知识库";
        } else if (fromAI) {
          aiBadge.textContent = "✨ AI";
          aiBadge.style.display = "inline";
          aiBadge.title = "AI 生成建议";
        } else {
          aiBadge.style.display = "none";
        }
      }

      if (!list || list.length === 0) {
        log("⚠️ 建议列表为空");
        ul.innerHTML = '<li class="mha-sugg-empty">暂无建议</li>';
        return;
      }

      // 根据建议来源确定图标
      const sourceIcon = fromAI === "kb" ? "📚" : (fromAI ? "✨" : "");
      const sourceTitle = fromAI === "kb" ? "来自知识库规则" : (fromAI ? "AI 生成" : "");

      list.forEach((text) => {
        const li = document.createElement("li");
        li.className = "mha-sugg-item";
        // 在建议文本后添加来源图标
        li.innerHTML = `
          <span class="mha-sugg-text">${escHtml(text)}</span>
          ${sourceIcon ? `<span class="mha-sugg-source" title="${sourceTitle}">${sourceIcon}</span>` : ""}
          <button class="mha-sugg-btn" title="发送">↩ 发送</button>
        `;
        li.querySelector(".mha-sugg-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          this.sendReply(text);
        });
        li.addEventListener("click", () => {
          const inp = this.root.querySelector("#mha-input");
          if (inp) inp.value = text;
        });
        ul.appendChild(li);
      });

      log("✅ 已渲染", list.length, "条建议");
    },

    async requestSuggestions(messages, force = false) {
      log("🔍 requestSuggestions 被调用, messages:", messages?.length, "force:", force);

      // 如果没有传入消息，尝试从当前页面获取
      if (!messages || messages.length === 0) {
        log("⚠️ 没有传入消息，尝试从页面获取...");
        messages = MessageReader.getCurrentMessages();

        if (messages.length === 0) {
          log("⚠️ 页面也没有找到消息，使用默认示例消息");
          messages = [
            { text: "你好", isOutgoing: false }
          ];
        } else {
          log("✅ 从页面获取到", messages.length, "条消息");
        }
      }

      if (state.isGenerating && !force) {
        log("⏸️ 正在生成中，跳过");
        return;
      }

      log("🚀 开始生成建议，消息数量:", messages.length);
      state.isGenerating = true;
      this.setLoading(true);

      try {
        // 加载保存的配置
        const config = await ConfigManager.load();
        log("📦 已加载配置，API Key:", !!config.apiKey);

        const res = await chromeGet(["aiConfigs", "aiConfig", "rooms", "propInfo", "replyRules", "userStyle", "knowledgeBase", "maxSuggestions", "lang"]);

        let suggestions;
        let fromAI = false;

        // 优先使用新版多模型配置，兼容旧版
        const aiConfigs = res.aiConfigs || (res.aiConfig?.apiKey ? [res.aiConfig] : []);
        const aiConfig = aiConfigs[0] || res.aiConfig || {};

        log("🤖 AI Configs 数量:", aiConfigs.length, "使用第一个:", !!aiConfig.apiKey);

        if (aiConfig.apiKey) {
          try {
            log("🎨 开始调用 LLM 生成建议...");

            // 获取当前对话的房源信息
            const currentHousing = state.currentConversation?.housing || "";
            if (currentHousing) {
              log('🏠 当前对话房源:', currentHousing);
            }

            const result = await LLMClient.generate(messages, {
              aiConfigs,      // ★ 传递完整的多模型配置数组
              rooms:      res.rooms || [],
              propInfo:   res.propInfo || {},
              replyRules: res.replyRules || [],
              userStyle:  res.userStyle || {},
              maxSuggestions: res.maxSuggestions || CONFIG.maxSuggestions,
              lang:       res.lang || "auto",
              knowledgeBase: res.knowledgeBase || [],
              currentHousing,  // ★ 当前对话的房源信息
            });

            // 检查扩展上下文是否失效
            if (result.error === 'Extension context invalidated') {
              log('⚠️ 扩展上下文已失效，跳过 AI 生成');
              suggestions = FallbackEngine.getSuggestions(messages, CONFIG.maxSuggestions);
              log("📋 本地回退建议数量:", suggestions.length);
            } else {
              suggestions = result.suggestions;
              fromAI = true;
              // 如果知识库有匹配，使用 KB 徽章
              if (result.fromKB) {
                fromAI = "kb";
                log("📚 知识库匹配成功，知识库贡献", result.kbCount, "条建议");
              }
              log("✅ LLM 生成成功，建议数量:", suggestions.length);

              // 保存 AI 生成历史
              const latestMessage = messages[messages.length - 1];
              if (latestMessage && !latestMessage.isOutgoing) {
                const historyEntry = {
                  id: Date.now(),
                  timestamp: new Date().toISOString(),
                  guestMessage: latestMessage.text,
                  suggestions: suggestions,
                  used: false
                };
                const newHistory = [historyEntry, ...(config.aiHistory || [])].slice(0, 100);
                await ConfigManager.saveAIHistory(newHistory);
              }

              // 更新统计
              await ConfigManager.updateStats({ totalGenerated: 1 });
            }
          } catch (err) {
            log("❌ LLM 调用失败，使用本地回退：", err.message);
            this.showToast("⚠️ AI 生成失败，使用本地建议：" + err.message);
            suggestions = FallbackEngine.getSuggestions(messages, CONFIG.maxSuggestions);
            log("📋 本地回退建议数量:", suggestions.length);
          }
        } else {
          log("📋 无 API Key，使用本地回退");
          Panel.showToast('⚠️ 未配置 AI 模型，使用本地建议');
          suggestions = FallbackEngine.getSuggestions(messages, CONFIG.maxSuggestions);
          log("📋 本地回退建议数量:", suggestions.length);
        }

        log("🎉 准备渲染建议，数量:", suggestions.length);
        state.suggestions = suggestions;
        this.renderSuggestions(suggestions, fromAI);
        this.updateStats();
        log("✅ 建议渲染完成");
      } finally {
        this.setLoading(false);
        state.isGenerating = false;
      }
    },

    async sendReply(text) {
      if (!text) return;
      const inputBox = MessageReader.getInputBox();
      const sendBtn  = MessageReader.getSendButton();

      if (inputBox) {
        if (inputBox.tagName === "TEXTAREA" || inputBox.tagName === "INPUT") {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
          if (setter) setter.call(inputBox, text);
          else inputBox.value = text;
          inputBox.dispatchEvent(new Event("input",  { bubbles: true }));
          inputBox.dispatchEvent(new Event("change", { bubbles: true }));
        } else if (inputBox.contentEditable === "true") {
          inputBox.textContent = text;
          inputBox.dispatchEvent(new Event("input", { bubbles: true }));
        }
        inputBox.focus();
        await sleep(200);

        if (sendBtn) {
          sendBtn.click();
        } else {
          inputBox.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
        }

        this.showToast("✅ 回复已发送");
        await StyleLearner.learn(text);
        this.updateStats();

        // 更新统计：记录发送的回复
        await ConfigManager.updateStats({ totalSent: 1, totalReplies: 1 });

        // 标记 AI 历史中对应的建议为"已使用"
        const config = await ConfigManager.load();
        if (config.aiHistory && config.aiHistory.length > 0) {
          // 查找匹配的建议
          const history = config.aiHistory.map(entry => ({
            ...entry,
            used: entry.used || entry.suggestions.includes(text)
          }));
          await ConfigManager.saveAIHistory(history);
        }
      } else {
        await navigator.clipboard.writeText(text).catch(() => {});
        this.showToast("📋 未找到输入框，已复制到剪贴板");
      }
    },

    async updateStats() {
      const res = await chromeGet(["userStyle", "aiConfigs", "aiConfig"]);
      const style    = res.userStyle || {};
      const aiConfig = (res.aiConfigs && res.aiConfigs[0]) || res.aiConfig || {};
      const statsEl  = this.root.querySelector("#mha-stats");
      const styleBadge = this.root.querySelector("#mha-style-badge");

      if (statsEl) {
        const parts = [];
        if (aiConfig.apiKey) parts.push(`🤖 ${aiConfig.model || aiConfig.name || "AI"}`);
        if (style.sampleCount >= 5) parts.push(`📚 已学 ${style.sampleCount} 条`);
        if (style.tone) parts.push(style.tone === "formal" ? "🎩 正式" : "😊 轻松");
        statsEl.textContent = parts.join("  ·  ");
      }

      if (styleBadge) {
        if (style.sampleCount >= 5) {
          styleBadge.textContent = `🤖 进化中 (${style.sampleCount})`;
          styleBadge.style.display = "inline";
        } else {
          styleBadge.style.display = "none";
        }
      }
    },

    showToast(msg, type = "ok") {
      const el = document.createElement("div");
      el.className = "mha-toast" + (type !== "ok" ? " mha-toast-warn" : "");
      el.textContent = msg;
      document.body.appendChild(el);
      requestAnimationFrame(() => el.classList.add("show"));
      setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 2800);
    },
  };

  // ============================================================
  // 消息监控
  // ============================================================
  const Monitor = {
    knownIds: new Set(),

    start() {
      this.tick();
      state.checkTimer = setInterval(() => this.tick(), CONFIG.checkInterval);
      this.watchRoute();
    },

    async tick() {
      try {
        const convs = MessageReader.getConversationList();
        const unread = convs.filter((c) => c.hasUnread);

        // 调试：记录所有对话和未读状态
        if (convs.length > 0) {
          log("📋 当前对话数:", convs.length, "未读数:", unread.length);
          log("📋 所有对话ID:", convs.map(c => c.id));
          log("📋 未读对话:", unread.map(c => ({id: c.id, sender: c.sender, hasUnread: c.hasUnread})));
          log("📋 已知ID:", Array.from(this.knownIds));
        }

        if (unread.length > 0) {
          Panel.setBadge(unread.length);

          const newConvs = unread.filter((c) => c.id && !this.knownIds.has(c.id));
          log("🔍 新对话数量:", newConvs.length);
          log("🔍 新对话:", newConvs.map(c => ({id: c.id, sender: c.sender, preview: c.preview})));

          if (newConvs.length > 0) {
            newConvs.forEach((c) => c.id && this.knownIds.add(c.id));

            const conv = newConvs[0];
            state.currentConversation = conv;

            // 检查发件人是否为自动化工具或客服
            const isAutoTool = conv.sender && (
              conv.sender.toString().startsWith('15088670554') ||
              conv.sender.toString().includes('自动化工具：') ||
              conv.sender.toString().includes('客服') ||
              conv.sender.toString().includes('系统') ||
              conv.sender.toString().includes('Hostex') ||
              conv.sender.toString().includes('Admin')
            );

            if (isAutoTool) {
              log(`⏭️ Monitor跳过自动化工具消息（发件人：${conv.sender}），不生成建议回复`);
              // 仍然展开面板但不生成建议
              const res = await chromeGet(["settings"]);
              if ((res.settings?.autoExpand !== false) && !state.panelExpanded) {
                Panel.expand();
              }
              return;
            }

            const msgs = MessageReader.getCurrentMessages();
            log("📩 获取到的消息数:", msgs.length);

            const effectiveMsgs = msgs.length > 0
              ? msgs
              : [{ text: conv.preview, isOutgoing: false }];

            state.currentMessages = effectiveMsgs;

            Panel.updatePreview(conv, effectiveMsgs);

            // 自动展开
            const res = await chromeGet(["settings"]);
            if ((res.settings?.autoExpand !== false) && !state.panelExpanded) {
              Panel.expand();
            }

            // 生成 AI 建议
            log("📨 检测到新消息，准备生成建议，消息数量:", effectiveMsgs.length);
            log("📨 最新消息:", effectiveMsgs[effectiveMsgs.length - 1]);
            await Panel.requestSuggestions(effectiveMsgs);

            // 桌面通知
            this.notify(conv);
          } else {
            log("⚠️ 有未读消息但都是已知的，跳过");
          }
        } else {
          Panel.setBadge(0);
          this.knownIds.clear();
        }

        // 面板展开时持续更新
        if (state.panelExpanded) {
          const msgs = MessageReader.getCurrentMessages();
          if (msgs.length !== state.currentMessages.length) {
            state.currentMessages = msgs;
            Panel.updatePreview(state.currentConversation, msgs);
          }
        }
      } catch (e) {
        log("监控错误:", e);
      }
    },

    notify(conv) {
      if (Notification.permission === "granted") {
        new Notification("📬 MyHostex 新消息", {
          body: `${conv.sender}：${conv.preview.substring(0, 60)}`,
          icon: chrome.runtime.getURL("icons/icon48.png"),
          tag: "myhostex-msg",
        });
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission();
      }
    },

    watchRoute() {
      let last = location.href;
      new MutationObserver(() => {
        if (location.href !== last) {
          last = location.href;
          setTimeout(() => this.tick(), 1200);
        }
      }).observe(document.body, { childList: true, subtree: true });
    },
  };

  // ============================================================
  // 配置管理（自动保存和加载）
  // ============================================================
  const ConfigManager = {
    // 默认配置
    defaultConfig: {
      apiKey: '',
      model: 'deepseek-chat',
      temperature: 0.9,  // 提高温度，让回复更自然、更有变化
      maxTokens: 200,  // 减少最大长度，保持简洁
      systemPrompt: `你是一位经验丰富的民宿房东，擅长用自然、友好的方式与客人沟通。

重要原则：
1. 回复要自然、简洁，就像日常聊天一样，避免过于正式或客套
2. 直接回答问题，不需要太多寒暄
3. 语气要友好但不过于热情，保持专业的同时接地气
4. 根据消息内容生成 3-5 条不同风格的建议回复

回复风格示例：
- 客人说"你好" → "你好，有什么可以帮助您的？" 或 "您好，请问有什么需要吗？"
- 客人说"房间还有吗" → "有空的，请问您要住哪几天？" 或 "有的，您打算什么时候入住？"
- 客人说"多少钱" → "一天200元，您要住几天？" 或 "200一晚，住几天可以给您优惠"

避免：
- 过于正式的称呼（如"尊敬的客人"）
- 冗长的客套话
- 机械化的模板回复
- 过于热情的语气（如"非常感谢您的到来！"）`,
      aiHistory: [], // AI 对话历史
      userStyle: null, // 用户风格学习
      stats: {
        totalGenerated: 0,
        totalSent: 0,
        totalReplies: 0
      },
      version: '1.0'
    },

    // 加载配置
    async load() {
      try {
        // 优先从 mha_config 读取，如果没有则从 aiConfig 读取
        const stored = await chromeGet(['mha_config', 'aiConfig']);
        const mhaConfig = stored.mha_config || {};
        const aiConfig = stored.aiConfig || {};

        // 合并配置，mha_config 优先
        if (mhaConfig.apiKey) {
          log('📦 已从 mha_config 加载配置');
          return { ...this.defaultConfig, ...mhaConfig };
        } else if (aiConfig.apiKey) {
          log('📦 已从 aiConfig 加载配置');
          return {
            ...this.defaultConfig,
            apiKey: aiConfig.apiKey,
            model: aiConfig.model,
            temperature: aiConfig.temperature || this.defaultConfig.temperature,
            maxTokens: aiConfig.maxTokens || this.defaultConfig.maxTokens,
            maxSuggestions: aiConfig.maxSuggestions || this.defaultConfig.maxSuggestions,
          };
        }
      } catch (e) {
        log('⚠️ 加载配置失败:', e);
      }
      return { ...this.defaultConfig };
    },

    // 保存配置
    async save(config) {
      try {
        await chromeSet({ mha_config: config });
        log('💾 配置已保存');
      } catch (e) {
        log('❌ 保存配置失败:', e);
      }
    },

    // 保存 AI 历史记录
    async saveAIHistory(history) {
      try {
        const current = await this.load();
        current.aiHistory = history || [];
        // 限制历史记录数量，最多保留 100 条
        if (current.aiHistory.length > 100) {
          current.aiHistory = current.aiHistory.slice(-100);
        }
        await this.save(current);
        log('📝 AI 历史记录已保存');
      } catch (e) {
        log('❌ 保存 AI 历史记录失败:', e);
      }
    },

    // 更新统计数据
    async updateStats(stats) {
      try {
        const current = await this.load();
        if (stats.totalGenerated !== undefined) current.stats.totalGenerated += stats.totalGenerated;
        if (stats.totalSent !== undefined) current.stats.totalSent += stats.totalSent;
        if (stats.totalReplies !== undefined) current.stats.totalReplies += stats.totalReplies;
        await this.save(current);
      } catch (e) {
        log('❌ 更新统计数据失败:', e);
      }
    },

    // 重置配置
    async reset() {
      try {
        await chromeSet({ mha_config: this.defaultConfig });
        log('🔄 配置已重置');
        return this.defaultConfig;
      } catch (e) {
        log('❌ 重置配置失败:', e);
        return this.defaultConfig;
      }
    }
  };

  // ============================================================
  // 工具函数
  // ============================================================
  function chromeGet(keys) {
    return new Promise((res) => chrome.storage.local.get(keys, res));
  }
  function chromeSet(obj) {
    return new Promise((res) => chrome.storage.local.set(obj, res));
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function escHtml(s) {
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  // ============================================================
  // 初始化
  // ============================================================

  // ⚡ WebSocket 注入必须立即执行（不等 DOM），在页面最早期抢占
  WebSocketMonitor.init();

  async function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
      return;
    }
    log("初始化 v3 (配置持久化版)...");

    // 加载保存的配置
    try {
      const config = await ConfigManager.load();
      log("📦 已加载配置:", {
        hasApiKey: !!config.apiKey,
        model: config.model,
        historyCount: config.aiHistory?.length || 0,
        stats: config.stats
      });

      // 如果有保存的 AI 配置，自动设置到 chrome.storage
      if (config.apiKey) {
        const aiConfig = {
          apiKey: config.apiKey,
          model: config.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          maxSuggestions: 5
        };
        await chromeSet({ aiConfig });
        log("✅ AI 配置已从保存的配置中加载");
      }
    } catch (e) {
      log("⚠️ 加载配置失败，使用默认配置:", e);
    }

    // WebSocket 监听器已在最顶部提前初始化
    Panel.init();
    Panel.updateStats();
    Monitor.start();
  }

  init();
})();
