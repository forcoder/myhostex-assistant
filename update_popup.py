import re

# 读取原文件
with open('popup.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 新的 AI 配置部分（Tab）
new_ai_tab = '''<!-- ══════════ TAB: AI 配置 ══════════ -->
<div class="tab-panel active" id="tab-ai">

  <!-- 多模型列表 -->
  <div class="section">
    <div class="section-title">🔌 大模型配置（支持多个，优先使用默认）</div>
    <div id="ai-configs-list"></div>
    <button class="btn btn-secondary btn-full" id="btn-add-ai-config" style="margin-top:10px">
      ➕ 添加模型配置
    </button>
  </div>

  <!-- 生成参数 -->
  <div class="section">
    <div class="section-title">⚙️ 生成参数</div>
    <div class="form-group">
      <label>最多建议条数</label>
      <select id="ai-max-suggestions">
        <option value="3">3 条</option>
        <option value="4">4 条</option>
        <option value="5" selected>5 条</option>
      </select>
    </div>
    <div class="form-group">
      <label>回复语言偏好</label>
      <select id="ai-lang">
        <option value="auto">自动（跟随客人语言）</option>
        <option value="zh">中文</option>
        <option value="en">英文</option>
        <option value="bilingual">中英双语</option>
      </select>
    </div>
  </div>

  <div id="status-msg"></div>
</div>'''

# 新的 AI 配置 Modal（添加到 </script> 标签之前）
ai_config_modal = '''<!-- 模型配置编辑/添加 Modal -->
<div class="modal-overlay" id="ai-config-modal">
  <div class="modal" style="width:360px">
    <h3 id="ai-modal-title">添加模型配置</h3>
    <div class="form-group">
      <label>配置名称 <span class="label-hint">（用于识别，如：GPT-4 主模型）</span></label>
      <input type="text" id="ai-config-name" placeholder="GPT-4" maxlength="30" />
    </div>

    <div class="form-group">
      <label>模型提供商</label>
      <select id="ai-provider">
        <option value="openai">OpenAI (GPT-4o / GPT-4)</option>
        <option value="deepseek">DeepSeek</option>
        <option value="qwen">通义千问 (Qwen)</option>
        <option value="zhipu">智谱 GLM</option>
        <option value="custom">自定义 API（兼容 OpenAI 格式）</option>
      </select>
    </div>

    <div class="form-group" id="group-base-url" style="display:none">
      <label>API Base URL</label>
      <input type="url" id="ai-base-url" placeholder="https://api.example.com/v1" />
    </div>

    <div class="form-group">
      <label>API Key</label>
      <div class="input-row">
        <input type="password" id="ai-api-key" placeholder="sk-..." autocomplete="off" />
        <button class="btn-test" id="btn-test-api-in-modal">测试连接</button>
      </div>
      <div class="api-status">
        <div class="status-dot" id="api-dot-modal"></div>
        <span id="api-status-text-modal">未配置</span>
      </div>
    </div>

    <div class="form-group">
      <label>模型名称 <span class="label-hint">（留空使用默认）</span></label>
      <input type="text" id="ai-model" placeholder="gpt-4o" />
    </div>

    <div class="form-group">
      <label>
        <input type="checkbox" id="ai-config-default" /> 设为默认模型
      </label>
    </div>

    <div class="btn-row">
      <button class="btn btn-secondary" data-close="ai-config-modal">取消</button>
      <button class="btn btn-primary" id="btn-save-ai-config">保存</button>
    </div>
  </div>
</div>'''

# 更新 subtitle（版本号）
html = re.sub(
    r'<div class="subtitle">.*?</div>',
    '<div class="subtitle">MyHostex · AI 驱动 · 多模型自动降级 · v3.4.0</div>',
    html
)

# 替换 AI 配置 Tab
html = re.sub(
    r'<!-- ══════════ TAB: AI 配置 ══════════ --></div>',
    new_ai_tab,
    html,
    flags=re.DOTALL
)

# 在 script 标签前添加 Modal
html = re.sub(
    r'(<script src="popup\.js"></script>)',
    ai_config_modal + '\n' + r'\1',
    html
)

# 写入新文件
with open('popup.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("popup.html 更新完成")
