---
name: chrome-extension-reload
description: 通过 Chrome DevTools Protocol 远程控制当前已运行的 Chrome 浏览器，自动移除并重新加载 myhostex 扩展。Use when user says "重装扩展", "刷新扩展到 Chrome", "重载 Chrome 扩展", "reload extension to chrome", or after any code change to extension files.
origin: project
tools: Bash, Read, Glob
---

# Chrome 扩展重装 Skill

此 skill 通过 **Chrome DevTools Protocol (CDP)** 直接操作您当前已打开的 Chrome 窗口（不重启浏览器、不破坏当前浏览会话），自动完成"移除旧扩展 + 加载新版本"。

## 何时使用

- 修改了任何扩展源文件（manifest / popup / background / content）后想让 Chrome 立刻看到
- 缓存了旧代码，扩展 UI 看不到新功能时
- 切换了 git 分支想验证另一个版本的扩展

## 一次设置

**仅需设置一次**：让 Chrome 以远程调试模式运行。

```powershell
# 关闭当前所有 Chrome
taskkill /F /IM chrome.exe

# 用远程调试模式启动
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  -ArgumentList "--remote-debugging-port=9222","--no-first-run"
```

或更简单：把 `start-debug-chrome.ps1` 脚本放在桌面，右键 → "用 PowerShell 运行"。

## 🛡️ 数据安全保证（重要！）

**`chrome.storage.local` 数据与扩展路径绑定，路径不变则数据 100% 保留**。

| 操作 | 扩展 ID | 数据保留？ |
|---|---|---|
| 点扩展的 ⟳ 刷新按钮 | 不变 | ✅ **完整保留** |
| `移除` + `加载已解压` (同一路径) | 不变 | ✅ **完整保留** |
| `移除` + `加载已解压` (不同路径) | **变了** | ❌ **数据丢失** |
| `移除` 后不加载 | — | ❌ 数据保留 60 天再清理 |

**因此本 skill 严格执行**：

1. **绝对路径恒定**：始终使用 `D:\workspace\workbuddy\myhostex-assistant`（用户工作目录）
2. **路径不变则 ID 不变**：脚本启动时打印预期 ID（`ockaagpclgjepmpneeememigdedfmmgf`），与移除前对比
3. **ID 不匹配时熔断**：如果发现"重装后 ID 不同"，立即停止并提示用户备份
4. **执行前自动备份**（兜底）：脚本先在 `.claude/skills/chrome-extension-reload/backups/` 写占位文件，建议用户在 popup 导出覆盖
5. **执行后自动校验**：用 CDP 读取 `chrome://extensions/`，确认版本号 `v3.13.5` 显示

### 备份文件

`.claude/skills/chrome-extension-reload/backups/reload-backup-<时间戳>.json`

占位文件自动生成，建议重装前在扩展 popup「同步」Tab → 「📤 导出」覆盖此文件，内容包含：
- 知识库（knowledgeBase / replyRules）
- AI 配置（aiConfigs）
- 房间、房源信息
- 风格、设置
- 同步认证信息

恢复方法：在扩展 popup「同步」Tab → 「📥 导入」选此文件。

## 工作原理

1. 脚本通过 `http://localhost:9222/json/version` 拿到当前 Chrome 的 WebSocket 调试地址
2. 用 CDP `Page.navigate` 打开 `chrome://extensions/`
3. 读取已加载的扩展 ID，与预期对比（**关键**）
4. `Page.enable` + `Runtime.evaluate` 注入 JS：
   - 找到现有 MyHostex 扩展卡片，点 "移除" 按钮
   - 在 "加载已解压的扩展程序" 处填好路径
5. 用户在原生文件选择器点"打开"
6. 自动验证：解析 `chrome://extensions/`，确认 `v3.13.5` 显示

## 用法

在 Claude 对话框说"重装扩展"或"reload extension to chrome"，Claude 会自动：

1. 检查 Chrome 调试端口 9222 是否已开
2. 预期扩展 ID 与已安装 ID 对比，**不一致则告警**
3. 备份当前数据到 `output/reload-backup-*.json`
4. 运行 `node .claude/skills/chrome-extension-reload/reload-extension.js`
5. 报告重装结果（成功 / 失败原因）

## 风险

- 远程调试端口 9222 暴露在 localhost，**仅开发机使用**，**不要在生产环境开**
- 一次只能重装**一个**指定扩展（myhostex），不会误删其他扩展
- 如果您想"换路径装"（比如改用打包后的 .crx），会触发新 ID，本 skill 主动拒绝，请手动操作

## 已知限制

- 必须先关掉所有 Chrome 实例再以 `--remote-debugging-port=9222` 启动（Windows Chrome 实例之间互斥）
- 打开的"加载已解压的扩展程序"对话框需要用户**手动选择扩展文件夹**（CDP 没法直接驱动原生文件选择器）。脚本会**自动填好路径**到输入框，您只需点"选择"即可

## 文件清单

- `reload-extension.js` — 核心脚本（Node.js，仅需 `ws` 模块）
- `start-debug-chrome.ps1` — 一次性设置脚本
- `SKILL.md` — 本文件
