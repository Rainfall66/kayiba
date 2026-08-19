# ============================================================
# 卡一把 · 一键同步到 GitHub(推送到 https://github.com/Rainfall66/kayiba)
# 用法:
#   .\同步到GitHub.ps1                      # 自动提交并推送
#   .\同步到GitHub.ps1 "手机端优化"          # 自定义提交说明
# ============================================================
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# 找 git(用户终端里一般已在 PATH;找不到就用默认安装位置)
$git = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $git) { $git = 'C:\Program Files\Git\cmd\git.exe' }
if (-not (Test-Path $git)) { Write-Host '未找到 git,请先安装 Git for Windows'; exit 1 }

# 提交说明:优先用传入参数,否则用时间戳
$message = if ($args.Count -gt 0 -and $args[0]) { $args[0] } else { "更新 $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }

# 首次使用自动初始化(建仓 / 配远程 / 设作者)
if (-not (Test-Path "$PSScriptRoot\.git")) {
  & $git init -b main
  & $git remote add origin https://github.com/Rainfall66/kayiba.git
}
if (-not (& $git config user.name)) { & $git config user.name 'Rainfall66' }
if (-not (& $git config user.email)) { & $git config user.email 'Rainfall66@users.noreply.github.com' }

& $git add -A
$changes = & $git status --porcelain
if (-not $changes) { Write-Host '没有需要同步的更改 ✓'; exit 0 }

& $git commit -m $message
& $git push origin main
if ($LASTEXITCODE -ne 0) { Write-Host '推送失败,请检查网络/登录状态'; exit 1 }
Write-Host "已同步到 GitHub ✓ 提交: $message"
