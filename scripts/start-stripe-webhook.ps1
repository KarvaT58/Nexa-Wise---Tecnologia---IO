$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot ".env.local"

function Get-LocalEnvValue {
  param([string] $Name)

  if (-not (Test-Path -LiteralPath $envFile)) {
    return ""
  }

  $line = Get-Content -LiteralPath $envFile |
    Where-Object { $_ -match "^\s*$([regex]::Escape($Name))=" } |
    Select-Object -First 1

  if (-not $line) {
    return ""
  }

  return ($line -replace "^\s*$([regex]::Escape($Name))=", "").Trim().Trim('"')
}

$stripeKey = Get-LocalEnvValue "STRIPE_SECRET_KEY"

if (-not $stripeKey) {
  Write-Host "Preencha STRIPE_SECRET_KEY no .env.local antes de iniciar o webhook." -ForegroundColor Yellow
  exit 1
}

if ($stripeKey -notlike "sk_test_*") {
  Write-Host "Atenção: para localhost use uma chave de teste do Stripe começando com sk_test_." -ForegroundColor Yellow
}

Write-Host "Abrindo listener local do Stripe..." -ForegroundColor Green
Write-Host "Quando aparecer o valor whsec_..., cole em STRIPE_WEBHOOK_SECRET no .env.local." -ForegroundColor Cyan

docker run --rm -it stripe/stripe-cli:latest listen `
  --api-key "$stripeKey" `
  --forward-to host.docker.internal:3000/api/webhooks/stripe
