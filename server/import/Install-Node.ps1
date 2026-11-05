# Download the portable Node.js 24 runtime from the official distribution.
# No administrator rights, MSI installer, system PATH change or reboot needed.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$platformArch = $env:PROCESSOR_ARCHITECTURE
if ($env:PROCESSOR_ARCHITEW6432) { $platformArch = $env:PROCESSOR_ARCHITEW6432 }
$arch = switch ($platformArch) { 'AMD64' { 'x64' } 'ARM64' { 'arm64' } default { throw '64-bit Windows (x64 or ARM64) is required.' } }
$destination = Join-Path $PSScriptRoot 'runtime\node'
if (Test-Path (Join-Path $destination 'node.exe')) {
    $existing = & (Join-Path $destination 'node.exe') --version
    if ($LASTEXITCODE -eq 0 -and $existing -match '^v24\.') { Write-Host "Portable Node.js already available: $existing"; return }
    throw "An unexpected runtime exists at $destination. Move it aside before installing Node.js 24."
}
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$baseUrl = 'https://nodejs.org/dist/latest-v24.x/'
$manifest = (Invoke-WebRequest -UseBasicParsing -Uri ($baseUrl + 'SHASUMS256.txt')).Content
$pattern = '(?m)^([a-fA-F0-9]{64})\s+\*?(node-v24\.\d+\.\d+-win-' + $arch + '\.zip)\s*$'
$match = [regex]::Match($manifest, $pattern)
if (-not $match.Success) { throw 'Official Node.js checksum manifest has no matching Windows archive.' }
$expectedHash = $match.Groups[1].Value
$fileName = $match.Groups[2].Value
$tempDir = Join-Path ([IO.Path]::GetTempPath()) ('bento-node-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempDir | Out-Null
try {
    $archive = Join-Path $tempDir $fileName
    Write-Host "Downloading portable $fileName from nodejs.org..."
    Invoke-WebRequest -UseBasicParsing -Uri ($baseUrl + $fileName) -OutFile $archive
    if ((Get-FileHash -Algorithm SHA256 -Path $archive).Hash -ne $expectedHash) { throw 'Node.js archive SHA-256 verification failed.' }
    Expand-Archive -LiteralPath $archive -DestinationPath $tempDir
    New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
    Move-Item -LiteralPath (Join-Path $tempDir ($fileName -replace '\.zip$', '')) -Destination $destination
    & (Join-Path $destination 'node.exe') --version
    if ($LASTEXITCODE -ne 0) { throw 'The downloaded Node.js executable could not start.' }
    Write-Host 'Portable Node.js ready; the system PATH was not changed.'
} finally { Remove-Item -LiteralPath $tempDir -Recurse -Force }
