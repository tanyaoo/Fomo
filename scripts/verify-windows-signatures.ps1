$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Encoding UTF8 -Raw | ConvertFrom-Json
$files = @(
    (Join-Path $projectRoot "release/WriteBoom-$($package.version)-x64.exe"),
    (Join-Path $projectRoot 'release/win-unpacked/WriteBoom.exe'),
    (Join-Path $projectRoot 'release/win-unpacked/resources/elevate.exe')
)
$results = foreach ($file in $files) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'Missing Windows build file for signature verification' }
    $signature = Get-AuthenticodeSignature -LiteralPath $file
    $commonName = ''
    if ($signature.SignerCertificate) {
        $commonName = $signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
    }
    [PSCustomObject]@{
        file = [IO.Path]::GetFileName($file)
        status = [string]$signature.Status
        subject = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { '' }
        commonName = $commonName
        timestamped = ($null -ne $signature.TimeStamperCertificate)
    }
}
ConvertTo-Json -InputObject @($results) -Compress
