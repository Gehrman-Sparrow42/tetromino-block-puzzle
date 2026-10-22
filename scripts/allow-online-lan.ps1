#requires -RunAsAdministrator
param([ValidateRange(1, 65535)][int]$Port = 8172)
$ErrorActionPreference = 'Stop'
$ruleName = "Afterblock-LAN-$Port"
if (-not (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -Name $ruleName -DisplayName "Afterblock LAN playtest ($Port)" `
        -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port `
        -RemoteAddress LocalSubnet -Profile Any | Out-Null
}
Write-Host "Afterblock port $Port is allowed from the local subnet."
Write-Host "To remove: Remove-NetFirewallRule -Name '$ruleName'"
