param(
    [string]$Site = "jeffspatton.wordpress.com",
    [string]$StorageAccountName = "prdwebappstorage",
    [string]$ContainerName = "kansaspattons",
    [int[]]$SkipYears = @(2009),

    [switch]$DryRun,
    [switch]$WritePosts,
    [switch]$WriteGalleryItems,
    [switch]$GetImages,
    [switch]$CreateGallery,
    [switch]$UploadImages,
    [switch]$Force
)

Write-Host "Starting WordPress import (dry-run=$DryRun)" -ForegroundColor Cyan
Write-Host "Skipping years: $($SkipYears -join ', ')" -ForegroundColor Cyan

# ---------- Helpers ----------

function Get-WpTerms {
    param(
        [string]$Site,
        [string]$Kind
    )

    $terms = @{}
    $page = 1

    while ($true) {
        $url = "https://public-api.wordpress.com/wp/v2/sites/$Site/$Kind`?per_page=100&page=$page"

        try {
            $response = Invoke-RestMethod -Uri $url -Method Get
        }
        catch {
            break
        }

        if (-not $response -or $response.Count -eq 0) {
            break
        }

        foreach ($term in $response) {
            $terms[[int]$term.id] = $term.slug
        }

        $page++
    }

    return $terms
}

function Get-TermSlugs {
    param(
        [object[]]$Ids,
        [hashtable]$Lookup
    )

    $slugs = @()

    if (-not $Ids) {
        return $slugs
    }

    foreach ($id in $Ids) {
        $intId = [int]$id

        if ($Lookup.ContainsKey($intId)) {
            $slugs += $Lookup[$intId]
        }
    }

    return $slugs
}

function Get-AllPosts {
    param([string]$Site)

    $allPosts = @()
    $page = 1

    while ($true) {
        $url = "https://public-api.wordpress.com/wp/v2/sites/$Site/posts?per_page=100&page=$page"
        Write-Host "Fetching page $page..."
        Write-Host "  $url" -ForegroundColor DarkGray

        try {
            $response = Invoke-RestMethod -Uri $url -Method Get
        }
        catch {
            Write-Host "No more pages or API error. Stopping." -ForegroundColor Yellow
            Write-Host $_.Exception.Message -ForegroundColor DarkYellow
            break
        }

        if (-not $response -or $response.Count -eq 0) {
            break
        }

        $allPosts += $response
        $page++
    }

    return $allPosts
}

function Convert-ToSlug {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return "untitled"
    }

    $slug = [System.Net.WebUtility]::HtmlDecode($Text).ToLowerInvariant()
    $slug = $slug -replace '[^a-z0-9]+', '-'
    $slug = $slug -replace '^-|-$', ''

    if ([string]::IsNullOrWhiteSpace($slug)) {
        return "untitled"
    }

    return $slug
}

function Get-OriginalWordPressImageUrl {
    param([string]$Url)

    if ([string]::IsNullOrWhiteSpace($Url)) {
        return $Url
    }

    $clean = [System.Net.WebUtility]::HtmlDecode($Url)
    $clean = $clean -replace '\?.*$', ''

    return $clean
}

function Get-HtmlAttributeValue {
    param(
        [string]$Html,
        [string]$Name
    )

    if ([string]::IsNullOrWhiteSpace($Html) -or [string]::IsNullOrWhiteSpace($Name)) {
        return $null
    }

    $escapedName = [regex]::Escape($Name)
    $pattern = $escapedName + '\s*=\s*(["''])(.*?)\1'
    $match = [regex]::Match($Html, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

    if (-not $match.Success) {
        return $null
    }

    return [System.Net.WebUtility]::HtmlDecode($match.Groups[2].Value)
}

function ConvertFrom-WordPressImageMeta {
    param([string]$MetadataRaw)

    if ([string]::IsNullOrWhiteSpace($MetadataRaw)) {
        return $null
    }

    try {
        return $MetadataRaw | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

function Extract-Images {
    param([string]$Html)

    if ([string]::IsNullOrWhiteSpace($Html)) {
        return @()
    }

    $imgMatches = [regex]::Matches($Html, '<img\b[^>]*>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $images = @()
    $seenUrls = @{}

    foreach ($match in $imgMatches) {
        $tag = $match.Value

        $src = Get-HtmlAttributeValue -Html $tag -Name "src"
        $origFile = Get-HtmlAttributeValue -Html $tag -Name "data-orig-file"

        $url = if (-not [string]::IsNullOrWhiteSpace($origFile)) { $origFile } else { $src }
        $url = Get-OriginalWordPressImageUrl -Url $url

        if ([string]::IsNullOrWhiteSpace($url)) {
            continue
        }

        if ($seenUrls.ContainsKey($url)) {
            continue
        }

        $metadataRaw = Get-HtmlAttributeValue -Html $tag -Name "data-image-meta"
        $metadata = ConvertFrom-WordPressImageMeta -MetadataRaw $metadataRaw

        $images += [pscustomobject]@{
            Url              = $url
            Src              = $src
            Title            = Get-HtmlAttributeValue -Html $tag -Name "data-image-title"
            Alt              = Get-HtmlAttributeValue -Html $tag -Name "alt"
            Caption          = Get-HtmlAttributeValue -Html $tag -Name "data-image-caption"
            Description      = Get-HtmlAttributeValue -Html $tag -Name "data-image-description"
            AttachmentId     = Get-HtmlAttributeValue -Html $tag -Name "data-attachment-id"
            Permalink        = Get-HtmlAttributeValue -Html $tag -Name "data-permalink"
            OrigFile         = $origFile
            OrigSize         = Get-HtmlAttributeValue -Html $tag -Name "data-orig-size"
            LargeFile        = Get-HtmlAttributeValue -Html $tag -Name "data-large-file"
            MetadataRaw      = $metadataRaw
            Metadata         = $metadata
        }

        $seenUrls[$url] = $true
    }

    return $images
}

function Get-FileNameFromUrl {
    param([string]$Url)

    $uri = [Uri]$Url
    $fileName = [System.IO.Path]::GetFileName($uri.AbsolutePath)

    if ([string]::IsNullOrWhiteSpace($fileName)) {
        return "image.jpg"
    }

    return $fileName
}

function Get-BlobPlan {
    param(
        [string]$StorageAccountName,
        [string]$ContainerName,
        [datetime]$Date,
        [string]$ImageUrl
    )

    if (-not $Date) {
        throw "Get-BlobPlan received a null Date."
    }

    $fileName = Get-FileNameFromUrl -Url $ImageUrl

    $year = $Date.ToString("yyyy")
    $month = $Date.ToString("MM")
    $day = $Date.ToString("dd")

    $rawBlobPath = "images/wordpress/$year/$month/$day/$fileName"
    $thumbBlobPath = "thumbs/wordpress/$year/$month/$day/$fileName"

    $baseBlobUrl = "https://$StorageAccountName.blob.core.windows.net/$ContainerName"

    return [pscustomobject]@{
        FileName      = $fileName
        RawBlobPath   = $rawBlobPath
        ThumbBlobPath = $thumbBlobPath
        RawUrl        = "$baseBlobUrl/$rawBlobPath"
        ThumbUrl      = "$baseBlobUrl/$thumbBlobPath"
    }
}

function Get-PostDate {
    param([object]$Post)

    $title = [System.Net.WebUtility]::HtmlDecode($Post.title.rendered)

    if ($Post.date) {
        try {
            return [datetime]::Parse($Post.date)
        }
        catch {
            Write-Host "WARNING: Could not parse date for post: $title" -ForegroundColor Yellow
        }
    }

    if ($Post.modified) {
        try {
            return [datetime]::Parse($Post.modified)
        }
        catch {
            Write-Host "WARNING: Could not parse modified date for post: $title" -ForegroundColor Yellow
        }
    }

    return $null
}

function Convert-ToYamlArray {
    param([string[]]$Values)

    if (-not $Values -or $Values.Count -eq 0) {
        return @("[]")
    }

    $lines = @()
    foreach ($value in $Values) {
        $safe = $value.Replace('"', '\"')
        $lines += "  - ""$safe"""
    }

    return $lines
}

function Escape-YamlString {
    param([string]$Value)

    if ($null -eq $Value) {
        return '""'
    }

    $safe = [System.Net.WebUtility]::HtmlDecode($Value)
    $safe = $safe.Replace('\', '\\').Replace('"', '\"')

    return """$safe"""
}

function Add-YamlFieldIfPresent {
    param(
        [System.Collections.ArrayList]$Lines,
        [string]$Name,
        [string]$Value,
        [string]$Indent = ""
    )

    if (-not [string]::IsNullOrWhiteSpace($Value)) {
        [void]$Lines.Add("${Indent}${Name}: $(Escape-YamlString -Value $Value)")
    }
}

function Add-YamlExifFields {
    param(
        [System.Collections.ArrayList]$Lines,
        [object]$Metadata
    )

    if (-not $Metadata) {
        return
    }

    $properties = @($Metadata.PSObject.Properties | Where-Object {
            $null -ne $_.Value -and -not [string]::IsNullOrWhiteSpace([string]$_.Value)
        })

    if ($properties.Count -eq 0) {
        return
    }

    [void]$Lines.Add("exif:")

    foreach ($property in $properties) {
        [void]$Lines.Add("  $($property.Name): $(Escape-YamlString -Value ([string]$property.Value))")
    }
}

function Get-ImageTitle {
    param(
        [object]$Image,
        [string]$SourceFileName
    )

    $candidates = @($Image.Title, $Image.Alt, $Image.Caption)

    foreach ($candidate in $candidates) {
        if (-not [string]::IsNullOrWhiteSpace($candidate)) {
            return $candidate
        }
    }

    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($SourceFileName)
    return (($baseName -replace '[-_]+', ' ').Trim())
}

function Test-IsDateTitle {
    param([string]$Title)

    if ([string]::IsNullOrWhiteSpace($Title)) {
        return $false
    }

    try {
        [datetime]::Parse($Title) | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Get-GalleryKey {
    param(
        [datetime]$Date,
        [string]$Slug
    )

    return "wordpress-{0:yyyy-MM-dd-HHmmss}-$Slug" -f $Date
}

function Get-PostPermalink {
    param(
        [datetime]$Date,
        [string]$Slug
    )

    return "/blog/{0:yyyy/MM/dd}/$Slug.html" -f $Date
}

function Write-GalleryItemFile {
    param(
        [string]$Path,
        [datetime]$Date,
        [string]$Title,
        [string]$GalleryKey,
        [string]$RawUrl,
        [string]$ThumbUrl,
        [string]$PostUrl,
        [int]$Index,
        [string]$ItemId,
        [object]$Image,
        [string]$SourceImageUrl,
        [string]$SourceFileName,
        [switch]$DryRun,
        [switch]$Force
    )

    if ((Test-Path $Path) -and -not $Force) {
        Write-Host "Gallery item exists and -Force not set. Skipping write: $Path" -ForegroundColor Yellow
        return
    }

    $frontMatter = [System.Collections.ArrayList]@()
    [void]$frontMatter.Add("---")
    [void]$frontMatter.Add("layout: item")
    [void]$frontMatter.Add("id: $itemId")
    [void]$frontMatter.Add("title: $(Escape-YamlString -Value $Title)")
    [void]$frontMatter.Add("description:")
    [void]$frontMatter.Add("tags: []")
    [void]$frontMatter.Add("taken_at: $($Date.ToString("yyyy-MM-dd"))")
    [void]$frontMatter.Add("year: $($Date.ToString("yyyy"))")
    [void]$frontMatter.Add("month: $($Date.ToString("MM"))")
    [void]$frontMatter.Add("day: $($Date.ToString("dd"))")
    [void]$frontMatter.Add("weekday: $($Date.ToString("dddd"))")
    [void]$frontMatter.Add("gallery: $GalleryKey")
    [void]$frontMatter.Add("source:")
    [void]$frontMatter.Add("  type: wordpress")
    [void]$frontMatter.Add("  url: $(Escape-YamlString -Value $SourceImageUrl)")
    Add-YamlFieldIfPresent -Lines $frontMatter -Name "attachment_id" -Value $Image.AttachmentId -Indent "  "
    Add-YamlFieldIfPresent -Lines $frontMatter -Name "permalink" -Value $Image.Permalink -Indent "  "
    Add-YamlFieldIfPresent -Lines $frontMatter -Name "image_title" -Value $Image.Title -Indent "  "
    Add-YamlFieldIfPresent -Lines $frontMatter -Name "image_caption" -Value $Image.Caption -Indent "  "
    Add-YamlFieldIfPresent -Lines $frontMatter -Name "image_description" -Value $Image.Description -Indent "  "
    Add-YamlFieldIfPresent -Lines $frontMatter -Name "orig_file" -Value $Image.OrigFile -Indent "  "
    Add-YamlFieldIfPresent -Lines $frontMatter -Name "orig_size" -Value $Image.OrigSize -Indent "  "
    Add-YamlFieldIfPresent -Lines $frontMatter -Name "large_file" -Value $Image.LargeFile -Indent "  "
    Add-YamlFieldIfPresent -Lines $frontMatter -Name "metadata_raw" -Value $Image.MetadataRaw -Indent "  "
    [void]$frontMatter.Add("source_filename: $(Escape-YamlString -Value $SourceFileName)")
    [void]$frontMatter.Add("raw_url: $(Escape-YamlString -Value $RawUrl)")
    [void]$frontMatter.Add("thumb_url: $(Escape-YamlString -Value $ThumbUrl)")
    [void]$frontMatter.Add("post: $(Escape-YamlString -Value $PostUrl)")
    [void]$frontMatter.Add("index: $Index")
    Add-YamlExifFields -Lines $frontMatter -Metadata $Image.Metadata
    [void]$frontMatter.Add("---")
    [void]$frontMatter.Add("")

    $output = ($frontMatter -join "`r`n") + "`r`n"

    if ($DryRun) {
        Write-Host "DRY RUN: Would write gallery item:"
        Write-Host "  Path: $Path"
        Write-Host "  ID: $ItemId"
        Write-Host "  Title: $Title"
        Write-Host "  Gallery: $GalleryKey"
        Write-Host "  Raw URL: $RawUrl"
        Write-Host "  Thumb URL: $ThumbUrl"
        Write-Host "  Source title: $($Image.Title)"
        Write-Host "  Attachment ID: $($Image.AttachmentId)"
        Write-Host "  Has metadata: $($null -ne $Image.Metadata)"
        Write-Host "  Post: $PostUrl"
        return
    }

    $directory = Split-Path $Path -Parent
    if (-not (Test-Path $directory)) {
        New-Item -ItemType Directory -Path $directory | Out-Null
    }

    Set-Content -Path $Path -Value $output -Encoding UTF8
    Write-Host "Wrote gallery item: $Path" -ForegroundColor Green
}

function Write-PostFile {
    param(
        [string]$Path,
        [string]$Title,
        [datetime]$Date,
        [string[]]$Tags,
        [string[]]$Categories,
        [string]$ContentHtml,
        [string]$WordPressUrl,
        [object]$WordPressId,
        [bool]$Published,
        [string]$GalleryKey,
        [switch]$DryRun,
        [switch]$Force
    )

    if ((Test-Path $Path) -and -not $Force) {
        Write-Host "Post exists and -Force not set. Skipping write: $Path" -ForegroundColor Yellow
        return
    }

    $frontMatter = @()
    $frontMatter += "---"
    $frontMatter += "layout: post"
    $frontMatter += "title: $(Escape-YamlString -Value $Title)"
    $frontMatter += "date: $($Date.ToString("yyyy-MM-dd HH:mm:ss"))"
    $frontMatter += "published: $($Published.ToString().ToLowerInvariant())"
    $frontMatter += "comments: false"
    $frontMatter += "source:"
    $frontMatter += "  type: wordpress"
    $frontMatter += "  id: $WordPressId"
    $frontMatter += "  url: $(Escape-YamlString -Value $WordPressUrl)"

    if (-not [string]::IsNullOrWhiteSpace($GalleryKey)) {
        $frontMatter += "gallery: $(Escape-YamlString -Value $GalleryKey)"
    }

    $frontMatter += "categories:"

    $categoryLines = Convert-ToYamlArray -Values $Categories
    if ($categoryLines.Count -eq 1 -and $categoryLines[0] -eq "[]") {
        $frontMatter[-1] = "categories: []"
    }
    else {
        $frontMatter += $categoryLines
    }

    $frontMatter += "tags:"
    $tagLines = Convert-ToYamlArray -Values $Tags
    if ($tagLines.Count -eq 1 -and $tagLines[0] -eq "[]") {
        $frontMatter[-1] = "tags: []"
    }
    else {
        $frontMatter += $tagLines
    }

    $frontMatter += "---"
    $frontMatter += ""

    $body = Convert-WordPressHtmlToMarkdown -Html $ContentHtml

    if (-not [string]::IsNullOrWhiteSpace($GalleryKey)) {
        $galleryInclude = '{% include gallery.html gallery="' + $GalleryKey + '" %}'
        $body = $body -replace '<!-- wordpress-gallery -->', $galleryInclude
    }

    $output = ($frontMatter -join "`r`n") + $body + "`r`n"

    if ($DryRun) {
        Write-Host "DRY RUN: Would write post:" -ForegroundColor Cyan
        Write-Host "  Path: $Path"
        Write-Host "  Title: $Title"
        Write-Host "  Date: $($Date.ToString("yyyy-MM-dd HH:mm:ss"))"
        Write-Host "  Published: $Published"
        Write-Host "  Gallery: $GalleryKey"
        Write-Host "  Tags: $($Tags -join ', ')"
        Write-Host "  Categories: $($Categories -join ', ')"
        Write-Host "  WP URL: $WordPressUrl"
        Write-Host "  Content length: $($ContentHtml.Length)"
        return
    }

    $directory = Split-Path $Path -Parent
    if (-not (Test-Path $directory)) {
        New-Item -ItemType Directory -Path $directory | Out-Null
    }

    Set-Content -Path $Path -Value $output -Encoding UTF8
    Write-Host "Wrote post: $Path" -ForegroundColor Green
}

function Convert-YouTubeEmbeds {
    param([string]$Html)

    if ([string]::IsNullOrWhiteSpace($Html)) {
        return $Html
    }

    $pattern = '(?s)<span[^>]*class=["''][^"'']*embed-youtube[^"'']*["''][^>]*>.*?<iframe[^>]*src=["'']([^"'']+)["''][^>]*>.*?</iframe>.*?</span>'

    return [regex]::Replace($Html, $pattern, {
            param($match)

            $src = $match.Groups[1].Value
            $decodedSrc = [System.Net.WebUtility]::HtmlDecode($src)

            $videoId = $null

            if ($decodedSrc -match 'youtube\.com/embed/([^?&/"'']+)') {
                $videoId = $matches[1]
            }
            elseif ($decodedSrc -match 'youtu\.be/([^?&/"'']+)') {
                $videoId = $matches[1]
            }

            if ([string]::IsNullOrWhiteSpace($videoId)) {
                return "`r`n`r`n<!-- youtube embed: $decodedSrc -->`r`n`r`n"
            }

            return "`r`n`r`n{% include youtube.html id=""$videoId"" %}`r`n`r`n"
        })
}

function Convert-WordPressHtmlToMarkdown {
    param([string]$Html)

    if ([string]::IsNullOrWhiteSpace($Html)) {
        return ""
    }

    $body = [System.Net.WebUtility]::HtmlDecode($Html)

    # Preserve YouTube embeds as Liquid includes.
    $body = Convert-YouTubeEmbeds -Html $body

    # Replace WordPress gallery blocks with a placeholder.
    $body = $body -replace '(?s)<div[^>]*class=[''"][^''"]*gallery[^''"]*[''"][^>]*>.*?</div>', "`r`n`r`n<!-- wordpress-gallery -->`r`n`r`n"

    # Convert paragraph tags to Markdown-ish spacing.
    $body = $body -replace '(?i)<p>\s*', ''
    $body = $body -replace '(?i)\s*</p>', "`r`n`r`n"

    # Remove leftover clear/break tags.
    $body = $body -replace '(?i)<br\s*/?>', "`r`n"

    # Trim excessive blank lines.
    $body = $body -replace "(`r?`n){3,}", "`r`n`r`n"

    $body = Cleanup-WordPressLayoutDebris -Text $body

    return $body.Trim()
}

function Cleanup-WordPressLayoutDebris {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return ""
    }

    $clean = $Text

    # Remove WordPress/Jetpack tiled-gallery layout comments.
    $clean = $clean -replace '(?i)<!--\s*close\s+(group|row)\s*-->', ''

    # Remove orphan closing divs left after gallery extraction.
    $clean = $clean -replace '(?i)</div>', ''

    # Collapse repeated gallery placeholders into one.
    $clean = $clean -replace '(?s)(<!-- wordpress-gallery -->\s*){2,}', "<!-- wordpress-gallery -->`r`n`r`n"

    # Remove excess blank lines again.
    $clean = $clean -replace "(`r?`n){3,}", "`r`n`r`n"

    return $clean.Trim()
}

# ---------- Main ----------

Write-Host "Fetching WordPress tags..." -ForegroundColor Cyan
$tagLookup = Get-WpTerms -Site $Site -Kind "tags"

Write-Host "Fetching WordPress categories..." -ForegroundColor Cyan
$categoryLookup = Get-WpTerms -Site $Site -Kind "categories"

Write-Host "Tags found: $($tagLookup.Count)"
Write-Host "Categories found: $($categoryLookup.Count)"

$posts = Get-AllPosts -Site $Site

Write-Host "`nTotal posts found: $($posts.Count)" -ForegroundColor Green

$newPosts = 0
$existingPosts = 0
$totalImages = 0
$skippedPosts = 0
$invalidDatePosts = 0
$galleryItemsPlanned = 0
$postsByYear = @{}
$processedPostsByYear = @{}
$skippedPostsByYear = @{}

foreach ($post in $posts) {
    $title = [System.Net.WebUtility]::HtmlDecode($post.title.rendered)
    $date = Get-PostDate -Post $post

    if (-not $date) {
        Write-Host "`n---"
        Write-Host "ERROR: No valid date for post: $title. Skipping." -ForegroundColor Red
        $skippedPosts++
        $invalidDatePosts++
        continue
    }

    $year = $date.Year

    if (-not $postsByYear.ContainsKey($year)) {
        $postsByYear[$year] = 0
    }

    $postsByYear[$year]++

    if ($SkipYears -contains $year) {
        Write-Host "Skipping $year post: $title" -ForegroundColor DarkGray
        $skippedPosts++

        if (-not $skippedPostsByYear.ContainsKey($year)) {
            $skippedPostsByYear[$year] = 0
        }

        $skippedPostsByYear[$year]++
        continue
    }

    if (-not $processedPostsByYear.ContainsKey($year)) {
        $processedPostsByYear[$year] = 0
    }

    $processedPostsByYear[$year]++

    $slug = Convert-ToSlug -Text $post.slug

    if ($slug -eq "untitled") {
        $slug = Convert-ToSlug -Text $title
    }

    $cleanSlug = $slug -replace '-\d+$', ''

    $filename = "{0:yyyy-MM-dd-HHmmss}-$slug.md" -f $date
    $cleanFilename = "{0:yyyy-MM-dd-HHmmss}-$cleanSlug.md" -f $date

    $path = Join-Path "_posts" $filename
    $cleanPath = Join-Path "_posts" $cleanFilename

    if (Test-Path $cleanPath) {
        $path = $cleanPath
        $filename = $cleanFilename
        $slug = $cleanSlug
        $exists = $true
    }
    elseif (Test-Path $path) {
        $exists = $true
    }
    else {
        $exists = $false
    }

    if (-not $exists) {
        $datePrefix = $date.ToString("yyyy-MM-dd")
        $possibleMatches = Get-ChildItem "_posts" -Filter "$datePrefix-*.md" -ErrorAction SilentlyContinue

        if ($possibleMatches.Count -gt 0) {
            Write-Host "Possible local matches for same date:" -ForegroundColor Yellow
            foreach ($match in $possibleMatches) {
                Write-Host "  - $($match.Name)" -ForegroundColor Yellow
            }
        }
    }

    if ($exists) {
        $existingPosts++
    }
    else {
        $newPosts++
    }

    Write-Host "`n---"
    Write-Host "Post: $title"
    Write-Host "Date: $($date.ToString("yyyy-MM-dd HH:mm:ss"))"
    Write-Host "File: $path"
    Write-Host "Exists: $exists"

    $tagSlugs = Get-TermSlugs -Ids $post.tags -Lookup $tagLookup
    $categorySlugs = Get-TermSlugs -Ids $post.categories -Lookup $categoryLookup

    $html = $post.content.rendered
    $images = Extract-Images -Html $html

    $galleryKey = $null
    if ($images.Count -gt 0) {
        $galleryKey = Get-GalleryKey -Date $date -Slug $slug
    }

    $postSlugForUrl = [System.IO.Path]::GetFileNameWithoutExtension($filename) -replace '^\d{4}-\d{2}-\d{2}-\d{6}-', ''
    $postUrl = Get-PostPermalink -Date $date -Slug $postSlugForUrl

    $isDateTitle = Test-IsDateTitle -Title $title
    $published = -not $isDateTitle

    if ($WritePosts) {
        Write-PostFile `
            -Path $path `
            -Title $title `
            -Date $date `
            -Tags $tagSlugs `
            -Categories $categorySlugs `
            -ContentHtml $post.content.rendered `
            -WordPressUrl $post.link `
            -WordPressId $post.id `
            -Published $published `
            -GalleryKey $galleryKey `
            -DryRun:$DryRun `
            -Force:$Force
    }
    else {
        Write-Host "Post write disabled. Use -WritePosts to write: $path" -ForegroundColor DarkGray
    }

    if ($tagSlugs.Count -gt 0) {
        Write-Host "Tags: $($tagSlugs -join ', ')"
    }
    else {
        Write-Host "Tags: none"
    }

    if ($categorySlugs.Count -gt 0) {
        Write-Host "Categories: $($categorySlugs -join ', ')"
    }
    else {
        Write-Host "Categories: none"
    }

    if ($images.Count -gt 0) {
        Write-Host "Images found: $($images.Count)"

        $imageIndex = 1

        foreach ($image in $images) {
            try {
                $blobPlan = Get-BlobPlan `
                    -StorageAccountName $StorageAccountName `
                    -ContainerName $ContainerName `
                    -Date $date `
                    -ImageUrl $image.Url

                Write-Host "  [$imageIndex]"
                Write-Host "    Raw source:  $($image.Url)"
                Write-Host "    Raw blob:    $($blobPlan.RawBlobPath)"
                Write-Host "    Thumb blob:  $($blobPlan.ThumbBlobPath)"
                Write-Host "    raw_url:     $($blobPlan.RawUrl)"
                Write-Host "    thumb_url:   $($blobPlan.ThumbUrl)"
                Write-Host "    source title: $($image.Title)"
                Write-Host "    attachment:  $($image.AttachmentId)"

                if ($WriteGalleryItems) {
                    $sourceFileName = $blobPlan.FileName
                    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($sourceFileName)
                    $cleanName = Convert-ToSlug -Text $baseName
                    $itemId = "{0:yyyy-MM-dd}-$cleanName" -f $date
                    $galleryItemFileName = "$cleanName.md"
                    $galleryItemPath = Join-Path "_gallery" $galleryItemFileName
                    $imageTitle = Get-ImageTitle -Image $image -SourceFileName $sourceFileName

                    Write-GalleryItemFile `
                        -Path $galleryItemPath `
                        -ItemId $itemId `
                        -Date $date `
                        -Title $imageTitle `
                        -GalleryKey $galleryKey `
                        -RawUrl $blobPlan.RawUrl `
                        -ThumbUrl $blobPlan.ThumbUrl `
                        -PostUrl $postUrl `
                        -Index $imageIndex `
                        -Image $image `
                        -SourceImageUrl $image.Url `
                        -SourceFileName $sourceFileName `
                        -DryRun:$DryRun `
                        -Force:$Force

                    $galleryItemsPlanned++
                }
            }
            catch {
                Write-Host "  [$imageIndex]" -ForegroundColor Yellow
                Write-Host "    Raw source:  $($image.Url)"
                Write-Host "    ERROR calculating blob/gallery plan: $($_.Exception.Message)" -ForegroundColor Red
            }

            $imageIndex++
        }

        $totalImages += $images.Count
    }
    else {
        Write-Host "Images found: 0"
    }
}

# ---------- Summary ----------

Write-Host "`n===== SUMMARY =====" -ForegroundColor Cyan
Write-Host "Total posts: $($posts.Count)"
Write-Host "New posts: $newPosts"
Write-Host "Existing posts: $existingPosts"
Write-Host "Skipped posts: $skippedPosts"
Write-Host "Invalid-date posts: $invalidDatePosts"
Write-Host "Total images found: $totalImages"
Write-Host "Gallery items planned/written: $galleryItemsPlanned"

Write-Host "`nPosts by year:" -ForegroundColor Cyan
foreach ($year in ($postsByYear.Keys | Sort-Object)) {
    Write-Host "  $year : $($postsByYear[$year])"
}

Write-Host "`nProcessed posts by year:" -ForegroundColor Cyan
foreach ($year in ($processedPostsByYear.Keys | Sort-Object)) {
    Write-Host "  $year : $($processedPostsByYear[$year])"
}

Write-Host "`nSkipped posts by year:" -ForegroundColor Cyan
foreach ($year in ($skippedPostsByYear.Keys | Sort-Object)) {
    Write-Host "  $year : $($skippedPostsByYear[$year])"
}
