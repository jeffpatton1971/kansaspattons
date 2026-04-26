param(
    [Parameter(Mandatory = $true)]
    [string]$ConnectionString,

    [string]$ContainerName = "kansaspattons",
    [string]$InputPath = ".tmp/wordpress",
    [switch]$DryRun,
    [switch]$Force
)

$RepoRoot = Split-Path -Parent $PSScriptRoot

if (-not [System.IO.Path]::IsPathRooted($InputPath)) {
    $InputPath = Join-Path $RepoRoot $InputPath
}

Write-Host "Starting WordPress image upload (dry-run=$DryRun)" -ForegroundColor Cyan
Write-Host "Repo root: $RepoRoot" -ForegroundColor Cyan
Write-Host "Input path: $InputPath" -ForegroundColor Cyan
Write-Host "Container: $ContainerName" -ForegroundColor Cyan

function Get-ConnectionStringValue {
    param(
        [string]$ConnectionString,
        [string]$Name
    )

    $parts = $ConnectionString -split ';'
    foreach ($part in $parts) {
        if ($part -match '^([^=]+)=(.*)$') {
            if ($matches[1] -eq $Name) {
                return $matches[2]
            }
        }
    }

    return $null
}

function Get-ContentType {
    param([string]$Path)

    switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        ".jpg"  { return "image/jpeg" }
        ".jpeg" { return "image/jpeg" }
        ".png"  { return "image/png" }
        ".gif"  { return "image/gif" }
        ".webp" { return "image/webp" }
        default { return "application/octet-stream" }
    }
}

function New-StorageAuthorizationHeader {
    param(
        [string]$AccountName,
        [string]$AccountKey,
        [string]$Method,
        [string]$ContentLength,
        [string]$ContentType,
        [string]$Date,
        [string]$CanonicalizedHeaders,
        [string]$CanonicalizedResource
    )

    $stringToSign = @(
        $Method
        ""
        ""
        $ContentLength
        ""
        $ContentType
        ""
        ""
        ""
        ""
        ""
        ""
        $CanonicalizedHeaders + $CanonicalizedResource
    ) -join "`n"

    $keyBytes = [Convert]::FromBase64String($AccountKey)
    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    $hmac.Key = $keyBytes

    $signatureBytes = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($stringToSign))
    $signature = [Convert]::ToBase64String($signatureBytes)

    return "SharedKey ${AccountName}:$signature"
}

function Test-BlobExists {
    param(
        [string]$AccountName,
        [string]$AccountKey,
        [string]$ContainerName,
        [string]$BlobName
    )

    $encodedBlobName = ($BlobName -split '/' | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
    $uri = "https://$AccountName.blob.core.windows.net/$ContainerName/$encodedBlobName"
    $date = [DateTime]::UtcNow.ToString("R")

    $canonicalizedHeaders = "x-ms-date:$date`nx-ms-version:2020-10-02`n"
    $canonicalizedResource = "/$AccountName/$ContainerName/$BlobName"

    $auth = New-StorageAuthorizationHeader `
        -AccountName $AccountName `
        -AccountKey $AccountKey `
        -Method "HEAD" `
        -ContentLength "" `
        -ContentType "" `
        -Date $date `
        -CanonicalizedHeaders $canonicalizedHeaders `
        -CanonicalizedResource $canonicalizedResource

    try {
        Invoke-WebRequest `
            -Uri $uri `
            -Method Head `
            -Headers @{
                "x-ms-date" = $date
                "x-ms-version" = "2020-10-02"
                "Authorization" = $auth
            } | Out-Null

        return $true
    }
    catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 404) {
            return $false
        }

        throw
    }
}

function Upload-Blob {
    param(
        [string]$AccountName,
        [string]$AccountKey,
        [string]$ContainerName,
        [string]$BlobName,
        [string]$FilePath,
        [switch]$DryRun,
        [switch]$Force
    )

    $contentType = Get-ContentType -Path $FilePath
    $length = (Get-Item $FilePath).Length

    if ($DryRun) {
        Write-Host "DRY RUN: Would upload:"
        Write-Host "  File: $FilePath"
        Write-Host "  Blob: $BlobName"
        Write-Host "  Content-Type: $contentType"
        return "dryrun"
    }

    if (-not $Force) {
        if (Test-BlobExists `
                -AccountName $AccountName `
                -AccountKey $AccountKey `
                -ContainerName $ContainerName `
                -BlobName $BlobName) {
            Write-Host "Blob exists, skipping: $BlobName" -ForegroundColor DarkGray
            return "skipped"
        }
    }

    $encodedBlobName = ($BlobName -split '/' | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
    $uri = "https://$AccountName.blob.core.windows.net/$ContainerName/$encodedBlobName"
    $date = [DateTime]::UtcNow.ToString("R")

    $canonicalizedHeaders =
        "x-ms-blob-type:BlockBlob`n" +
        "x-ms-date:$date`n" +
        "x-ms-version:2020-10-02`n"

    $canonicalizedResource = "/$AccountName/$ContainerName/$BlobName"

    $auth = New-StorageAuthorizationHeader `
        -AccountName $AccountName `
        -AccountKey $AccountKey `
        -Method "PUT" `
        -ContentLength "$length" `
        -ContentType $contentType `
        -Date $date `
        -CanonicalizedHeaders $canonicalizedHeaders `
        -CanonicalizedResource $canonicalizedResource

    Invoke-WebRequest `
        -Uri $uri `
        -Method Put `
        -InFile $FilePath `
        -ContentType $contentType `
        -Headers @{
            "x-ms-blob-type" = "BlockBlob"
            "x-ms-date" = $date
            "x-ms-version" = "2020-10-02"
            "Authorization" = $auth
        } | Out-Null

    Write-Host "Uploaded: $BlobName" -ForegroundColor Green
    return "uploaded"
}

$accountName = Get-ConnectionStringValue -ConnectionString $ConnectionString -Name "AccountName"
$accountKey = Get-ConnectionStringValue -ConnectionString $ConnectionString -Name "AccountKey"

if ([string]::IsNullOrWhiteSpace($accountName)) {
    throw "Connection string is missing AccountName."
}

if ([string]::IsNullOrWhiteSpace($accountKey)) {
    throw "Connection string is missing AccountKey."
}

$rawPath = Join-Path $InputPath "raw"
$thumbPath = Join-Path $InputPath "thumbs"

if (-not (Test-Path $rawPath)) {
    throw "Raw image path not found: $rawPath"
}

if (-not (Test-Path $thumbPath)) {
    throw "Thumb image path not found: $thumbPath"
}

$uploaded = 0
$skipped = 0
$dryRunCount = 0
$errors = 0

$workItems = @()

Get-ChildItem -Path $rawPath -File -Recurse | ForEach-Object {
    $relative = $_.FullName.Substring($rawPath.Length).TrimStart('\', '/')
    $blobName = "images/wordpress/" + ($relative -replace '\\', '/')

    $workItems += [pscustomobject]@{
        FilePath = $_.FullName
        BlobName = $blobName
    }
}

Get-ChildItem -Path $thumbPath -File -Recurse | ForEach-Object {
    $relative = $_.FullName.Substring($thumbPath.Length).TrimStart('\', '/')
    $blobName = "thumbs/wordpress/" + ($relative -replace '\\', '/')

    $workItems += [pscustomobject]@{
        FilePath = $_.FullName
        BlobName = $blobName
    }
}

foreach ($item in $workItems) {
    try {
        $result = Upload-Blob `
            -AccountName $accountName `
            -AccountKey $accountKey `
            -ContainerName $ContainerName `
            -BlobName $item.BlobName `
            -FilePath $item.FilePath `
            -DryRun:$DryRun `
            -Force:$Force

        switch ($result) {
            "uploaded" { $uploaded++ }
            "skipped" { $skipped++ }
            "dryrun"  { $dryRunCount++ }
        }
    }
    catch {
        Write-Host "ERROR uploading $($item.FilePath): $($_.Exception.Message)" -ForegroundColor Red
        $errors++
    }
}

Write-Host "`n===== SUMMARY =====" -ForegroundColor Cyan
Write-Host "Files planned: $($workItems.Count)"
Write-Host "Uploaded: $uploaded"
Write-Host "Skipped: $skipped"
Write-Host "Dry run: $dryRunCount"
Write-Host "Errors: $errors"