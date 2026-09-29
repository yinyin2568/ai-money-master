param(
  [string]$OutputRoot = ""
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$outputPath = if ($OutputRoot) { [System.IO.Path]::GetFullPath($OutputRoot) } else { Join-Path $projectRoot "release\cli" }
$distElectron = Join-Path $projectRoot "dist-electron"
$outputRootPath = [System.IO.Path]::GetPathRoot($outputPath)
$userHomePath = [Environment]::GetFolderPath("UserProfile")

if ($outputPath -in @($outputRootPath, $projectRoot.Path, $userHomePath)) {
  throw "拒绝清理不安全的 CLI 输出目录：$outputPath"
}

if (-not (Test-Path -LiteralPath $distElectron)) {
  throw "dist-electron 不存在，请先运行 npm run electron:compile"
}

if (Test-Path -LiteralPath $outputPath) {
  Remove-Item -LiteralPath $outputPath -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $outputPath "dist-electron") | Out-Null

Copy-Item -LiteralPath (Join-Path $distElectron "electron") -Destination (Join-Path $outputPath "dist-electron") -Recurse -Force
Copy-Item -LiteralPath (Join-Path $distElectron "src") -Destination (Join-Path $outputPath "dist-electron") -Recurse -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "package.json") -Destination (Join-Path $outputPath "package.json") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "package-lock.json") -Destination (Join-Path $outputPath "package-lock.json") -Force

$cmdPath = Join-Path $outputPath "skills-manager.cmd"
@"
@echo off
node "%~dp0dist-electron\electron\cli.js" %*
"@ | Set-Content -LiteralPath $cmdPath -Encoding ASCII

Write-Host ("CLI release path: {0}" -f $outputPath)
