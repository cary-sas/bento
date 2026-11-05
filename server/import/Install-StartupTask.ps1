# Run in an elevated Windows PowerShell. Uses a dedicated, non-admin account.
[CmdletBinding()]
param([string]$TaskName = 'bento-import')
$ErrorActionPreference = 'Stop'
$credential = Get-Credential -Message 'Account to run bento/import at startup (needs Log on as a batch job)'
if (-not $credential) { throw 'No account selected' }
$launcher = Join-Path $PSScriptRoot 'Start.ps1'
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$launcher`"" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$plainPassword = $credential.GetNetworkCredential().Password
try {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -User $credential.UserName -Password $plainPassword -Description 'Local bento PowerPoint import server' | Out-Null
} finally { $plainPassword = $null }
Write-Host "Installed task '$TaskName'. Start with: Start-ScheduledTask -TaskName '$TaskName'"
