import re

# 读取原文件
with open('popup.js', 'r', encoding='utf-8') as f:
    js = f.read()

# 读取新的 AI 配置代码
with open('popup_ai_config.js', 'r', encoding='utf-8') as f:
    new_ai_code = f.read()

# 替换 AI 配置部分（从 "══════ TAB: AI 配置" 到 "════════ TAB: 房间信息"）
pattern = r'// ═════════════════════════════════════════════\n// TAB: AI 配置.*?(?=\n// ═════════════════════════════════════════════\n// TAB: 房间信息)'
js = re.sub(pattern, new_ai_code, js, flags=re.DOTALL)

# 写入新文件
with open('popup.js', 'w', encoding='utf-8') as f:
    f.write(js)

print("popup.js 更新完成")
