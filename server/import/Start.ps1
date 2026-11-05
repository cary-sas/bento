[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$localConfig = Join-Path $PSScriptRoot 'config.local.ps1'
if (Test-Path $localConfig) { . $localConfig }
$portableDir = Join-Path $PSScriptRoot 'runtime\node'
if (Test-Path (Join-Path $portableDir 'node.exe')) { $env:Path = "$portableDir;$env:Path" }
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
$logDir = Join-Path $PSScriptRoot 'data\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Write-Host 'Starting bento/import. Logs: ' $logDir
# Calling Node directly keeps Ctrl+C and scheduled-task termination working.
# Separate files avoid PowerShell 5.1 treating native stderr as a terminating error.
$ErrorActionPreference = 'Continue'
& $nodeExe (Join-Path $PSScriptRoot 'server.mjs') 1>> (Join-Path $logDir 'stdout.log') 2>> (Join-Path $logDir 'stderr.log')
exit $LASTEXITCODE
