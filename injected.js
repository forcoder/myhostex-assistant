/**
 * MyHostex 智能回复助手 - Injected Script
 * 此文件通过 <script> 标签注入到页面，运行在页面真实的 JS 上下文中
 * 可以直接访问和拦截 window.WebSocket
 */
(function () {
  'use strict';

  const PREFIX = '[MHA-Injected]';

  // 保存原始 WebSocket
  const OriginalWebSocket = window.WebSocket;

  if (!OriginalWebSocket) {
    console.warn(PREFIX, 'WebSocket 不可用，无法拦截');
    return;
  }

  console.log(PREFIX, '✅ 开始拦截 WebSocket...');

  // 新建一个 WebSocket 构造函数包装器
  function InterceptedWebSocket(url, protocols) {
    let ws;
    if (protocols !== undefined) {
      ws = new OriginalWebSocket(url, protocols);
    } else {
      ws = new OriginalWebSocket(url);
    }

    console.log(PREFIX, '🔗 WebSocket 连接建立:', url);

    // 拦截所有收到的消息
    ws.addEventListener('message', function (event) {
      try {
        const raw = event.data;

        // 发送给 content script（通过 CustomEvent）
        window.dispatchEvent(new CustomEvent('__mha_ws_message__', {
          detail: {
            url: url,
            data: typeof raw === 'string' ? raw : '__BINARY__',
            timestamp: Date.now()
          }
        }));

        // 如果是 Blob，转成字符串再发
        if (raw instanceof Blob) {
          raw.text().then(function (text) {
            window.dispatchEvent(new CustomEvent('__mha_ws_message__', {
              detail: { url: url, data: text, timestamp: Date.now() }
            }));
          });
        }
      } catch (e) {
        console.warn(PREFIX, '消息转发失败:', e);
      }
    });

    // 拦截 send，用于调试
    const originalSend = ws.send.bind(ws);
    ws.send = function (data) {
      try {
        const preview = typeof data === 'string' ? data.slice(0, 200) : '[Binary/ArrayBuffer]';
        console.log(PREFIX, '📤 发送:', preview);
        window.dispatchEvent(new CustomEvent('__mha_ws_send__', {
          detail: { url: url, data: typeof data === 'string' ? data : '__BINARY__' }
        }));
      } catch (e) {}
      return originalSend(data);
    };

    return ws;
  }

  // 复制原型和静态属性
  InterceptedWebSocket.prototype = OriginalWebSocket.prototype;
  InterceptedWebSocket.CONNECTING = OriginalWebSocket.CONNECTING || 0;
  InterceptedWebSocket.OPEN = OriginalWebSocket.OPEN || 1;
  InterceptedWebSocket.CLOSING = OriginalWebSocket.CLOSING || 2;
  InterceptedWebSocket.CLOSED = OriginalWebSocket.CLOSED || 3;

  // 替换全局 WebSocket
  window.WebSocket = InterceptedWebSocket;

  console.log(PREFIX, '✅ WebSocket 拦截已激活');

  // 通知 content script 注入成功
  window.dispatchEvent(new CustomEvent('__mha_injected__', {
    detail: { timestamp: Date.now() }
  }));

})();
