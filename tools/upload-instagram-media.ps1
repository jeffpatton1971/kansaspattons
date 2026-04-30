param(
    [string]$ConnectionString = $env:AZURE_STORAGE_CONNECTION_STRING,
    [string]$GalleryPath = "_gallery",
    [string]$ExportPath = ".instagram",
    [string]$ThumbnailPath = ".tmp/instagram",
    [string]$ContainerName = "kansaspattons",
    [string]$ReportPath = "tools/instagram-upload-report.txt",
    [int]$ThumbMaxWidth = 300,
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

    $fullPath = [System.IO.Path]::GetFullPath($Path)

    try {
        return [System.IO.Path]::GetRelativePath($RepoRoot, $fullPath)
    }
    catch {
        $rootPath = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
        $rootWithSlash = $rootPath + [System.IO.Path]::DirectorySeparatorChar

        if ($fullPath.StartsWith($rootWithSlash, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $fullPath.Substring($rootWithSlash.Length)
        }

        return $fullPath
    }
}

function Add-ReportLine {
    param([string]$Line = "")

    [void]$script:ReportLines.Add($Line)
    Write-Host $Line
}

function ConvertFrom-YamlScalar {
    param([string]$Value)

    if ($null -eq $Value) {
        return $null
    }

    $text = $Value.Trim()

    if ($text -eq "[]" -or $text -eq "null") {
        return $null
    }

    if ($text.Length -ge 2 -and $text.StartsWith('"') -and $text.EndsWith('"')) {
        $text = $text.Substring(1, $text.Length - 2)
        $text = $text.Replace('\"', '"')
        $text = $text.Replace('\t', "`t")
        $text = $text.Replace('\n', "`n")
        $text = $text.Replace('\r', "`r")
        $text = $text.Replace('\\', '\')
    }
    elseif ($text.Length -ge 2 -and $text.StartsWith("'") -and $text.EndsWith("'")) {
        $text = $text.Substring(1, $text.Length - 2)
        $text = $text.Replace("''", "'")
    }

    return $text
}

function Get-FrontMatterLines {
    param([string]$Path)

    $lines = Get-Content -LiteralPath $Path -Encoding UTF8

    if (-not $lines -or $lines.Count -lt 2 -or $lines[0] -ne "---") {
        return @()
    }

    for ($i = 1; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -eq "---") {
            if ($i -eq 1) {
                return @()
            }

            return @($lines[1..($i - 1)])
        }
    }

    return @()
}

function Get-FrontMatterValue {
    param(
        [string[]]$Lines,
        [string]$Name
    )

    $pattern = '^' + [regex]::Escape($Name) + ':\s*(.*)$'

    foreach ($line in $Lines) {
        if ($line -match $pattern) {
            return ConvertFrom-YamlScalar -Value $matches[1]
        }
    }

    return $null
}

function Get-NestedFrontMatterValue {
    param(
        [string[]]$Lines,
        [string]$Parent,
        [string]$Name
    )

    $inParent = $false
    $parentPattern = '^' + [regex]::Escape($Parent) + ':\s*$'
    $childPattern = '^\s{2}' + [regex]::Escape($Name) + ':\s*(.*)$'

    foreach ($line in $Lines) {
        if ($line -match $parentPattern) {
            $inParent = $true
            continue
        }

        if ($inParent -and $line -match '^\S') {
            break
        }

        if ($inParent -and $line -match $childPattern) {
            return ConvertFrom-YamlScalar -Value $matches[1]
        }
    }

    return $null
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
        ".heic" { return "image/heic" }
        ".heif" { return "image/heif" }
        ".mp4"  { return "video/mp4" }
        ".m4v"  { return "video/mp4" }
        ".mov"  { return "video/quicktime" }
        ".webm" { return "video/webm" }
        default { return "application/octet-stream" }
    }
}

function Test-ImageFile {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return $false
    }

    $stream = $null

    try {
        $stream = [System.IO.File]::OpenRead($Path)

        if ($stream.Length -lt 12) {
            return $false
        }

        $buffer = New-Object byte[] 12
        [void]$stream.Read($buffer, 0, 12)

        if ($buffer[0] -eq 0xFF -and $buffer[1] -eq 0xD8) { return $true }
        if ($buffer[0] -eq 0x89 -and $buffer[1] -eq 0x50 -and $buffer[2] -eq 0x4E -and $buffer[3] -eq 0x47) { return $true }
        if ($buffer[0] -eq 0x47 -and $buffer[1] -eq 0x49 -and $buffer[2] -eq 0x46) { return $true }
        if ($buffer[0] -eq 0x42 -and $buffer[1] -eq 0x4D) { return $true }

        return $false
    }
    finally {
        if ($stream) {
            $stream.Dispose()
        }
    }
}

function Test-VideoMedia {
    param([string]$Path)

    switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        ".mp4"  { return $true }
        ".m4v"  { return $true }
        ".mov"  { return $true }
        ".webm" { return $true }
        default { return $false }
    }
}

function New-Thumbnail {
    param(
        [string]$InputPath,
        [string]$OutputPath,
        [int]$MaxWidth
    )

    Add-Type -AssemblyName System.Drawing

    if (-not (Test-ImageFile -Path $InputPath)) {
        throw "Cannot create thumbnail because raw file is not a recognized image: $InputPath"
    }

    $image = $null
    $thumb = $null
    $graphics = $null

    try {
        $absoluteInputPath = [System.IO.Path]::GetFullPath($InputPath)
        $image = [System.Drawing.Image]::FromFile($absoluteInputPath)

        if ($image.Width -le $MaxWidth) {
            $newWidth = $image.Width
            $newHeight = $image.Height
        }
        else {
            $ratio = $MaxWidth / $image.Width
            $newWidth = $MaxWidth
            $newHeight = [int]($image.Height * $ratio)
        }

        $thumb = New-Object System.Drawing.Bitmap($newWidth, $newHeight)
        $graphics = [System.Drawing.Graphics]::FromImage($thumb)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.DrawImage($image, 0, 0, $newWidth, $newHeight)

        $jpgCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
            Where-Object { $_.MimeType -eq "image/jpeg" }

        $encoder = [System.Drawing.Imaging.Encoder]::Quality
        $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($encoder, 85L)

        $directory = Split-Path $OutputPath -Parent
        if (-not (Test-Path -LiteralPath $directory)) {
            New-Item -ItemType Directory -Path $directory | Out-Null
        }

        $thumb.Save($OutputPath, $jpgCodec, $encoderParams)
    }
    finally {
        if ($graphics) { $graphics.Dispose() }
        if ($thumb) { $thumb.Dispose() }
        if ($image) { $image.Dispose() }
    }
}

function Ensure-Thumbnail {
    param(
        [string]$InputPath,
        [string]$OutputPath,
        [int]$MaxWidth,
        [switch]$DryRun,
        [switch]$Force
    )

    if (Test-VideoMedia -Path $InputPath) {
        return "skipped-video"
    }

    if ($DryRun) {
        if (Test-ImageFile -Path $InputPath) {
            return "dryrun-image"
        }

        return "dryrun-unsupported"
    }

    if ((Test-Path -LiteralPath $OutputPath) -and -not $Force) {
        return "exists"
    }

    if (Test-ImageFile -Path $InputPath) {
        New-Thumbnail -InputPath $InputPath -OutputPath $OutputPath -MaxWidth $MaxWidth
        return "created"
    }

    throw "Unsupported media type for thumbnail generation: $InputPath"
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
        [string]$ContentTypeOverride,
        [switch]$DryRun,
        [switch]$Force
    )

    $contentType = if (-not [string]::IsNullOrWhiteSpace($ContentTypeOverride)) {
        $ContentTypeOverride
    }
    else {
        Get-ContentType -Path $FilePath
    }
    $length = (Get-Item -LiteralPath $FilePath).Length

    if ($DryRun) {
        Add-ReportLine "  DRY RUN: Would upload $(Get-RelativeDisplayPath -Path $FilePath)"
        Add-ReportLine "    Blob: $BlobName"
        Add-ReportLine "    Content-Type: $contentType"
        Add-ReportLine "    Bytes: $length"
        return "dryrun"
    }

    if (-not $Force) {
        if (Test-BlobExists `
                -AccountName $AccountName `
                -AccountKey $AccountKey `
                -ContainerName $ContainerName `
                -BlobName $BlobName) {
            Add-ReportLine "  Blob exists, skipping: $BlobName"
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

    Add-ReportLine "  Uploaded: $BlobName"
    return "uploaded"
}

function Get-BlobNameFromUrl {
    param(
        [string]$Url,
        [string]$ContainerName
    )

    if ([string]::IsNullOrWhiteSpace($Url)) {
        return $null
    }

    try {
        $uri = [Uri]$Url
        $path = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
        $containerPrefix = "$ContainerName/"

        if ($path.StartsWith($containerPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $path.Substring($containerPrefix.Length)
        }

        foreach ($marker in @("images/instagram/", "thumbs/instagram/")) {
            $index = $path.IndexOf($marker, [System.StringComparison]::OrdinalIgnoreCase)

            if ($index -ge 0) {
                return $path.Substring($index)
            }
        }

        return $path
    }
    catch {
        return $null
    }
}

function Get-LocalThumbnailPath {
    param(
        [string]$ThumbnailRoot,
        [string]$ThumbBlobName
    )

    if ([string]::IsNullOrWhiteSpace($ThumbBlobName)) {
        return $null
    }

    $relativePath = $ThumbBlobName -replace '/', [System.IO.Path]::DirectorySeparatorChar

    return [System.IO.Path]::GetFullPath((Join-Path $ThumbnailRoot $relativePath))
}

function Get-LocalMediaPath {
    param(
        [string]$ExportRoot,
        [string]$SourceUri
    )

    if ([string]::IsNullOrWhiteSpace($SourceUri)) {
        return $null
    }

    $relativeUri = ($SourceUri -replace '\\', '/') -replace '^[\/]+', ''
    $relativePath = $relativeUri -replace '/', [System.IO.Path]::DirectorySeparatorChar

    return [System.IO.Path]::GetFullPath((Join-Path $ExportRoot $relativePath))
}

function Get-InstagramGalleryItems {
    param(
        [string]$GalleryRoot,
        [string]$ExportRoot,
        [string]$ContainerName
    )

    $items = New-Object System.Collections.Generic.List[object]
    $galleryFiles = Get-ChildItem -LiteralPath $GalleryRoot -Filter "instagram-*.md" -File

    foreach ($file in $galleryFiles) {
        try {
            $frontMatter = Get-FrontMatterLines -Path $file.FullName
            $sourceType = Get-NestedFrontMatterValue -Lines $frontMatter -Parent "source" -Name "type"
            $sourceUri = Get-NestedFrontMatterValue -Lines $frontMatter -Parent "source" -Name "uri"
            $rawUrl = Get-FrontMatterValue -Lines $frontMatter -Name "raw_url"
            $thumbUrl = Get-FrontMatterValue -Lines $frontMatter -Name "thumb_url"

            if ($sourceType -ne "instagram" -and $rawUrl -notmatch '/images/instagram/') {
                continue
            }

            $blobName = Get-BlobNameFromUrl -Url $rawUrl -ContainerName $ContainerName
            $thumbBlobName = Get-BlobNameFromUrl -Url $thumbUrl -ContainerName $ContainerName
            $mediaPath = Get-LocalMediaPath -ExportRoot $ExportRoot -SourceUri $sourceUri

            [void]$items.Add([pscustomobject]@{
                    GalleryPath    = $file.FullName
                    GalleryName    = $file.Name
                    PostId         = Get-FrontMatterValue -Lines $frontMatter -Name "post_id"
                    SourceUri      = $sourceUri
                    SourceFileName = Get-FrontMatterValue -Lines $frontMatter -Name "source_filename"
                    RawUrl         = $rawUrl
                    ThumbUrl       = $thumbUrl
                    BlobName       = $blobName
                    ThumbBlobName  = $thumbBlobName
                    MediaPath      = $mediaPath
                    Index          = Get-FrontMatterValue -Lines $frontMatter -Name "index"
                })
        }
        catch {
            [void]$items.Add([pscustomobject]@{
                    GalleryPath = $file.FullName
                    GalleryName = $file.Name
                    Error       = $_.Exception.Message
                })
        }
    }

    return $items.ToArray()
}

$GalleryRoot = Resolve-RepoPath -Path $GalleryPath
$ExportRoot = Resolve-RepoPath -Path $ExportPath
$ThumbnailRoot = Resolve-RepoPath -Path $ThumbnailPath
$ReportFullPath = Resolve-RepoPath -Path $ReportPath

Add-ReportLine "Instagram Media Upload Report"
Add-ReportLine "Generated: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz'))"
Add-ReportLine "Repo root: $RepoRoot"
Add-ReportLine "Gallery path: $GalleryRoot"
Add-ReportLine "Export path: $ExportRoot"
Add-ReportLine "Thumbnail path: $ThumbnailRoot"
Add-ReportLine "Container: $ContainerName"
Add-ReportLine "Report path: $ReportFullPath"
Add-ReportLine "Thumbnail max width: $ThumbMaxWidth"
Add-ReportLine "DryRun: $DryRun"
Add-ReportLine "Force: $Force"
Add-ReportLine "Video thumbnails: skipped"
Add-ReportLine ""

if (-not (Test-Path -LiteralPath $GalleryRoot)) {
    throw "Gallery path not found: $GalleryRoot"
}

if (-not (Test-Path -LiteralPath $ExportRoot)) {
    throw "Instagram export path not found: $ExportRoot"
}

$accountName = Get-ConnectionStringValue -ConnectionString $ConnectionString -Name "AccountName"
$accountKey = Get-ConnectionStringValue -ConnectionString $ConnectionString -Name "AccountKey"

if (-not $DryRun) {
    if ([string]::IsNullOrWhiteSpace($ConnectionString)) {
        throw "Provide -ConnectionString or set AZURE_STORAGE_CONNECTION_STRING before running a real upload."
    }

    if ([string]::IsNullOrWhiteSpace($accountName)) {
        throw "Connection string is missing AccountName."
    }

    if ([string]::IsNullOrWhiteSpace($accountKey)) {
        throw "Connection string is missing AccountKey."
    }
}
elseif (-not [string]::IsNullOrWhiteSpace($accountName)) {
    Add-ReportLine "Storage account from connection string: $accountName"
    Add-ReportLine ""
}

$items = Get-InstagramGalleryItems -GalleryRoot $GalleryRoot -ExportRoot $ExportRoot -ContainerName $ContainerName
$seenBlobs = @{}
$instagramGalleryItems = 0
$plannedUploads = 0
$rawUploadsPlanned = 0
$thumbnailUploadsPlanned = 0
$uploaded = 0
$skipped = 0
$dryRunCount = 0
$rawUploaded = 0
$rawSkipped = 0
$rawDryRunCount = 0
$thumbnailUploaded = 0
$thumbnailSkipped = 0
$thumbnailDryRunCount = 0
$thumbnailsCreated = 0
$thumbnailsAlreadyExist = 0
$thumbnailDryRunCreates = 0
$videoThumbnailsSkipped = 0
$unsupportedThumbnails = 0
$missingLocalFiles = 0
$incompleteItems = 0
$duplicateBlobReferences = 0
$errors = 0
$thumbnailErrors = 0
$totalRawBytes = [int64]0

foreach ($item in $items) {
    $instagramGalleryItems++

    if ($item.Error) {
        Add-ReportLine "Gallery item parse error: $(Get-RelativeDisplayPath -Path $item.GalleryPath)"
        Add-ReportLine "  ERROR: $($item.Error)"
        $errors++
        continue
    }

    if ([string]::IsNullOrWhiteSpace($item.SourceUri) -or
        [string]::IsNullOrWhiteSpace($item.BlobName) -or
        [string]::IsNullOrWhiteSpace($item.ThumbBlobName) -or
        [string]::IsNullOrWhiteSpace($item.MediaPath)) {
        Add-ReportLine "Incomplete gallery item, skipping: $(Get-RelativeDisplayPath -Path $item.GalleryPath)"
        Add-ReportLine "  Source URI: $($item.SourceUri)"
        Add-ReportLine "  Raw URL: $($item.RawUrl)"
        Add-ReportLine "  Thumb URL: $($item.ThumbUrl)"
        Add-ReportLine "  Blob name: $($item.BlobName)"
        Add-ReportLine "  Thumb blob name: $($item.ThumbBlobName)"
        $incompleteItems++
        continue
    }

    if (-not (Test-Path -LiteralPath $item.MediaPath)) {
        Add-ReportLine "Missing local media, skipping: $(Get-RelativeDisplayPath -Path $item.GalleryPath)"
        Add-ReportLine "  Source URI: $($item.SourceUri)"
        Add-ReportLine "  Expected file: $($item.MediaPath)"
        Add-ReportLine "  Blob: $($item.BlobName)"
        $missingLocalFiles++
        continue
    }

    $rawBlobKey = $item.BlobName.ToLowerInvariant()
    if ($seenBlobs.ContainsKey($rawBlobKey)) {
        Add-ReportLine "Duplicate blob reference, skipping duplicate upload: $(Get-RelativeDisplayPath -Path $item.GalleryPath)"
        Add-ReportLine "  Blob: $($item.BlobName)"
        Add-ReportLine "  First seen: $($seenBlobs[$rawBlobKey])"
        $duplicateBlobReferences++
        continue
    }

    $seenBlobs[$rawBlobKey] = Get-RelativeDisplayPath -Path $item.GalleryPath
    $plannedUploads++
    $rawUploadsPlanned++
    $totalRawBytes += (Get-Item -LiteralPath $item.MediaPath).Length
    $thumbLocalPath = Get-LocalThumbnailPath -ThumbnailRoot $ThumbnailRoot -ThumbBlobName $item.ThumbBlobName

    Add-ReportLine "Gallery upload item $instagramGalleryItems"
    Add-ReportLine "  Gallery item: $(Get-RelativeDisplayPath -Path $item.GalleryPath)"
    Add-ReportLine "  Post ID: $($item.PostId)"
    Add-ReportLine "  Source URI: $($item.SourceUri)"
    Add-ReportLine "  Local file: $($item.MediaPath)"
    Add-ReportLine "  Raw URL: $($item.RawUrl)"
    Add-ReportLine "  Raw blob: $($item.BlobName)"
    Add-ReportLine "  Thumb URL: $($item.ThumbUrl)"
    Add-ReportLine "  Thumb blob: $($item.ThumbBlobName)"
    Add-ReportLine "  Local thumbnail: $thumbLocalPath"

    try {
        $result = Upload-Blob `
            -AccountName $accountName `
            -AccountKey $accountKey `
            -ContainerName $ContainerName `
            -BlobName $item.BlobName `
            -FilePath $item.MediaPath `
            -DryRun:$DryRun `
            -Force:$Force

        switch ($result) {
            "uploaded" { $uploaded++; $rawUploaded++ }
            "skipped" { $skipped++; $rawSkipped++ }
            "dryrun"  { $dryRunCount++; $rawDryRunCount++ }
        }
    }
    catch {
        Add-ReportLine "  ERROR uploading raw blob: $($_.Exception.Message)"
        $errors++
    }

    try {
        $thumbnailResult = Ensure-Thumbnail `
            -InputPath $item.MediaPath `
            -OutputPath $thumbLocalPath `
            -MaxWidth $ThumbMaxWidth `
            -DryRun:$DryRun `
            -Force:$Force

        switch ($thumbnailResult) {
            "created" {
                $thumbnailsCreated++
                Add-ReportLine "  Created thumbnail: $thumbLocalPath"
            }
            "exists" {
                $thumbnailsAlreadyExist++
                Add-ReportLine "  Thumbnail exists: $thumbLocalPath"
            }
            "dryrun-image" {
                $thumbnailDryRunCreates++
                Add-ReportLine "  DRY RUN: Would create image thumbnail: $thumbLocalPath"
            }
            "skipped-video" {
                $videoThumbnailsSkipped++
                Add-ReportLine "  Video thumbnail skipped; raw video will upload without thumbnail generation."
            }
            "dryrun-unsupported" {
                $unsupportedThumbnails++
                Add-ReportLine "  DRY RUN: Unsupported thumbnail media type: $($item.MediaPath)"
            }
        }

        if ($thumbnailResult -in @("created", "exists", "dryrun-image")) {
            $plannedUploads++
            $thumbnailUploadsPlanned++

            if ($DryRun) {
                $dryRunCount++
                $thumbnailDryRunCount++
                Add-ReportLine "  DRY RUN: Would upload thumbnail"
                Add-ReportLine "    Blob: $($item.ThumbBlobName)"
                Add-ReportLine "    Content-Type: image/jpeg"
            }
            else {
                $thumbUploadResult = Upload-Blob `
                    -AccountName $accountName `
                    -AccountKey $accountKey `
                    -ContainerName $ContainerName `
                    -BlobName $item.ThumbBlobName `
                    -FilePath $thumbLocalPath `
                    -ContentTypeOverride "image/jpeg" `
                    -DryRun:$DryRun `
                    -Force:$Force

                switch ($thumbUploadResult) {
                    "uploaded" { $uploaded++; $thumbnailUploaded++ }
                    "skipped" { $skipped++; $thumbnailSkipped++ }
                    "dryrun"  { $dryRunCount++; $thumbnailDryRunCount++ }
                }
            }
        }
    }
    catch {
        Add-ReportLine "  ERROR creating/uploading thumbnail: $($_.Exception.Message)"
        $errors++
        $thumbnailErrors++
    }
}

Add-ReportLine ""
Add-ReportLine "Summary"
Add-ReportLine "- instagram gallery items found: $instagramGalleryItems"
Add-ReportLine "- upload files planned: $plannedUploads"
Add-ReportLine "- raw upload files planned: $rawUploadsPlanned"
Add-ReportLine "- thumbnail upload files planned: $thumbnailUploadsPlanned"
Add-ReportLine "- uploaded: $uploaded"
Add-ReportLine "- raw uploaded: $rawUploaded"
Add-ReportLine "- thumbnail uploaded: $thumbnailUploaded"
Add-ReportLine "- skipped existing blobs: $skipped"
Add-ReportLine "- raw skipped existing blobs: $rawSkipped"
Add-ReportLine "- thumbnail skipped existing blobs: $thumbnailSkipped"
Add-ReportLine "- dry run uploads: $dryRunCount"
Add-ReportLine "- raw dry run uploads: $rawDryRunCount"
Add-ReportLine "- thumbnail dry run uploads: $thumbnailDryRunCount"
Add-ReportLine "- thumbnails created: $thumbnailsCreated"
Add-ReportLine "- thumbnails already existed: $thumbnailsAlreadyExist"
Add-ReportLine "- thumbnail dry run creates: $thumbnailDryRunCreates"
Add-ReportLine "- video thumbnails skipped: $videoThumbnailsSkipped"
Add-ReportLine "- unsupported thumbnails: $unsupportedThumbnails"
Add-ReportLine "- thumbnail errors: $thumbnailErrors"
Add-ReportLine "- missing local media files: $missingLocalFiles"
Add-ReportLine "- incomplete gallery items: $incompleteItems"
Add-ReportLine "- duplicate blob references: $duplicateBlobReferences"
Add-ReportLine "- errors: $errors"
Add-ReportLine "- total raw bytes planned: $totalRawBytes"

$reportDirectory = Split-Path $ReportFullPath -Parent
if (-not (Test-Path -LiteralPath $reportDirectory)) {
    New-Item -ItemType Directory -Path $reportDirectory | Out-Null
}

$ReportLines | Set-Content -LiteralPath $ReportFullPath -Encoding UTF8

Write-Host ""
Write-Host "Report written: $ReportFullPath" -ForegroundColor Green
