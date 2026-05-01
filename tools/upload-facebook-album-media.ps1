param(
    [Parameter(Mandatory = $true)]
    [string]$ConnectionString,

    [string]$ContainerName = "kansaspattons",
    [string]$InputPath = ".tmp/facebook",
    [string]$ReportPath = "tools/facebook-album-upload-report.txt",
    [switch]$DryRun,
    [switch]$Force
)

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ReportLines = New-Object System.Collections.Generic.List[string]

function Resolve-RepoPath {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $null
    }

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return [System.IO.Path]::GetFullPath($Path)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $Path))
}

function Get-RelativeDisplayPath {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return ""
    }

    try {
        return [System.IO.Path]::GetRelativePath($RepoRoot, [System.IO.Path]::GetFullPath($Path))
    }
    catch {
        return [System.IO.Path]::GetFullPath($Path)
    }
}

function Add-ReportLine {
    param([string]$Line = "")

    [void]$script:ReportLines.Add($Line)
}

function Get-ConnectionStringValue {
    param(
        [string]$ConnectionString,
        [string]$Name
    )

    if ([string]::IsNullOrWhiteSpace($ConnectionString)) {
        return $null
    }

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
        ".mp4"  { return "video/mp4" }
        ".mov"  { return "video/quicktime" }
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
    $length = (Get-Item -LiteralPath $FilePath).Length

    if ($DryRun) {
        Add-ReportLine "DRY RUN: Would upload $(Get-RelativeDisplayPath -Path $FilePath)"
        Add-ReportLine "  Blob: $BlobName"
        Add-ReportLine "  Content-Type: $contentType"
        Add-ReportLine "  Bytes: $length"
        return "dryrun"
    }

    if (-not $Force) {
        if (Test-BlobExists -AccountName $AccountName -AccountKey $AccountKey -ContainerName $ContainerName -BlobName $BlobName) {
            Add-ReportLine "Blob exists, skipping: $BlobName"
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

    Add-ReportLine "Uploaded: $BlobName"
    return "uploaded"
}

function Get-UploadWorkItems {
    param([string]$InputRoot)

    $items = New-Object System.Collections.Generic.List[object]
    $rawRoot = Join-Path $InputRoot "raw"
    $thumbRoot = Join-Path $InputRoot "thumbs"

    if (Test-Path -LiteralPath $rawRoot) {
        Get-ChildItem -LiteralPath $rawRoot -File -Recurse | ForEach-Object {
            $relative = $_.FullName.Substring($rawRoot.Length).TrimStart('\', '/') -replace '\\', '/'
            [void]$items.Add([pscustomobject]@{
                FilePath = $_.FullName
                BlobName = "images/facebook/$relative"
                Kind = "raw"
            })
        }
    }

    if (Test-Path -LiteralPath $thumbRoot) {
        Get-ChildItem -LiteralPath $thumbRoot -File -Recurse | ForEach-Object {
            $relative = $_.FullName.Substring($thumbRoot.Length).TrimStart('\', '/') -replace '\\', '/'
            [void]$items.Add([pscustomobject]@{
                FilePath = $_.FullName
                BlobName = "thumbs/facebook/$relative"
                Kind = "thumb"
            })
        }
    }

    return $items.ToArray()
}

$InputRoot = Resolve-RepoPath -Path $InputPath
$ReportFullPath = Resolve-RepoPath -Path $ReportPath

if (-not (Test-Path -LiteralPath $InputRoot -PathType Container)) {
    throw "Input path not found: $InputRoot"
}

$accountName = Get-ConnectionStringValue -ConnectionString $ConnectionString -Name "AccountName"
$accountKey = Get-ConnectionStringValue -ConnectionString $ConnectionString -Name "AccountKey"

if ([string]::IsNullOrWhiteSpace($accountName)) {
    throw "Connection string is missing AccountName."
}

if ([string]::IsNullOrWhiteSpace($accountKey)) {
    throw "Connection string is missing AccountKey."
}

Add-ReportLine "Facebook Album Upload Report"
Add-ReportLine "Generated: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz'))"
Add-ReportLine "Repo root: $RepoRoot"
Add-ReportLine "Input path: $InputRoot"
Add-ReportLine "Container: $ContainerName"
Add-ReportLine "Storage account: $accountName"
Add-ReportLine "Dry run: $DryRun"
Add-ReportLine "Force: $Force"
Add-ReportLine ""

$workItems = @(Get-UploadWorkItems -InputRoot $InputRoot)
$planned = $workItems.Count
$rawPlanned = @($workItems | Where-Object { $_.Kind -eq "raw" }).Count
$thumbPlanned = @($workItems | Where-Object { $_.Kind -eq "thumb" }).Count
$uploaded = 0
$skipped = 0
$dryRunCount = 0
$rawUploaded = 0
$thumbUploaded = 0
$rawSkipped = 0
$thumbSkipped = 0
$rawDryRun = 0
$thumbDryRun = 0
$errors = 0

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
            "uploaded" {
                $uploaded++
                if ($item.Kind -eq "raw") { $rawUploaded++ } else { $thumbUploaded++ }
            }
            "skipped" {
                $skipped++
                if ($item.Kind -eq "raw") { $rawSkipped++ } else { $thumbSkipped++ }
            }
            "dryrun" {
                $dryRunCount++
                if ($item.Kind -eq "raw") { $rawDryRun++ } else { $thumbDryRun++ }
            }
        }
    }
    catch {
        $errors++
        Add-ReportLine "ERROR uploading $(Get-RelativeDisplayPath -Path $item.FilePath)"
        Add-ReportLine "  Blob: $($item.BlobName)"
        Add-ReportLine "  $($_.Exception.Message)"
    }
}

Add-ReportLine ""
Add-ReportLine "Summary"
Add-ReportLine "======="
Add-ReportLine "Planned uploads: $planned"
Add-ReportLine "Raw uploads planned: $rawPlanned"
Add-ReportLine "Thumbnail uploads planned: $thumbPlanned"
Add-ReportLine "Uploaded: $uploaded"
Add-ReportLine "Raw uploaded: $rawUploaded"
Add-ReportLine "Thumbnail uploaded: $thumbUploaded"
Add-ReportLine "Skipped existing blobs: $skipped"
Add-ReportLine "Raw skipped existing blobs: $rawSkipped"
Add-ReportLine "Thumbnail skipped existing blobs: $thumbSkipped"
Add-ReportLine "Dry run uploads: $dryRunCount"
Add-ReportLine "Raw dry run uploads: $rawDryRun"
Add-ReportLine "Thumbnail dry run uploads: $thumbDryRun"
Add-ReportLine "Errors: $errors"

$reportDirectory = Split-Path $ReportFullPath -Parent
if (-not (Test-Path -LiteralPath $reportDirectory)) {
    New-Item -ItemType Directory -Path $reportDirectory | Out-Null
}

$ReportLines | Set-Content -LiteralPath $ReportFullPath -Encoding UTF8

Write-Host "Facebook album upload pass complete." -ForegroundColor Green
Write-Host "Report: $(Get-RelativeDisplayPath -Path $ReportFullPath)"
Write-Host "Planned uploads: $planned"
Write-Host "Raw uploads planned: $rawPlanned"
Write-Host "Thumbnail uploads planned: $thumbPlanned"
Write-Host "Uploaded: $uploaded"
Write-Host "Skipped existing blobs: $skipped"
Write-Host "Dry run uploads: $dryRunCount"
Write-Host "Errors: $errors"
