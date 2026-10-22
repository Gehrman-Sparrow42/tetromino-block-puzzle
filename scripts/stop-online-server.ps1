param([ValidateRange(1, 65535)][int]$Port = 8172)
$ErrorActionPreference = 'Stop'
$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($serverId in ($connections.OwningProcess | Sort-Object -Unique)) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $serverId"
    if ($process.Name -eq 'node.exe' -and $process.CommandLine -match 'dist-online[\\/]main\.js') {
        Stop-Process -Id $serverId
        Write-Host "Stopped Afterblock server on port $Port."
    } else {
        throw "Port $Port belongs to another program. It has not been stopped."
    }
}
