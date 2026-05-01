param(
    [string]$ExportPath = ".facebook",
    [string]$AlbumPath = "your_facebook_activity/posts/album",
    [string]$PostOutputPath = "_posts",
    [string]$GalleryOutputPath = "_gallery",
    [string]$ReportPath = "tools/facebook-album-import-report.txt",
    [string]$StorageAccountBaseUrl = "https://prdwebappstorage.blob.core.windows.net/kansaspattons",
    [switch]$DryRun,
    [switch]$WritePosts,
    [switch]$WriteGalleryItems,
    [switch]$Force
)

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ReportLines = New-Object System.Collections.Generic.List[string]
$ReservedPostIds = @{}
$ReservedGalleryKeys = @{}
$ReservedGalleryPaths = @{}

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

function Escape-YamlString {
    param([string]$Value)

    if ($null -eq $Value) {
        return '""'
    }

    $safe = $Value
    $safe = $safe.Replace('\', '\\')
    $safe = $safe.Replace('"', '\"')
    $safe = $safe.Replace("`r", '\r')
    $safe = $safe.Replace("`n", '\n')
    $safe = $safe.Replace("`t", '\t')

    return '"' + $safe + '"'
}

function Convert-ToMarkdownSafeText {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return ""
    }

    $safe = $Value
    $safe = $safe -replace '&', '&amp;'
    $safe = $safe -replace '<', '&lt;'
    $safe = $safe -replace '>', '&gt;'
    $safe = $safe -replace "`r`n", "`n"
    $safe = $safe -replace "`r", "`n"

    return $safe.Trim()
}

function Convert-ToSlug {
    param(
        [string]$Text,
        [int]$MaxLength = 80
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return ""
    }

    $slug = [System.Net.WebUtility]::HtmlDecode($Text).ToLowerInvariant()
    $slug = $slug -replace '&', ' and '
    $slug = $slug -replace '[^a-z0-9]+', '-'
    $slug = $slug -replace '^-|-$', ''

    if ($slug.Length -gt $MaxLength) {
        $slug = $slug.Substring(0, $MaxLength)
        $slug = $slug -replace '-[^-]*$', ''
        $slug = $slug -replace '^-|-$', ''
    }

    return $slug
}

function Convert-UnixTimestamp {
    param([object]$Timestamp)

    if ($null -eq $Timestamp -or [string]::IsNullOrWhiteSpace([string]$Timestamp)) {
        return $null
    }

    try {
        $number = [int64]$Timestamp
        if ($number -le 0) {
            return $null
        }

        if ($number -gt 9999999999) {
            return [DateTimeOffset]::FromUnixTimeMilliseconds($number).LocalDateTime
        }

        return [DateTimeOffset]::FromUnixTimeSeconds($number).LocalDateTime
    }
    catch {
        return $null
    }
}

function Format-YamlDateTime {
    param([datetime]$Date)

    return $Date.ToString("yyyy-MM-dd HH:mm:ss")
}

function Get-ObjectProperty {
    param(
        [object]$Value,
        [string[]]$Names
    )

    if ($null -eq $Value -or $null -eq $Value.PSObject) {
        return $null
    }

    foreach ($name in $Names) {
        $property = $Value.PSObject.Properties | Where-Object { $_.Name -ieq $name } | Select-Object -First 1
        if ($null -ne $property -and $null -ne $property.Value) {
            return $property.Value
        }
    }

    return $null
}

function Get-UniqueValue {
    param(
        [string]$Value,
        [hashtable]$ReservedValues
    )

    $candidate = $Value
    $counter = 2

    while ($ReservedValues.ContainsKey($candidate.ToLowerInvariant())) {
        $candidate = "$Value-$counter"
        $counter++
    }

    $ReservedValues[$candidate.ToLowerInvariant()] = $true
    return $candidate
}

function Get-UniquePath {
    param(
        [string]$Path,
        [hashtable]$ReservedPaths
    )

    $directory = Split-Path $Path -Parent
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($Path)
    $extension = [System.IO.Path]::GetExtension($Path)
    $candidate = $Path
    $counter = 2

    while ($ReservedPaths.ContainsKey($candidate.ToLowerInvariant())) {
        $candidate = Join-Path $directory "$baseName-$counter$extension"
        $counter++
    }

    $ReservedPaths[$candidate.ToLowerInvariant()] = $true
    return $candidate
}

function Get-LocalMediaPath {
    param(
        [string]$ExportRoot,
        [string]$Uri
    )

    if ([string]::IsNullOrWhiteSpace($Uri)) {
        return $null
    }

    $relativeUri = (($Uri -split '\?')[0] -replace '\\', '/') -replace '^[\/]+', ''
    $relativePath = $relativeUri -replace '/', [System.IO.Path]::DirectorySeparatorChar
    return [System.IO.Path]::GetFullPath((Join-Path $ExportRoot $relativePath))
}

function Get-MediaType {
    param([string]$PathOrUri)

    $extension = [System.IO.Path]::GetExtension(($PathOrUri -split '\?')[0]).ToLowerInvariant()

    switch ($extension) {
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

function Get-MediaTimestamp {
    param([object]$Media)

    $candidates = New-Object System.Collections.Generic.List[object]

    foreach ($propertyName in @("creation_timestamp", "timestamp", "timestamp_ms")) {
        $timestamp = Get-ObjectProperty -Value $Media -Names @($propertyName)
        if ($null -ne $timestamp) {
            [void]$candidates.Add($timestamp)
        }
    }

    $metadata = Get-ObjectProperty -Value $Media -Names @("media_metadata")
    $photoMetadata = Get-ObjectProperty -Value $metadata -Names @("photo_metadata")
    $exifData = Get-ObjectProperty -Value $photoMetadata -Names @("exif_data")
    if ($null -ne $exifData) {
        foreach ($exif in @($exifData)) {
            foreach ($propertyName in @("taken_timestamp", "creation_timestamp", "timestamp", "timestamp_ms")) {
                $timestamp = Get-ObjectProperty -Value $exif -Names @($propertyName)
                if ($null -ne $timestamp) {
                    [void]$candidates.Add($timestamp)
                }
            }
        }
    }

    $chosen = $null
    $chosenDate = $null

    foreach ($candidate in $candidates) {
        $candidateDate = Convert-UnixTimestamp -Timestamp $candidate
        if ($null -eq $candidateDate) {
            continue
        }

        if ($null -eq $chosenDate -or $candidateDate -lt $chosenDate) {
            $chosen = $candidate
            $chosenDate = $candidateDate
        }
    }

    return $chosen
}

function Get-AlbumMediaItems {
    param([object]$Album)

    $items = New-Object System.Collections.Generic.List[object]

    foreach ($propertyName in @("photos", "videos", "media")) {
        $values = Get-ObjectProperty -Value $Album -Names @($propertyName)
        if ($null -eq $values -or $values -is [string]) {
            continue
        }

        foreach ($value in @($values)) {
            $uri = Get-ObjectProperty -Value $value -Names @("uri")
            if (-not [string]::IsNullOrWhiteSpace($uri)) {
                [void]$items.Add($value)
            }
        }
    }

    return $items.ToArray()
}

function Get-BlobPlan {
    param(
        [string]$StorageAccountBaseUrl,
        [datetime]$Date,
        [string]$MediaUri
    )

    $normalizedUri = (($MediaUri -split '\?')[0]) -replace '\\', '/'
    $fileName = [System.IO.Path]::GetFileName($normalizedUri)
    if ([string]::IsNullOrWhiteSpace($fileName)) {
        $fileName = "facebook-media"
    }

    $year = $Date.ToString("yyyy")
    $month = $Date.ToString("MM")
    $day = $Date.ToString("dd")
    $baseUrl = $StorageAccountBaseUrl.TrimEnd("/")
    $rawBlobPath = "images/facebook/$year/$month/$day/$fileName"
    $thumbBlobPath = "thumbs/facebook/$year/$month/$day/$fileName"

    return [pscustomobject]@{
        FileName = $fileName
        RawBlobPath = $rawBlobPath
        ThumbBlobPath = $thumbBlobPath
        RawUrl = "$baseUrl/$rawBlobPath"
        ThumbUrl = "$baseUrl/$thumbBlobPath"
    }
}

function Get-BlogPostUrl {
    param(
        [datetime]$Date,
        [string]$PostId
    )

    $blogSlug = $PostId.Substring(11)
    return "/blog/$($Date.ToString('yyyy'))/$($Date.ToString('MM'))/$($Date.ToString('dd'))/$blogSlug.html"
}

function New-PostFileContent {
    param(
        [string]$Title,
        [datetime]$Date,
        [string]$PostId,
        [string]$AlbumFile,
        [string]$Description,
        [int]$MediaCount,
        [datetime]$DateStart,
        [datetime]$DateEnd,
        [string]$GalleryKey
    )

    $lines = New-Object System.Collections.Generic.List[string]
    [void]$lines.Add("---")
    [void]$lines.Add("layout: single")
    [void]$lines.Add("title: $(Escape-YamlString -Value $Title)")
    [void]$lines.Add("date: $(Format-YamlDateTime -Date $Date)")
    [void]$lines.Add("published: true")
    [void]$lines.Add("comments: false")
    [void]$lines.Add("post_id: $PostId")
    [void]$lines.Add("source:")
    [void]$lines.Add("  type: facebook")
    [void]$lines.Add("  subtype: album")
    [void]$lines.Add("  file: $(Escape-YamlString -Value $AlbumFile)")
    [void]$lines.Add("album:")
    [void]$lines.Add("  title: $(Escape-YamlString -Value $Title)")
    if (-not [string]::IsNullOrWhiteSpace($Description)) {
        [void]$lines.Add("  description: $(Escape-YamlString -Value $Description)")
    }
    [void]$lines.Add("  media_count: $MediaCount")
    [void]$lines.Add("  date_start: $(Format-YamlDateTime -Date $DateStart)")
    [void]$lines.Add("  date_end: $(Format-YamlDateTime -Date $DateEnd)")
    [void]$lines.Add("categories:")
    [void]$lines.Add("  - facebook")
    [void]$lines.Add("  - album")
    [void]$lines.Add("tags: []")
    [void]$lines.Add("gallery: $GalleryKey")
    [void]$lines.Add("---")
    [void]$lines.Add("")

    if (-not [string]::IsNullOrWhiteSpace($Description)) {
        [void]$lines.Add((Convert-ToMarkdownSafeText -Value $Description))
        [void]$lines.Add("")
    }

    [void]$lines.Add("{% include gallery.html gallery=`"$GalleryKey`" %}")
    [void]$lines.Add("")

    return $lines -join "`n"
}

function New-GalleryItemFileContent {
    param(
        [datetime]$Date,
        [string]$Title,
        [string]$GalleryKey,
        [string]$PostId,
        [string]$ItemId,
        [string]$AlbumFile,
        [string]$MediaUri,
        [object]$Timestamp,
        [string]$SourceFileName,
        [string]$RawUrl,
        [string]$ThumbUrl,
        [string]$PostUrl,
        [int]$Index,
        [string]$MediaType
    )

    $lines = New-Object System.Collections.Generic.List[string]
    [void]$lines.Add("---")
    [void]$lines.Add("layout: item")
    [void]$lines.Add("id: $ItemId")
    [void]$lines.Add("title: $(Escape-YamlString -Value $Title)")
    [void]$lines.Add("description:")
    [void]$lines.Add("tags: []")
    [void]$lines.Add("taken_at: $($Date.ToString('yyyy-MM-dd'))")
    [void]$lines.Add("year: $($Date.ToString('yyyy'))")
    [void]$lines.Add("month: $($Date.ToString('MM'))")
    [void]$lines.Add("day: $($Date.ToString('dd'))")
    [void]$lines.Add("weekday: $($Date.ToString('dddd'))")
    [void]$lines.Add("gallery: $GalleryKey")
    [void]$lines.Add("post_id: $PostId")
    [void]$lines.Add("source:")
    [void]$lines.Add("  type: facebook")
    [void]$lines.Add("  subtype: album")
    [void]$lines.Add("  album_title: $(Escape-YamlString -Value $Title)")
    [void]$lines.Add("  album_file: $(Escape-YamlString -Value $AlbumFile)")
    [void]$lines.Add("  uri: $(Escape-YamlString -Value $MediaUri)")
    if ($null -ne $Timestamp -and -not [string]::IsNullOrWhiteSpace([string]$Timestamp)) {
        [void]$lines.Add("  timestamp: $Timestamp")
    }
    [void]$lines.Add("source_filename: $(Escape-YamlString -Value $SourceFileName)")
    [void]$lines.Add("raw_url: $(Escape-YamlString -Value $RawUrl)")
    [void]$lines.Add("thumb_url: $(Escape-YamlString -Value $ThumbUrl)")
    [void]$lines.Add("post: $(Escape-YamlString -Value $PostUrl)")
    [void]$lines.Add("index: $Index")
    [void]$lines.Add("media_type: $MediaType")
    [void]$lines.Add("---")
    [void]$lines.Add("")

    return $lines -join "`n"
}

function Write-TextFile {
    param(
        [string]$Path,
        [string]$Content
    )

    $directory = Split-Path $Path -Parent
    if (-not (Test-Path -LiteralPath $directory)) {
        New-Item -ItemType Directory -Path $directory | Out-Null
    }

    Set-Content -LiteralPath $Path -Value $Content -Encoding UTF8
}

$ExportRoot = Resolve-RepoPath -Path $ExportPath
$AlbumRoot = if ([System.IO.Path]::IsPathRooted($AlbumPath)) {
    [System.IO.Path]::GetFullPath($AlbumPath)
}
else {
    [System.IO.Path]::GetFullPath((Join-Path $ExportRoot ($AlbumPath -replace '/', [System.IO.Path]::DirectorySeparatorChar)))
}
$PostRoot = Resolve-RepoPath -Path $PostOutputPath
$GalleryRoot = Resolve-RepoPath -Path $GalleryOutputPath
$ReportFullPath = Resolve-RepoPath -Path $ReportPath
$effectiveDryRun = $DryRun -or (-not $WritePosts -and -not $WriteGalleryItems)

if (-not (Test-Path -LiteralPath $ExportRoot -PathType Container)) {
    throw "Export path not found: $ExportRoot"
}

if (-not (Test-Path -LiteralPath $AlbumRoot -PathType Container)) {
    throw "Album path not found: $AlbumRoot"
}

Add-ReportLine "Facebook Album Import Report"
Add-ReportLine "Generated: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz'))"
Add-ReportLine "Repo root: $RepoRoot"
Add-ReportLine "Export path: $ExportRoot"
Add-ReportLine "Album path: $AlbumRoot"
Add-ReportLine "Post output path: $PostRoot"
Add-ReportLine "Gallery output path: $GalleryRoot"
Add-ReportLine "Storage account base URL: $StorageAccountBaseUrl"
Add-ReportLine "Dry run: $effectiveDryRun"
Add-ReportLine "Write posts: $WritePosts"
Add-ReportLine "Write gallery items: $WriteGalleryItems"
Add-ReportLine "Force: $Force"
if (-not $WritePosts -and -not $WriteGalleryItems) {
    Add-ReportLine "WARNING: Neither -WritePosts nor -WriteGalleryItems was set. Planning only; no files will be written."
}
Add-ReportLine ""

$albumFiles = @(Get-ChildItem -LiteralPath $AlbumRoot -Filter "*.json" -File | Sort-Object -Property @{
    Expression = {
        $number = 0
        if ([int]::TryParse($_.BaseName, [ref]$number)) { $number } else { [int]::MaxValue }
    }
}, Name)

$plans = New-Object System.Collections.Generic.List[object]
$errors = 0
$totalMediaReferences = 0
$missingMedia = 0
$postFilesExisting = 0
$galleryFilesExisting = 0

foreach ($albumFile in $albumFiles) {
    try {
        $albumJson = Get-Content -LiteralPath $albumFile.FullName -Raw -Encoding UTF8 | ConvertFrom-Json -Depth 100
        $title = [string](Get-ObjectProperty -Value $albumJson -Names @("name", "title", "album_name"))
        if ([string]::IsNullOrWhiteSpace($title)) {
            $title = "Facebook Album"
        }

        $description = [string](Get-ObjectProperty -Value $albumJson -Names @("description", "caption"))
        $mediaItems = @(Get-AlbumMediaItems -Album $albumJson)
        $mediaPlans = New-Object System.Collections.Generic.List[object]
        $dates = New-Object System.Collections.Generic.List[datetime]

        foreach ($media in $mediaItems) {
            $timestamp = Get-MediaTimestamp -Media $media
            $date = Convert-UnixTimestamp -Timestamp $timestamp
            if ($null -ne $date) {
                [void]$dates.Add($date)
            }
        }

        if ($dates.Count -gt 0) {
            $sortedDates = @($dates | Sort-Object)
            $dateStart = $sortedDates[0]
            $dateEnd = $sortedDates[-1]
        }
        else {
            $dateStart = $albumFile.LastWriteTime
            $dateEnd = $albumFile.LastWriteTime
        }

        $slug = Convert-ToSlug -Text $title
        if ([string]::IsNullOrWhiteSpace($slug)) {
            $slug = "facebook-album"
        }

        $basePostId = "$($dateStart.ToString('yyyy-MM-dd-HHmmss'))-$slug"
        $postId = Get-UniqueValue -Value $basePostId -ReservedValues $ReservedPostIds
        $galleryKey = Get-UniqueValue -Value "facebook-$postId" -ReservedValues $ReservedGalleryKeys
        $postPath = Join-Path $PostRoot "$postId.md"
        $postUrl = Get-BlogPostUrl -Date $dateStart -PostId $postId
        $relativeAlbumFile = Get-RelativeDisplayPath -Path $albumFile.FullName

        $index = 0
        foreach ($media in $mediaItems) {
            $index++
            $uri = [string](Get-ObjectProperty -Value $media -Names @("uri"))
            $timestamp = Get-MediaTimestamp -Media $media
            $mediaDate = Convert-UnixTimestamp -Timestamp $timestamp
            if ($null -eq $mediaDate) {
                $mediaDate = $dateStart
            }

            $localPath = Get-LocalMediaPath -ExportRoot $ExportRoot -Uri $uri
            $exists = $false
            if (-not [string]::IsNullOrWhiteSpace($localPath)) {
                $exists = Test-Path -LiteralPath $localPath
            }

            if (-not $exists) {
                $missingMedia++
            }

            $blobPlan = Get-BlobPlan -StorageAccountBaseUrl $StorageAccountBaseUrl -Date $mediaDate -MediaUri $uri
            $mediaType = Get-MediaType -PathOrUri $uri
            $itemId = "$galleryKey-$($index.ToString('0000'))"
            $galleryPath = Join-Path $GalleryRoot "$itemId.md"
            $galleryPath = Get-UniquePath -Path $galleryPath -ReservedPaths $ReservedGalleryPaths
            $itemId = [System.IO.Path]::GetFileNameWithoutExtension($galleryPath)

            if (Test-Path -LiteralPath $galleryPath) {
                $galleryFilesExisting++
            }

            [void]$mediaPlans.Add([pscustomobject]@{
                Index = $index
                Uri = $uri
                Timestamp = $timestamp
                Date = $mediaDate
                LocalPath = $localPath
                Exists = $exists
                SourceFileName = $blobPlan.FileName
                RawUrl = $blobPlan.RawUrl
                ThumbUrl = $blobPlan.ThumbUrl
                GalleryPath = $galleryPath
                ItemId = $itemId
                MediaType = $mediaType
            })
        }

        if (Test-Path -LiteralPath $postPath) {
            $postFilesExisting++
        }

        $totalMediaReferences += $mediaPlans.Count

        [void]$plans.Add([pscustomobject]@{
            AlbumFile = $albumFile.FullName
            RelativeAlbumFile = $relativeAlbumFile
            Title = $title
            Description = $description
            DateStart = $dateStart
            DateEnd = $dateEnd
            MediaCount = $mediaPlans.Count
            PostId = $postId
            GalleryKey = $galleryKey
            PostPath = $postPath
            PostUrl = $postUrl
            Media = $mediaPlans.ToArray()
        })
    }
    catch {
        $errors++
        Add-ReportLine "ERROR reading album JSON: $(Get-RelativeDisplayPath -Path $albumFile.FullName)"
        Add-ReportLine "  $($_.Exception.Message)"
    }
}

$largestAlbum = $plans | Sort-Object MediaCount -Descending | Select-Object -First 1
$albumsOver100 = @($plans | Where-Object { $_.MediaCount -gt 100 } | Sort-Object MediaCount -Descending)

Add-ReportLine "Summary"
Add-ReportLine "======="
Add-ReportLine "Total albums: $($plans.Count)"
Add-ReportLine "Total media references: $totalMediaReferences"
Add-ReportLine "Missing media count: $missingMedia"
if ($largestAlbum) {
    Add-ReportLine "Largest album: $($largestAlbum.Title) ($($largestAlbum.MediaCount) media)"
}
else {
    Add-ReportLine "Largest album:"
}
Add-ReportLine "Albums over 100 media: $($albumsOver100.Count)"
foreach ($album in $albumsOver100) {
    Add-ReportLine "  - $($album.Title): $($album.MediaCount)"
}
Add-ReportLine "Post files that already exist: $postFilesExisting"
Add-ReportLine "Gallery files that already exist: $galleryFilesExisting"
Add-ReportLine "Errors: $errors"
Add-ReportLine ""

foreach ($plan in $plans) {
    Add-ReportLine "Album: $($plan.Title)"
    Add-ReportLine "  Album JSON: $($plan.RelativeAlbumFile)"
    Add-ReportLine "  Date start: $(Format-YamlDateTime -Date $plan.DateStart)"
    Add-ReportLine "  Date end: $(Format-YamlDateTime -Date $plan.DateEnd)"
    Add-ReportLine "  Proposed post file: $(Get-RelativeDisplayPath -Path $plan.PostPath)"
    Add-ReportLine "  Post exists: $(Test-Path -LiteralPath $plan.PostPath)"
    Add-ReportLine "  Post URL: $($plan.PostUrl)"
    Add-ReportLine "  post_id: $($plan.PostId)"
    Add-ReportLine "  Gallery key: $($plan.GalleryKey)"
    Add-ReportLine "  Media count: $($plan.MediaCount)"

    foreach ($media in $plan.Media) {
        Add-ReportLine "  Media $($media.Index)"
        Add-ReportLine "    uri: $($media.Uri)"
        Add-ReportLine "    local path: $($media.LocalPath)"
        Add-ReportLine "    exists: $($media.Exists)"
        Add-ReportLine "    media_type: $($media.MediaType)"
        Add-ReportLine "    source_filename: $($media.SourceFileName)"
        Add-ReportLine "    raw_url: $($media.RawUrl)"
        Add-ReportLine "    thumb_url: $($media.ThumbUrl)"
        Add-ReportLine "    proposed gallery file: $(Get-RelativeDisplayPath -Path $media.GalleryPath)"
        Add-ReportLine "    gallery exists: $(Test-Path -LiteralPath $media.GalleryPath)"
    }

    Add-ReportLine ""
}

if (-not $effectiveDryRun) {
    foreach ($plan in $plans) {
        if ($WritePosts) {
            if ((Test-Path -LiteralPath $plan.PostPath) -and -not $Force) {
                Add-ReportLine "Skipping existing post: $(Get-RelativeDisplayPath -Path $plan.PostPath)"
            }
            else {
                $content = New-PostFileContent `
                    -Title $plan.Title `
                    -Date $plan.DateStart `
                    -PostId $plan.PostId `
                    -AlbumFile $plan.RelativeAlbumFile `
                    -Description $plan.Description `
                    -MediaCount $plan.MediaCount `
                    -DateStart $plan.DateStart `
                    -DateEnd $plan.DateEnd `
                    -GalleryKey $plan.GalleryKey

                Write-TextFile -Path $plan.PostPath -Content $content
                Add-ReportLine "Wrote post: $(Get-RelativeDisplayPath -Path $plan.PostPath)"
            }
        }

        if ($WriteGalleryItems) {
            foreach ($media in $plan.Media) {
                if ((Test-Path -LiteralPath $media.GalleryPath) -and -not $Force) {
                    Add-ReportLine "Skipping existing gallery item: $(Get-RelativeDisplayPath -Path $media.GalleryPath)"
                    continue
                }

                $content = New-GalleryItemFileContent `
                    -Date $media.Date `
                    -Title $plan.Title `
                    -GalleryKey $plan.GalleryKey `
                    -PostId $plan.PostId `
                    -ItemId $media.ItemId `
                    -AlbumFile $plan.RelativeAlbumFile `
                    -MediaUri $media.Uri `
                    -Timestamp $media.Timestamp `
                    -SourceFileName $media.SourceFileName `
                    -RawUrl $media.RawUrl `
                    -ThumbUrl $media.ThumbUrl `
                    -PostUrl $plan.PostUrl `
                    -Index $media.Index `
                    -MediaType $media.MediaType

                Write-TextFile -Path $media.GalleryPath -Content $content
                Add-ReportLine "Wrote gallery item: $(Get-RelativeDisplayPath -Path $media.GalleryPath)"
            }
        }
    }
}

$reportDirectory = Split-Path $ReportFullPath -Parent
if (-not (Test-Path -LiteralPath $reportDirectory)) {
    New-Item -ItemType Directory -Path $reportDirectory | Out-Null
}

$ReportLines | Set-Content -LiteralPath $ReportFullPath -Encoding UTF8

Write-Host "Facebook album import planning complete." -ForegroundColor Green
Write-Host "Report: $(Get-RelativeDisplayPath -Path $ReportFullPath)"
Write-Host "Total albums: $($plans.Count)"
Write-Host "Total media references: $totalMediaReferences"
Write-Host "Missing media count: $missingMedia"
if ($largestAlbum) {
    Write-Host "Largest album: $($largestAlbum.Title) ($($largestAlbum.MediaCount) media)"
}
Write-Host "Albums over 100 media: $($albumsOver100.Count)"
Write-Host "Post files that already exist: $postFilesExisting"
Write-Host "Gallery files that already exist: $galleryFilesExisting"
Write-Host "Errors: $errors"
if ($effectiveDryRun) {
    Write-Host "No post/gallery files were written." -ForegroundColor Yellow
}
else {
    Write-Host "Write phase complete." -ForegroundColor Green
}
