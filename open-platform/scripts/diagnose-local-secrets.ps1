# Check DPAPI compatibility without displaying decrypted values.
if (-not (Get-Command ConvertTo-SecureString -ErrorAction SilentlyContinue)) {
    $securityModule = Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1'
    Import-Module -Name $securityModule -ErrorAction Stop
}
$localDirectory = Join-Path $env:LOCALAPPDATA 'CF-Shopee-Assistant'
foreach ($commandName in @('Get-Content', 'ConvertTo-SecureString', 'ConvertFrom-SecureString')) {
    $command = Get-Command $commandName -ErrorAction SilentlyContinue
    Write-Output "$commandName available=$([bool]$command)"
}
foreach ($name in @('sandbox-vault-key.dpapi', 'sandbox-pair-token.dpapi')) {
    $path = Join-Path $localDirectory $name
    if (-not (Test-Path -LiteralPath $path)) {
        Write-Output "$name missing"
        continue
    }
    try {
        $secure = Get-Content -LiteralPath $path -Raw | ConvertTo-SecureString
        Write-Output "$name readable length=$($secure.Length)"
    } catch {
        Write-Output "$name failed type=$($_.Exception.GetType().Name)"
    }
}
