param(
    [string]$GalleryPath = "_gallery",
    [string]$OutputPath = ".tmp/wordpress",
    [int]$ThumbMaxWidth = 300,
    [switch]$DryRun,
    [switch]$Force
)

$RepoRoot = Split-Path -Parent $PSScriptRoot

if (-not [System.IO.Path]::IsPathRooted($GalleryPath)) {
    $GalleryPath = Join-Path $RepoRoot $GalleryPath
}

if (-not [System.IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath = Join-Path $RepoRoot $OutputPath
}

Write-Host "Starting WordPress image download (dry-run=$DryRun)" -ForegroundColor Cyan
Write-Host "Repo root: $RepoRoot" -ForegroundColor Cyan
Write-Host "Gallery path: $GalleryPath" -ForegroundColor Cyan
Write-Host "Output path: $OutputPath" -ForegroundColor Cyan
Write-Host "Thumbnail max width: $ThumbMaxWidth" -ForegroundColor Cyan

function Get-FrontMatterValue {
    param([string[]]$Lines, [string]$Name)

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
    param([string[]]$Lines, [string]$Parent, [string]$Name)

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

function Test-ImageFile {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
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

        # JPG
        if ($buffer[0] -eq 0xFF -and $buffer[1] -eq 0xD8) { return $true }

        # PNG
        if ($buffer[0] -eq 0x89 -and $buffer[1] -eq 0x50 -and $buffer[2] -eq 0x4E -and $buffer[3] -eq 0x47) { return $true }

        # GIF
        if ($buffer[0] -eq 0x47 -and $buffer[1] -eq 0x49 -and $buffer[2] -eq 0x46) { return $true }

        # BMP
        if ($buffer[0] -eq 0x42 -and $buffer[1] -eq 0x4D) { return $true }

        return $false
    }
    finally {
        if ($stream) { $stream.Dispose() }
    }
}

function Invoke-ImageDownload {
    param(
        [string]$Uri,
        [string]$OutFile
    )

    $directory = Split-Path $OutFile -Parent
    if (-not (Test-Path $directory)) {
        New-Item -ItemType Directory -Path $directory | Out-Null
    }

    Invoke-WebRequest `
        -Uri $Uri `
        -OutFile $OutFile `
        -MaximumRedirection 5 `
        -Headers @{ "User-Agent" = "Mozilla/5.0" } | Out-Null

    if (-not (Test-ImageFile -Path $OutFile)) {
        $preview = ""

        try {
            $preview = Get-Content -Path $OutFile -TotalCount 5 -ErrorAction Stop | Out-String
        }
        catch {
            $preview = "Unable to read file preview."
        }

        throw "Downloaded file is not a recognized image. Path=$OutFile Preview=$preview"
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
        if (-not (Test-Path $directory)) {
            New-Item -ItemType Directory -Path $directory | Out-Null
        }

        $jpgCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
            Where-Object { $_.MimeType -eq "image/jpeg" }

        $encoder = [System.Drawing.Imaging.Encoder]::Quality
        $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($encoder, 85L)

        $thumb.Save($OutputPath, $jpgCodec, $encoderParams)
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
            if (-not (Test-ImageFile -Path $rawPath)) {
                Write-Host "Existing raw file is invalid; re-downloading: $rawPath" -ForegroundColor Yellow
                Invoke-ImageDownload -Uri $sourceUrl -OutFile $rawPath
                Write-Host "Downloaded: $rawPath" -ForegroundColor Green
                $downloaded++
            }
            else {
                Write-Host "Raw exists, skipping download: $rawPath" -ForegroundColor DarkGray
                $skipped++
            }
        }
        else {
            Invoke-ImageDownload -Uri $sourceUrl -OutFile $rawPath
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