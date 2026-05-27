$ErrorActionPreference = "Stop"

$NodeMajor = if ($env:VIDEO_INSTALL_NODE_MAJOR) { $env:VIDEO_INSTALL_NODE_MAJOR } else { "22" }
$NodeVersion = if ($env:VIDEO_INSTALL_NODE_VERSION) { $env:VIDEO_INSTALL_NODE_VERSION } else { "" }
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$RuntimeDir = Join-Path $ProjectRoot ".runtime"
$NodeDir = Join-Path $RuntimeDir "node"
$DownloadDir = Join-Path $RuntimeDir "downloads"

function Write-Step($Message) {
  Write-Host ""
  Write-Host "== $Message =="
}

function Fail($Message) {
  Write-Host ""
  Write-Host "安装失败：$Message" -ForegroundColor Red
  exit 1
}

function Get-NodePlatform {
  $arch = $env:PROCESSOR_ARCHITECTURE
  if ($env:PROCESSOR_ARCHITEW6432) {
    $arch = $env:PROCESSOR_ARCHITEW6432
  }

  switch ($arch.ToUpperInvariant()) {
    "AMD64" { return "win-x64" }
    "ARM64" { return "win-arm64" }
    default { Fail "暂不支持当前 CPU 架构：$arch" }
  }
}

function Resolve-NodeVersion($Platform) {
  if ($NodeVersion) {
    return $NodeVersion
  }

  $ShasumsUrl = "https://nodejs.org/dist/latest-v$NodeMajor.x/SHASUMS256.txt"
  $ShasumsPath = Join-Path $DownloadDir "node-latest-v$NodeMajor.x-SHASUMS256.txt"

  try {
    Invoke-WebRequest -Uri $ShasumsUrl -OutFile $ShasumsPath -UseBasicParsing
  } catch {
    Fail "无法读取 Node.js 最新版本信息：$ShasumsUrl"
  }

  $Pattern = "node-v([^\s-]+)-$([regex]::Escape($Platform))\.zip"
  foreach ($Line in Get-Content $ShasumsPath) {
    if ($Line -match $Pattern) {
      return $Matches[1]
    }
  }

  Fail "没有找到适合 $Platform 的 Node.js $NodeMajor 最新安装包。"
}

function Install-NodeRuntime {
  $NodeExe = Join-Path $NodeDir "node.exe"
  if (Test-Path $NodeExe) {
    & $NodeExe -v
    return
  }

  $Platform = Get-NodePlatform
  New-Item -ItemType Directory -Force -Path $DownloadDir | Out-Null
  $ResolvedVersion = Resolve-NodeVersion $Platform
  $ArchiveName = "node-v$ResolvedVersion-$Platform.zip"
  $ArchiveUrl = "https://nodejs.org/dist/v$ResolvedVersion/$ArchiveName"
  $ArchivePath = Join-Path $DownloadDir $ArchiveName
  $ExtractDir = Join-Path $DownloadDir "node-extract"
  $ExtractedNodeDir = Join-Path $ExtractDir "node-v$ResolvedVersion-$Platform"

  Write-Step "下载项目专用 Node.js"
  if (Test-Path $ExtractDir) { Remove-Item -Recurse -Force $ExtractDir }

  try {
    Invoke-WebRequest -Uri $ArchiveUrl -OutFile $ArchivePath -UseBasicParsing
  } catch {
    Fail "Node.js 下载失败：$ArchiveUrl"
  }

  Write-Step "解压 Node.js"
  New-Item -ItemType Directory -Force -Path $ExtractDir | Out-Null
  Expand-Archive -Path $ArchivePath -DestinationPath $ExtractDir -Force
  if (Test-Path $NodeDir) { Remove-Item -Recurse -Force $NodeDir }
  Move-Item -Path $ExtractedNodeDir -Destination $NodeDir
}

Write-Step "准备安装环境"
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
Install-NodeRuntime

Write-Step "启动安装向导"
$NodeExe = Join-Path $NodeDir "node.exe"
& $NodeExe (Join-Path $ProjectRoot "install\runtime-installer.js")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
