# Chrome 远程调试启动脚本（一次性设置）
#
# 用法：右键本文件 → "使用 PowerShell 运行"
# 效果：关闭所有 Chrome，再用 --remote-debugging-port=9222 启动
#       之后 Claude 可以通过 CDP 自动重装扩展
#
# 🛡️ 数据安全提示：
#   关闭 Chrome 不会丢失扩展数据。chrome.storage.local 数据存在 user-data-dir 中，
#   只要路径不变（默认 D:\workspace\workbuddy\myhostex-assistant），重装后数据完整保留。

# 1. 关闭所有 Chrome
Write-Host "[setup] 关闭所有 Chrome..." -ForegroundColor Yellow
Get-Process chrome -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  - 终止 PID $($_.Id)"
    Stop-Process -Id $_.Id -Force
}
Start-Sleep -Seconds 2

# 2. 启动带远程调试的 Chrome
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chromePath)) {
    Write-Host "[setup] ❌ 找不到 Chrome: $chromePath" -ForegroundColor Red
    exit 1
}

Write-Host "[setup] 启动 Chrome (远程调试端口 9222)..." -ForegroundColor Green
$args = @(
    "--remote-debugging-port=9222",
    "--no-first-run",
    "--no-default-browser-check"
)
Start-Process -FilePath $chromePath -ArgumentList $args

# 3. 等 3 秒并验证
Start-Sleep -Seconds 3
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:9222/json/version" -UseBasicParsing -TimeoutSec 5
    $info = $resp.Content | ConvertFrom-Json
    Write-Host "[setup] ✅ Chrome 远程调试已就绪: $($info.Browser)" -ForegroundColor Green
} catch {
    Write-Host "[setup] ⚠️  Chrome 启动了但调试端口未响应。请重试。" -ForegroundColor Yellow
}
