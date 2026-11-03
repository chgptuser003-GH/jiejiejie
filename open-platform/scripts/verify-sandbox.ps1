# Read-only verification for the CF Taiwan sandbox shop after OAuth authorization.
$ErrorActionPreference = 'Stop'
$gateway = 'http://127.0.0.1:8787'
$expectedShopId = '228006723'
$pairPath = Join-Path (Join-Path $env:LOCALAPPDATA 'CF-Shopee-Assistant') 'sandbox-pair-token.dpapi'
if (-not (Test-Path -LiteralPath $pairPath)) { throw '請先執行 start-sandbox.ps1。' }

$health = Invoke-RestMethod -Uri "$gateway/health" -TimeoutSec 5
if ($health.environment -ne 'sandbox' -or [string]$health.shopId -ne $expectedShopId) {
    throw "後端不是預期的臺灣測試店鋪 $expectedShopId。"
}

$securePair = Get-Content -LiteralPath $pairPath -Raw | ConvertTo-SecureString
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePair)
try { $pairText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer) }
$headers = @{ Authorization = "Bearer $pairText" }
$pairText = $null

Write-Output "沙盒店鋪 $expectedShopId：本機後端已連接。"
try {
    $items = Invoke-RestMethod -Uri "$gateway/api/items?status=NORMAL&pageSize=10" -Headers $headers -TimeoutSec 30
    $itemCount = if ($null -eq $items.item) { 0 } else { @($items.item).Count }
    Write-Output "商品只讀查詢成功：本頁 $itemCount 件。"
} catch {
    Write-Output "商品只讀查詢失敗：$($_.Exception.Message)"
}
try {
    $ads = Invoke-RestMethod -Uri "$gateway/api/ads?limit=10" -Headers $headers -TimeoutSec 30
    $adCount = if ($null -eq $ads.campaign_list) { 0 } else { @($ads.campaign_list).Count }
    Write-Output "廣告活動只讀查詢成功：本頁 $adCount 個。"
} catch {
    Write-Output "廣告活動只讀查詢失敗：$($_.Exception.Message)"
}
