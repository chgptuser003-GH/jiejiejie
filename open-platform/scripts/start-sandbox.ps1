# Start the CF development App against the authorized Taiwan sandbox shop.
# Partner Key is prompted at runtime and is never written to this repository.
param([string]$RedirectUrl = 'https://phnix.tech/')
$ErrorActionPreference = 'Stop'
if (-not (Get-Command ConvertTo-SecureString -ErrorAction SilentlyContinue)) {
    $securityModule = Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1'
    Import-Module -Name $securityModule -ErrorAction Stop
}
$sandboxPartnerId = '1251151'
$sandboxShopId = '228006723'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path

function Read-SecureStringValue([securestring]$secureValue) {
    $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer) }
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) {
    $nodeExecutable = $nodeCommand.Source
} else {
    $bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (-not (Test-Path -LiteralPath $bundledNode)) { throw '找不到 Node.js 20 或更新版本。請先安裝 Node.js。' }
    $nodeExecutable = $bundledNode
}

$redirectUrl = $RedirectUrl.Trim()
if (-not $redirectUrl.StartsWith('https://')) { throw '回呼網址必須使用 HTTPS。' }
$localDataDirectory = Join-Path $env:LOCALAPPDATA 'CF-Shopee-Assistant'
New-Item -ItemType Directory -Path $localDataDirectory -Force | Out-Null
$startupStatusPath = Join-Path $localDataDirectory 'sandbox-startup-status.json'
function Set-StartupStatus([string]$phase) {
    [pscustomobject]@{ phase = $phase; updatedAt = [DateTime]::UtcNow.ToString('o') } |
        ConvertTo-Json -Compress | Set-Content -LiteralPath $startupStatusPath -NoNewline
}
trap {
    if ($startupStatusPath) {
        Set-StartupStatus "failed_line_$($_.InvocationInfo.ScriptLineNumber)_$($_.Exception.GetType().Name)"
    }
    break
}
$Host.UI.RawUI.WindowTitle = 'CF 蝦皮測試店鋪後端'
Write-Host "CF 測試 App 回呼網址：$redirectUrl"
Set-StartupStatus 'waiting_for_partner_key'
$partnerKey = Read-Host '請貼上 CF 測試 API Partner Key（輸入不顯示）' -AsSecureString
if ($partnerKey.Length -eq 0) { throw 'Partner Key 不能為空。' }
Set-StartupStatus 'partner_key_received'

$protectedKeyPath = Join-Path $localDataDirectory 'sandbox-vault-key.dpapi'
if (Test-Path -LiteralPath $protectedKeyPath) {
    $vaultKey = Get-Content -LiteralPath $protectedKeyPath -Raw | ConvertTo-SecureString
} else {
    $keyBytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Fill($keyBytes)
    $vaultKey = ConvertTo-SecureString ([Convert]::ToBase64String($keyBytes)) -AsPlainText -Force
    $vaultKey | ConvertFrom-SecureString | Set-Content -LiteralPath $protectedKeyPath -NoNewline
    [Array]::Clear($keyBytes, 0, $keyBytes.Length)
}
Set-StartupStatus 'vault_key_ready'
$protectedPairPath = Join-Path $localDataDirectory 'sandbox-pair-token.dpapi'
if (Test-Path -LiteralPath $protectedPairPath) {
    $pairToken = Get-Content -LiteralPath $protectedPairPath -Raw | ConvertTo-SecureString
} else {
    $pairBytes = New-Object byte[] 24
    [Security.Cryptography.RandomNumberGenerator]::Fill($pairBytes)
    $pairText = [Convert]::ToBase64String($pairBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $pairToken = ConvertTo-SecureString $pairText -AsPlainText -Force
    $pairToken | ConvertFrom-SecureString | Set-Content -LiteralPath $protectedPairPath -NoNewline
    [Array]::Clear($pairBytes, 0, $pairBytes.Length)
}
Set-StartupStatus 'pair_token_ready'

$env:SHOPEE_PARTNER_ID = $sandboxPartnerId
$env:SHOPEE_SHOP_ID = $sandboxShopId
$env:SHOPEE_REDIRECT_URL = $redirectUrl
$env:SHOPEE_PARTNER_KEY = Read-SecureStringValue $partnerKey
$env:SHOPEE_VAULT_KEY_BASE64 = Read-SecureStringValue $vaultKey
$env:SHOPEE_VAULT_FILE = Join-Path $localDataDirectory 'sandbox-tokens.json'
$env:SHOPEE_PAIR_TOKEN = Read-SecureStringValue $pairToken
Set-StartupStatus 'environment_ready'

Write-Host "CF 沙盒店鋪 $sandboxShopId；本機後端啟動後請把配對碼貼到插件。"
Set-StartupStatus 'starting_backend'
Push-Location $projectRoot
try { & $nodeExecutable 'bin/server.js' }
finally {
    Pop-Location
    foreach ($name in @('SHOPEE_PARTNER_ID','SHOPEE_SHOP_ID','SHOPEE_REDIRECT_URL','SHOPEE_PARTNER_KEY','SHOPEE_VAULT_KEY_BASE64','SHOPEE_VAULT_FILE','SHOPEE_PAIR_TOKEN')) {
        Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
    }
}
