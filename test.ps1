$BASE="https://ai.bayesdl.com/api/maas/v1/anthropic"
$KEY="sk-63df00a9ecc34e7297cd0bc39cb18aa0"

$body = @{
  model = "kimi-k2.5"
  max_tokens = 64
  messages = @(
    @{
      role = "user"
      content = "Say hello"
    }
  )
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Uri "$BASE/v1/messages" `
  -Method Post `
  -Headers @{
    "Content-Type"="application/json"
    "x-api-key"=$KEY
    "anthropic-version"="2023-06-01"
  } `
  -Body $body | ConvertTo-Json -Depth 10