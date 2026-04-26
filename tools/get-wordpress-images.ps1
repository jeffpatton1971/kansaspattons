param(
    [string]$GalleryPath = "_gallery",
    [string]$OutputPath = ".tmp/wordpress",
    [int]$ThumbMaxWidth = 300,
    [switch]$DryRun,
    [switch]$Force
)

Write-Host "Starting WordPress image download (dry-run=$DryRun)" -ForegroundColor Cyan
Write-Host "Gallery path: $GalleryPath" -ForegroundColor Cyan
Write-Host "Output path: $OutputPath" -ForegroundColor Cyan
Write-Host "Thumbnail max width: $ThumbMaxWidth" -ForegroundColor Cyan

function Get-FrontMatterValue {
    param(
        [string[]]$Lines,
        [string]$Name
    )

    $pattern = '^' + [regex]::Escape($Name) + ':\s*(.*)$'

    foreach ($line in $Lines) {
        if ($line -match $pattern) {
            $value = $matches[1].Trim()
            $value = $value -replace '^"|"$', ''
            return $value
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
            $value = $matches[1].Trim()
            $value = $value -replace '^"|"$', ''
            return $value
        }
    }

    return $null
}

function Get-ImageFormat {
    param([string]$Path)

    $extension = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()

    switch ($extension) {
        ".png"  { return [System.Drawing.Imaging.ImageFormat]::Png }
        ".gif"  { return [System.Drawing.Imaging.ImageFormat]::Gif }
        ".bmp"  { return [System.Drawing.Imaging.ImageFormat]::Bmp }
        default { return [System.Drawing.Imaging.ImageFormat]::Jpeg }
    }
}

function New-Thumbnail {
    param(
        [string]$InputPath,
        [string]$OutputPath,
        [int]$MaxWidth
    )

    Add-Type -AssemblyName System.Drawing

    $image = $null
    $thumb = $null
    $graphics = $null

    try {
        $image = [System.Drawing.Image]::FromFile($InputPath)

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
        if (-not (Test-Path $directory)) {
            New-Item -ItemType Directory -Path $directory | Out-Null
        }

        $format = Get-ImageFormat -Path $OutputPath
        $thumb.Save($OutputPath, $format)
    }
    finally {
        if ($graphics) { $graphics.Dispose() }
        if ($thumb) { $thumb.Dispose() }
        if ($image) { $image.Dispose() }
    }
}

if (-not (Test-Path $GalleryPath)) {
    throw "Gallery path not found: $GalleryPath"
}

$galleryFiles = Get-ChildItem -Path $GalleryPath -Filter "*.md" -File
$totalFiles = 0
$wordpressFiles = 0
$downloaded = 0
$skipped = 0
$thumbsCreated = 0
$errors = 0

foreach ($file in $galleryFiles) {
    $totalFiles++
    $content = Get-Content -Path $file.FullName

    $sourceType = Get-NestedFrontMatterValue -Lines $content -Parent "source" -Name "type"
    if ($sourceType -ne "wordpress") {
        continue
    }

    $wordpressFiles++

    $sourceUrl = Get-NestedFrontMatterValue -Lines $content -Parent "source" -Name "url"
    $sourceFileName = Get-FrontMatterValue -Lines $content -Name "source_filename"
    $takenAt = Get-FrontMatterValue -Lines $content -Name "taken_at"

    if ([string]::IsNullOrWhiteSpace($sourceUrl) -or [string]::IsNullOrWhiteSpace($sourceFileName) -or [string]::IsNullOrWhiteSpace($takenAt)) {
        Write-Host "Skipping incomplete gallery item: $($file.Name)" -ForegroundColor Yellow
        $skipped++
        continue
    }

    try {
        $date = [datetime]::Parse($takenAt)
        $year = $date.ToString("yyyy")
        $month = $date.ToString("MM")
        $day = $date.ToString("dd")

        $rawDirectory = Join-Path $OutputPath (Join-Path "raw" (Join-Path $year (Join-Path $month $day)))
        $thumbDirectory = Join-Path $OutputPath (Join-Path "thumbs" (Join-Path $year (Join-Path $month $day)))
        $rawPath = Join-Path $rawDirectory $sourceFileName
        $thumbPath = Join-Path $thumbDirectory $sourceFileName

        if ($DryRun) {
            Write-Host "DRY RUN: Would process image:"
            Write-Host "  Gallery item: $($file.Name)"
            Write-Host "  Source: $sourceUrl"
            Write-Host "  Raw: $rawPath"
            Write-Host "  Thumb: $thumbPath"
            continue
        }

        if ((Test-Path $rawPath) -and -not $Force) {
            Write-Host "Raw exists, skipping download: $rawPath" -ForegroundColor DarkGray
            $skipped++
        }
        else {
            if (-not (Test-Path $rawDirectory)) {
                New-Item -ItemType Directory -Path $rawDirectory | Out-Null
            }

            Invoke-WebRequest -Uri $sourceUrl -OutFile $rawPath
            Write-Host "Downloaded: $rawPath" -ForegroundColor Green
            $downloaded++
        }

        if ((Test-Path $thumbPath) -and -not $Force) {
            Write-Host "Thumb exists, skipping: $thumbPath" -ForegroundColor DarkGray
            $skipped++
        }
        else {
            New-Thumbnail -InputPath $rawPath -OutputPath $thumbPath -MaxWidth $ThumbMaxWidth
            Write-Host "Created thumb: $thumbPath" -ForegroundColor Green
            $thumbsCreated++
        }
    }
    catch {
        Write-Host "ERROR processing $($file.Name): $($_.Exception.Message)" -ForegroundColor Red
        $errors++
    }
}

Write-Host "`n===== SUMMARY =====" -ForegroundColor Cyan
Write-Host "Gallery files scanned: $totalFiles"
Write-Host "WordPress gallery files: $wordpressFiles"
Write-Host "Downloaded originals: $downloaded"
Write-Host "Thumbnails created: $thumbsCreated"
Write-Host "Skipped: $skipped"
Write-Host "Errors: $errors"
