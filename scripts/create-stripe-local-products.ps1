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

function Set-LocalEnvValue {
  param(
    [string] $Name,
    [string] $Value
  )

  $lines = Get-Content -LiteralPath $envFile
  $found = $false
  $nextLines = foreach ($line in $lines) {
    if ($line -match "^\s*$([regex]::Escape($Name))=") {
      $found = $true
      "$Name=$Value"
    } else {
      $line
    }
  }

  if (-not $found) {
    $nextLines += "$Name=$Value"
  }

  Set-Content -LiteralPath $envFile -Value $nextLines
}

function Invoke-Stripe {
  param(
    [string] $Method,
    [string] $Path,
    [hashtable] $Body
  )

  $stripeKey = Get-LocalEnvValue "STRIPE_SECRET_KEY"

  if (-not $stripeKey -or $stripeKey -notlike "sk_test_*") {
    throw "Preencha STRIPE_SECRET_KEY com uma chave de teste sk_test_ antes de criar os planos."
  }

  $params = @{}

  foreach ($key in $Body.Keys) {
    $params[$key] = $Body[$key]
  }

  Invoke-RestMethod `
    -Method $Method `
    -Uri "https://api.stripe.com/v1/$Path" `
    -Authentication Basic `
    -Credential ([pscredential]::new($stripeKey, (ConvertTo-SecureString "" -AsPlainText -Force))) `
    -Body $params
}

$plans = @(
  @{ Env = "STRIPE_PRICE_BASIC"; Name = "Nexa Wise Basico"; Amount = "9700" },
  @{ Env = "STRIPE_PRICE_PRO"; Name = "Nexa Wise Pro"; Amount = "19700" },
  @{ Env = "STRIPE_PRICE_MASTER"; Name = "Nexa Wise Master"; Amount = "39700" }
)

foreach ($plan in $plans) {
  $existingPrice = Get-LocalEnvValue $plan.Env

  if ($existingPrice -like "price_*") {
    Write-Host "$($plan.Env) ja preenchido, pulando." -ForegroundColor Yellow
    continue
  }

  $product = Invoke-Stripe -Method "Post" -Path "products" -Body @{
    name = $plan.Name
  }
  $price = Invoke-Stripe -Method "Post" -Path "prices" -Body @{
    currency = "brl"
    product = $product.id
    unit_amount = $plan.Amount
    "recurring[interval]" = "month"
  }

  Set-LocalEnvValue -Name $plan.Env -Value $price.id
  Write-Host "$($plan.Env)=$($price.id)" -ForegroundColor Green
}

Write-Host "Planos criados/atualizados no .env.local. Reinicie o npm run dev depois disso." -ForegroundColor Cyan
