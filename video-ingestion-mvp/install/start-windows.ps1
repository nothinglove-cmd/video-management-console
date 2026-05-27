$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$RuntimeDir = Join-Path $ProjectRoot ".runtime"
$NodeDir = Join-Path $RuntimeDir "node"
$RuntimeBin = Join-Path $RuntimeDir "bin"
$NpmCmd = Join-Path $NodeDir "npm.cmd"
$NextCmd = Join-Path $ProjectRoot "node_modules\.bin\next.cmd"
$Url = "http://localhost:8888/admin"

if (!(Test-Path $NpmCmd)) {
  Write-Host "还没有完成安装。请先运行“安装-windows.bat”。" -ForegroundColor Red
  exit 1
}

if (!(Test-Path (Join-Path $ProjectRoot ".env"))) {
  Write-Host "没有找到 .env 配置文件。请先运行安装程序。" -ForegroundColor Red
  exit 1
}

if (!(Test-Path $NextCmd)) {
  Write-Host "没有找到 Next.js 启动文件。请重新运行安装程序。" -ForegroundColor Red
  exit 1
}

$env:PATH = "$RuntimeBin;$NodeDir;$env:PATH"
$env:PORT = "8888"
Set-Location $ProjectRoot

Start-Job -ScriptBlock {
  Start-Sleep -Seconds 5
  Start-Process "http://localhost:8888/admin"
} | Out-Null

Write-Host "系统启动中，请保持这个窗口打开。"
Write-Host "后台地址：http://localhost:8888/admin"
Write-Host ""

& $NextCmd start -H 0.0.0.0 -p 8888
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
