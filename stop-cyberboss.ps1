# Stop Codex app-server on port 8765
Get-NetTCPConnection -LocalPort 8765 -ErrorAction SilentlyContinue |
ForEach-Object {
  Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}

# Stop Cyberboss related processes
Get-CimInstance Win32_Process |
Where-Object {
  $_.CommandLine -match "cyberboss|shared-wechat|shared-start|cyberboss.js|app-server --listen ws://127.0.0.1:8765"
} |
ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

# Remove pid files
Remove-Item "$env:USERPROFILE\.cyberboss\logs\shared-app-server.pid" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:USERPROFILE\.cyberboss\logs\shared-wechat.pid" -Force -ErrorAction SilentlyContinue

Write-Host "Cyberboss and Codex shared server stopped."