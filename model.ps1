$BASE="https://ai.bayesdl.com/api/maas/v1/anthropic"
$KEY="sk-63df00a9ecc34e7297cd0bc39cb18aa0"

Invoke-RestMethod `
  -Uri "$BASE/v1/models" `
  -Headers @{
    "x-api-key"=$KEY
    "anthropic-version"="2023-06-01"
  } | ConvertTo-Json -Depth 10