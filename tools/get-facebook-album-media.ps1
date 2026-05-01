param(
    [string]$ExportPath = ".facebook",
    [string]$GalleryPath = "_gallery",
    [string]$OutputPath = ".tmp/facebook",
    [string]$ReportPath = "tools/facebook-album-media-report.txt",
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

function Get-LocalMediaPath {
    param(
        [string]$ExportRoot,
        [string]$SourceUri
    )

    if ([string]::IsNullOrWhiteSpace($SourceUri)) {
        return $null
    }

    $relativeUri = (($SourceUri -split '\?')[0] -replace '\\', '/') -replace '^[\/]+', ''
    $relativePath = $relativeUri -replace '/', [System.IO.Path]::DirectorySeparatorChar
    return [System.IO.Path]::GetFullPath((Join-Path $ExportRoot $relativePath))
}

function Get-MediaTypeFromPath {
    param([string]$Path)

    switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        ".jpg"  { return "image" }
        ".jpeg" { return "image" }
        ".png"  { return "image" }
        ".webp" { return "image" }
        ".gif"  { return "image" }
        ".mp4"  { return "video" }
        ".mov"  { return "video" }
        default { return "unknown" }
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
        if ($buffer[0] -eq 0x52 -and $buffer[1] -eq 0x49 -and $buffer[2] -eq 0x46 -and $buffer[8] -eq 0x57 -and $buffer[9] -eq 0x45 -and $buffer[10] -eq 0x42 -and $buffer[11] -eq 0x50) { return $true }

        return $false
    }
    finally {
        if ($stream) {
            $stream.Dispose()
        }
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

        $directory = Split-Path $OutputPath -Parent
        if (-not (Test-Path -LiteralPath $directory)) {
            New-Item -ItemType Directory -Path $directory | Out-Null
        }

        $extension = [System.IO.Path]::GetExtension($OutputPath).ToLowerInvariant()
        switch ($extension) {
            ".png" {
                $thumb.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
            }
            ".gif" {
                $thumb.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Gif)
            }
            default {
                $jpgCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
                    Where-Object { $_.MimeType -eq "image/jpeg" } |
                    Select-Object -First 1
                $encoder = [System.Drawing.Imaging.Encoder]::Quality
                $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
                $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($encoder, 85L)
                $thumb.Save($OutputPath, $jpgCodec, $encoderParams)
            }
        }
    }
    finally {
        if ($graphics) { $graphics.Dispose() }
        if ($thumb) { $thumb.Dispose() }
        if ($image) { $image.Dispose() }
    }
}

function Get-FacebookAlbumGalleryItems {
    param(
        [string]$GalleryRoot,
        [string]$ExportRoot
    )

    $items = New-Object System.Collections.Generic.List[object]
    $galleryFiles = @(Get-ChildItem -LiteralPath $GalleryRoot -Filter "*.md" -File)

    foreach ($file in $galleryFiles) {
        try {
            $frontMatter = Get-FrontMatterLines -Path $file.FullName
            $sourceType = Get-NestedFrontMatterValue -Lines $frontMatter -Parent "source" -Name "type"
            $sourceSubtype = Get-NestedFrontMatterValue -Lines $frontMatter -Parent "source" -Name "subtype"

            if ($sourceType -ne "facebook" -or $sourceSubtype -ne "album") {
                continue
            }

            $sourceUri = Get-NestedFrontMatterValue -Lines $frontMatter -Parent "source" -Name "uri"
            $sourceFileName = Get-FrontMatterValue -Lines $frontMatter -Name "source_filename"
            $takenAt = Get-FrontMatterValue -Lines $frontMatter -Name "taken_at"
            $mediaType = Get-FrontMatterValue -Lines $frontMatter -Name "media_type"
            $postId = Get-FrontMatterValue -Lines $frontMatter -Name "post_id"

            $sourcePath = Get-LocalMediaPath -ExportRoot $ExportRoot -SourceUri $sourceUri
            if ([string]::IsNullOrWhiteSpace($mediaType) -and -not [string]::IsNullOrWhiteSpace($sourceFileName)) {
                $mediaType = Get-MediaTypeFromPath -Path $sourceFileName
            }

            [void]$items.Add([pscustomobject]@{
                GalleryPath = $file.FullName
                SourceUri = $sourceUri
                SourcePath = $sourcePath
                SourceFileName = $sourceFileName
                TakenAt = $takenAt
                MediaType = $mediaType
                PostId = $postId
                Error = $null
            })
        }
        catch {
            [void]$items.Add([pscustomobject]@{
                GalleryPath = $file.FullName
                SourceUri = $null
                SourcePath = $null
                SourceFileName = $null
                TakenAt = $null
                MediaType = $null
                PostId = $null
                Error = $_.Exception.Message
            })
        }
    }

    return $items.ToArray()
}

$ExportRoot = Resolve-RepoPath -Path $ExportPath
$GalleryRoot = Resolve-RepoPath -Path $GalleryPath
$OutputRoot = Resolve-RepoPath -Path $OutputPath
$ReportFullPath = Resolve-RepoPath -Path $ReportPath

if (-not (Test-Path -LiteralPath $ExportRoot -PathType Container)) {
    throw "Export path not found: $ExportRoot"
}

if (-not (Test-Path -LiteralPath $GalleryRoot -PathType Container)) {
    throw "Gallery path not found: $GalleryRoot"
}

Add-ReportLine "Facebook Album Media Report"
Add-ReportLine "Generated: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz'))"
Add-ReportLine "Repo root: $RepoRoot"
Add-ReportLine "Export path: $ExportRoot"
Add-ReportLine "Gallery path: $GalleryRoot"
Add-ReportLine "Output path: $OutputRoot"
Add-ReportLine "Thumbnail max width: $ThumbMaxWidth"
Add-ReportLine "Dry run: $DryRun"
Add-ReportLine "Force: $Force"
Add-ReportLine ""

$galleryFilesScanned = @(Get-ChildItem -LiteralPath $GalleryRoot -Filter "*.md" -File).Count
$items = @(Get-FacebookAlbumGalleryItems -GalleryRoot $GalleryRoot -ExportRoot $ExportRoot)
$rawCopyPlanned = 0
$rawFilesCopied = 0
$rawFilesSkipped = 0
$thumbnailsPlanned = 0
$thumbnailsCreated = 0
$thumbnailsSkipped = 0
$videosCopied = 0
$videoThumbnailsSkipped = 0
$missingSourceMedia = 0
$incompleteItems = 0
$errors = 0

foreach ($item in $items) {
    if ($item.Error) {
        $errors++
        Add-ReportLine "Gallery item parse error: $(Get-RelativeDisplayPath -Path $item.GalleryPath)"
        Add-ReportLine "  ERROR: $($item.Error)"
        continue
    }

    if ([string]::IsNullOrWhiteSpace($item.SourceUri) -or
        [string]::IsNullOrWhiteSpace($item.SourceFileName) -or
        [string]::IsNullOrWhiteSpace($item.TakenAt)) {
        $incompleteItems++
        Add-ReportLine "Incomplete Facebook album gallery item, skipping: $(Get-RelativeDisplayPath -Path $item.GalleryPath)"
        Add-ReportLine "  Source URI: $($item.SourceUri)"
        Add-ReportLine "  Source filename: $($item.SourceFileName)"
        Add-ReportLine "  taken_at: $($item.TakenAt)"
        continue
    }

    if (-not (Test-Path -LiteralPath $item.SourcePath)) {
        $missingSourceMedia++
        Add-ReportLine "Missing source media: $(Get-RelativeDisplayPath -Path $item.GalleryPath)"
        Add-ReportLine "  Source URI: $($item.SourceUri)"
        Add-ReportLine "  Expected path: $($item.SourcePath)"
        continue
    }

    try {
        $date = [datetime]::Parse($item.TakenAt)
        $year = $date.ToString("yyyy")
        $month = $date.ToString("MM")
        $day = $date.ToString("dd")
        $rawDirectory = Join-Path $OutputRoot (Join-Path "raw" (Join-Path $year (Join-Path $month $day)))
        $thumbDirectory = Join-Path $OutputRoot (Join-Path "thumbs" (Join-Path $year (Join-Path $month $day)))
        $rawPath = Join-Path $rawDirectory $item.SourceFileName
        $thumbPath = Join-Path $thumbDirectory $item.SourceFileName
        $mediaType = $item.MediaType
        if ([string]::IsNullOrWhiteSpace($mediaType)) {
            $mediaType = Get-MediaTypeFromPath -Path $item.SourceFileName
        }

        $rawCopyPlanned++
        Add-ReportLine "Facebook album media item"
        Add-ReportLine "  Gallery item: $(Get-RelativeDisplayPath -Path $item.GalleryPath)"
        Add-ReportLine "  Post ID: $($item.PostId)"
        Add-ReportLine "  Source URI: $($item.SourceUri)"
        Add-ReportLine "  Source path: $($item.SourcePath)"
        Add-ReportLine "  Raw output: $(Get-RelativeDisplayPath -Path $rawPath)"
        Add-ReportLine "  Thumb output: $(Get-RelativeDisplayPath -Path $thumbPath)"
        Add-ReportLine "  Media type: $mediaType"

        if ($DryRun) {
            Add-ReportLine "  DRY RUN: Would copy raw file."
        }
        elseif ((Test-Path -LiteralPath $rawPath) -and -not $Force) {
            $rawFilesSkipped++
            Add-ReportLine "  Raw file exists, skipping copy."
        }
        else {
            if (-not (Test-Path -LiteralPath $rawDirectory)) {
                New-Item -ItemType Directory -Path $rawDirectory | Out-Null
            }

            Copy-Item -LiteralPath $item.SourcePath -Destination $rawPath -Force
            $rawFilesCopied++
            Add-ReportLine "  Copied raw file."
        }

        if ($mediaType -eq "video") {
            if (-not $DryRun) {
                $videosCopied++
            }
            $videoThumbnailsSkipped++
            Add-ReportLine "  Video thumbnail skipped."
            continue
        }

        if ($mediaType -ne "image") {
            Add-ReportLine "  Unsupported media type for thumbnail: $mediaType"
            continue
        }

        $thumbnailInput = if ($DryRun) { $item.SourcePath } else { $rawPath }
        if (-not (Test-ImageFile -Path $thumbnailInput)) {
            $errors++
            Add-ReportLine "  ERROR: Image validation failed before thumbnailing: $thumbnailInput"
            continue
        }

        $thumbnailsPlanned++
        if ($DryRun) {
            Add-ReportLine "  DRY RUN: Would create thumbnail."
        }
        elseif ((Test-Path -LiteralPath $thumbPath) -and -not $Force) {
            $thumbnailsSkipped++
            Add-ReportLine "  Thumbnail exists, skipping."
        }
        else {
            New-Thumbnail -InputPath $thumbnailInput -OutputPath $thumbPath -MaxWidth $ThumbMaxWidth
            $thumbnailsCreated++
            Add-ReportLine "  Created thumbnail."
        }
    }
    catch {
        $errors++
        Add-ReportLine "  ERROR: $($_.Exception.Message)"
    }
}

Add-ReportLine ""
Add-ReportLine "Summary"
Add-ReportLine "======="
Add-ReportLine "Gallery files scanned: $galleryFilesScanned"
Add-ReportLine "Facebook album items: $($items.Count)"
Add-ReportLine "Raw copy planned: $rawCopyPlanned"
Add-ReportLine "Raw files copied: $rawFilesCopied"
Add-ReportLine "Raw files skipped: $rawFilesSkipped"
Add-ReportLine "Thumbnails planned: $thumbnailsPlanned"
Add-ReportLine "Thumbnails created: $thumbnailsCreated"
Add-ReportLine "Thumbnails skipped: $thumbnailsSkipped"
Add-ReportLine "Videos copied: $videosCopied"
Add-ReportLine "Video thumbnails skipped: $videoThumbnailsSkipped"
Add-ReportLine "Missing source media: $missingSourceMedia"
Add-ReportLine "Incomplete items: $incompleteItems"
Add-ReportLine "Errors: $errors"

$reportDirectory = Split-Path $ReportFullPath -Parent
if (-not (Test-Path -LiteralPath $reportDirectory)) {
    New-Item -ItemType Directory -Path $reportDirectory | Out-Null
}

$ReportLines | Set-Content -LiteralPath $ReportFullPath -Encoding UTF8

Write-Host "Facebook album media preparation complete." -ForegroundColor Green
Write-Host "Report: $(Get-RelativeDisplayPath -Path $ReportFullPath)"
Write-Host "Gallery files scanned: $galleryFilesScanned"
Write-Host "Facebook album items: $($items.Count)"
Write-Host "Raw copy planned: $rawCopyPlanned"
Write-Host "Raw files copied: $rawFilesCopied"
Write-Host "Thumbnails planned: $thumbnailsPlanned"
Write-Host "Thumbnails created: $thumbnailsCreated"
Write-Host "Videos copied: $videosCopied"
Write-Host "Video thumbnails skipped: $videoThumbnailsSkipped"
Write-Host "Missing source media: $missingSourceMedia"
Write-Host "Errors: $errors"
if ($DryRun) {
    Write-Host "Dry run only; no media files were copied and no thumbnails were created." -ForegroundColor Yellow
}
