# Windows PowerShell 5.1 or PowerShell 7. Run once with network access for npm.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$portableDir = Join-Path $PSScriptRoot 'runtime\node'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$usePortable = Test-Path (Join-Path $portableDir 'node.exe')
if (-not $usePortable -and $nodeCommand) {
    $systemMajor = [int]((& $nodeCommand.Source --version).TrimStart('v').Split('.')[0])
    $usePortable = $systemMajor -lt 24
} elseif (-not $nodeCommand) { $usePortable = $true }
if ($usePortable) {
    & (Join-Path $PSScriptRoot 'Install-Node.ps1')
    $env:Path = "$portableDir;$env:Path"
}
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
$npmExe = (Get-Command npm.cmd -ErrorAction Stop).Source
Push-Location (Join-Path $repoRoot 'slides')
try {
    & $npmExe ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    & $npmExe run build:single
    if ($LASTEXITCODE -ne 0) { throw 'Single-file build failed' }
} finally { Pop-Location }
Write-Host 'Ready. Copy config.example.ps1 to config.local.ps1, edit it, then run Start.ps1.'
