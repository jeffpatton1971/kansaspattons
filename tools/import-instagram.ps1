param(
    [string]$ExportPath = ".instagram",
    [string]$PostsJsonPath = "your_instagram_activity/media/posts_1.json",
    [string]$PostOutputPath = "_posts",
    [string]$GalleryOutputPath = "_gallery",
    [string]$ReportPath = "tools/instagram-import-report.txt",
    [string]$StorageAccountBaseUrl = "https://prdwebappstorage.blob.core.windows.net/kansaspattons",
    [switch]$DryRun,
    [switch]$WritePosts,
    [switch]$WriteGalleryItems,
    [switch]$Force
)

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ReportLines = New-Object System.Collections.Generic.List[string]
$PlannedPostPaths = @{}
$PlannedGalleryPaths = @{}
$PlannedGalleryKeys = @{}

# ---------- Helpers ----------

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

function Add-YamlArray {
    param(
        [System.Collections.Generic.List[string]]$Lines,
        [string]$Name,
        [string[]]$Values,
        [string]$Indent = ""
    )

    if (-not $Values -or $Values.Count -eq 0) {
        [void]$Lines.Add("${Indent}${Name}: []")
        return
    }

    [void]$Lines.Add("${Indent}${Name}:")
    foreach ($value in $Values) {
        [void]$Lines.Add("${Indent}  - $(Escape-YamlString -Value $value)")
    }
}

function Add-YamlFieldIfPresent {
    param(
        [System.Collections.Generic.List[string]]$Lines,
        [string]$Name,
        [string]$Value,
        [string]$Indent = ""
    )

    if (-not [string]::IsNullOrWhiteSpace($Value)) {
        [void]$Lines.Add("${Indent}${Name}: $(Escape-YamlString -Value $Value)")
    }
}

function Repair-InstagramString {
    param([object]$Value)

    if ($null -eq $Value) {
        return $null
    }

    $text = [string]$Value
    if ([string]::IsNullOrEmpty($text)) {
        return $text
    }

    # Instagram exports often contain UTF-8 bytes represented as Latin-1
    # characters, for example "ð" instead of an emoji.
    if ($text -notmatch '[\u0080-\u009f]|Ã|Â|â|ð') {
        return $text
    }

    $bytes = New-Object byte[] $text.Length

    for ($i = 0; $i -lt $text.Length; $i++) {
        $code = [int][char]$text[$i]

        if ($code -gt 255) {
            return $text
        }

        $bytes[$i] = [byte]$code
    }

    try {
        $utf8 = New-Object System.Text.UTF8Encoding($false, $true)
        return $utf8.GetString($bytes)
    }
    catch {
        return $text
    }
}

function Convert-ToSlug {
    param(
        [string]$Text,
        [int]$MaxLength = 80
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return ""
    }

    $slug = Repair-InstagramString -Value $Text
    $slug = [System.Net.WebUtility]::HtmlDecode($slug).ToLowerInvariant()
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

function Extract-Hashtags {
    param([string]$Text)

    $values = New-Object System.Collections.Generic.List[string]
    $seen = @{}

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return @()
    }

    $matches = [regex]::Matches($Text, '(?<![\p{L}\p{N}_])#([\p{L}\p{N}_]+)')
    foreach ($match in $matches) {
        $tag = $match.Groups[1].Value.ToLowerInvariant()

        if (-not $seen.ContainsKey($tag)) {
            $seen[$tag] = $true
            [void]$values.Add($tag)
        }
    }

    return @($values)
}

function Extract-Handles {
    param([string]$Text)

    $values = New-Object System.Collections.Generic.List[string]
    $seen = @{}

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return @()
    }

    $matches = [regex]::Matches($Text, '(?<![\p{L}\p{N}_])@([A-Za-z0-9_](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9_])?)')
    foreach ($match in $matches) {
        $handle = $match.Groups[1].Value.ToLowerInvariant()

        if (-not $seen.ContainsKey($handle)) {
            $seen[$handle] = $true
            [void]$values.Add($handle)
        }
    }

    return @($values)
}

function Add-UniqueString {
    param(
        [System.Collections.Generic.List[string]]$Values,
        [hashtable]$Seen,
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return
    }

    $key = $Value.ToLowerInvariant()
    if (-not $Seen.ContainsKey($key)) {
        $Seen[$key] = $true
        [void]$Values.Add($Value)
    }
}

function Extract-InstagramCategories {
    param([string]$Text)

    $values = New-Object System.Collections.Generic.List[string]
    $seen = @{}

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return @()
    }

    $categoryRules = @(
        @{ Category = "Natalie"; Pattern = '\bNatalie\b' },
        @{ Category = "Nathan"; Pattern = '\bNathan\b|\bNate\b' },
        @{ Category = "Peggy"; Pattern = '\bPeggy\b' },
        @{ Category = "Grandma"; Pattern = '\bGrandma\b' },
        @{ Category = "Grandpa"; Pattern = '\bGrandpa\b' },
        @{ Category = "Jonyce"; Pattern = '\bJonyce\b' },
        @{ Category = "Paul"; Pattern = '\bPaul\b' },
        @{ Category = "Sarah"; Pattern = '\bSarah\b' },
        @{ Category = "Mary"; Pattern = '\bMary\b' },
        @{ Category = "Easter"; Pattern = '\bEaster\b' },
        @{ Category = "Christmas"; Pattern = '\bChristmas\b|\bXmas\b' },
        @{ Category = "New Year"; Pattern = '\bNew\s+Year(?:''s)?\b|\bNew\s+Years\b' },
        @{ Category = "Thanksgiving"; Pattern = '\bThanksgiving\b' },
        @{ Category = "birthday"; Pattern = '\bbirthday\b' },
        @{ Category = "July 4th"; Pattern = '\bJuly\s+4(?:th)?\b|\b4th\s+of\s+July\b|\bFourth\s+of\s+July\b' },
        @{ Category = "winter"; Pattern = '\bwinter\b' },
        @{ Category = "summer"; Pattern = '\bsummer\b' },
        @{ Category = "spring"; Pattern = '\bspring\b' },
        @{ Category = "fall"; Pattern = '\bfall\b|\bautumn\b' },
        @{ Category = "CPLS"; Pattern = '\bCPLS\b|\bCair\s+Paravel(?:\s+Latin(?:\s+School)?)?\b' },
        @{ Category = "cancer"; Pattern = '\bcancer\b|\bchemo(?:therapy)?\b' }
    )

    foreach ($rule in $categoryRules) {
        if ([regex]::IsMatch($Text, $rule.Pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
            Add-UniqueString -Values $values -Seen $seen -Value $rule.Category
        }
    }

    return @($values)
}

function Get-InstagramPostTags {
    param([string[]]$Hashtags)

    $values = New-Object System.Collections.Generic.List[string]
    $seen = @{}

    foreach ($hashtag in @($Hashtags)) {
        Add-UniqueString -Values $values -Seen $seen -Value $hashtag
    }

    Add-UniqueString -Values $values -Seen $seen -Value "instagram"

    return @($values)
}

function Linkify-InstagramCaption {
    param([string]$Caption)

    if ([string]::IsNullOrWhiteSpace($Caption)) {
        return ""
    }

    $safe = $Caption
    $safe = $safe -replace '&', '&amp;'
    $safe = $safe -replace '<', '&lt;'
    $safe = $safe -replace '>', '&gt;'
    $safe = $safe -replace "`r`n", "`n"
    $safe = $safe -replace "`r", "`n"

    $pattern = '(?<![\p{L}\p{N}_])#([\p{L}\p{N}_]+)|(?<![\p{L}\p{N}_])@([A-Za-z0-9_](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9_])?)'

    return [regex]::Replace($safe, $pattern, {
            param($match)

            if ($match.Groups[1].Success) {
                $tag = $match.Groups[1].Value
                $urlTag = [Uri]::EscapeDataString($tag.ToLowerInvariant())
                return "[#$tag](https://www.instagram.com/explore/tags/$urlTag/)"
            }

            $handle = $match.Groups[2].Value
            $urlHandle = [Uri]::EscapeDataString($handle.ToLowerInvariant())
            return "[@$handle](https://www.instagram.com/$urlHandle/)"
        })
}

function Convert-UnixTimestamp {
    param([object]$Timestamp)

    if ($null -eq $Timestamp -or [string]::IsNullOrWhiteSpace([string]$Timestamp)) {
        return $null
    }

    try {
        return [DateTimeOffset]::FromUnixTimeSeconds([int64]$Timestamp).LocalDateTime
    }
    catch {
        return $null
    }
}

function Get-UniquePath {
    param(
        [string]$Path,
        [hashtable]$ReservedPaths
    )

    if (-not $ReservedPaths) {
        return $Path
    }

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

function Get-UniqueValue {
    param(
        [string]$Value,
        [hashtable]$ReservedValues
    )

    if (-not $ReservedValues) {
        return $Value
    }

    $candidate = $Value
    $counter = 2

    while ($ReservedValues.ContainsKey($candidate.ToLowerInvariant())) {
        $candidate = "$Value-$counter"
        $counter++
    }

    $ReservedValues[$candidate.ToLowerInvariant()] = $true
    return $candidate
}

function Get-BlobPlan {
    param(
        [string]$StorageAccountBaseUrl,
        [datetime]$Date,
        [string]$MediaUri
    )

    if (-not $Date) {
        throw "Get-BlobPlan received a null Date."
    }

    if ([string]::IsNullOrWhiteSpace($MediaUri)) {
        throw "Get-BlobPlan received an empty media uri."
    }

    $fileName = [System.IO.Path]::GetFileName(($MediaUri -replace '\\', '/'))
    if ([string]::IsNullOrWhiteSpace($fileName)) {
        $fileName = "instagram-media"
    }

    $year = $Date.ToString("yyyy")
    $month = $Date.ToString("MM")
    $day = $Date.ToString("dd")
    $baseUrl = $StorageAccountBaseUrl.TrimEnd("/")

    $rawBlobPath = "images/instagram/$year/$month/$day/$fileName"
    $thumbBlobPath = "thumbs/instagram/$year/$month/$day/$fileName"

    return [pscustomobject]@{
        FileName      = $fileName
        RawBlobPath   = $rawBlobPath
        ThumbBlobPath = $thumbBlobPath
        RawUrl        = "$baseUrl/$rawBlobPath"
        ThumbUrl      = "$baseUrl/$thumbBlobPath"
    }
}

function Get-MediaPrefix {
    param([string]$Uri)

    if ([string]::IsNullOrWhiteSpace($Uri)) {
        return "<missing>"
    }

    $parts = ($Uri -replace '\\', '/') -split '/'
    if ($parts.Count -ge 2) {
        return "$($parts[0])/$($parts[1])"
    }

    return $Uri
}

function Get-CaptionPreview {
    param(
        [string]$Text,
        [int]$MaxLength = 120
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return ""
    }

    $preview = ($Text -replace '\s+', ' ').Trim()
    if ($preview.Length -gt $MaxLength) {
        return $preview.Substring(0, $MaxLength) + "..."
    }

    return $preview
}

function Get-PostTitle {
    param(
        [string]$Caption,
        [datetime]$Date
    )

    $preview = Get-CaptionPreview -Text $Caption -MaxLength 90
    if (-not [string]::IsNullOrWhiteSpace($preview)) {
        return $preview
    }

    return "Instagram - $($Date.ToString('yyyy-MM-dd HH:mm'))"
}

function Get-CrossPostSource {
    param(
        [object]$Post,
        [object]$Media
    )

    $candidates = @(
        $Media.cross_post_source.source_app,
        $Post.cross_post_source.source_app
    )

    foreach ($candidate in $candidates) {
        $value = Repair-InstagramString -Value $candidate
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value
        }
    }

    return $null
}

function Get-MediaMetadataRaw {
    param([object]$MediaMetadata)

    if ($null -eq $MediaMetadata) {
        return $null
    }

    try {
        return ($MediaMetadata | ConvertTo-Json -Depth 100 -Compress)
    }
    catch {
        return $null
    }
}

function Get-LocationFromObject {
    param([object]$Value)

    if ($null -eq $Value) {
        return $null
    }

    if ($Value -is [string]) {
        $name = Repair-InstagramString -Value $Value
        if (-not [string]::IsNullOrWhiteSpace($name)) {
            return [pscustomobject]@{ Name = $name; Url = $null }
        }

        return $null
    }

    $nameCandidates = @(
        $Value.name,
        $Value.title,
        $Value.location_name,
        $Value.value
    )

    $urlCandidates = @(
        $Value.url,
        $Value.href,
        $Value.link
    )

    $name = $null
    foreach ($candidate in $nameCandidates) {
        $candidateText = Repair-InstagramString -Value $candidate
        if (-not [string]::IsNullOrWhiteSpace($candidateText)) {
            $name = $candidateText
            break
        }
    }

    $url = $null
    foreach ($candidate in $urlCandidates) {
        $candidateText = Repair-InstagramString -Value $candidate
        if (-not [string]::IsNullOrWhiteSpace($candidateText)) {
            $url = $candidateText
            break
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($name) -or -not [string]::IsNullOrWhiteSpace($url)) {
        return [pscustomobject]@{ Name = $name; Url = $url }
    }

    return $null
}

function Get-PostLocation {
    param([object]$Post)

    $candidateNames = @("location", "place", "venue")

    foreach ($name in $candidateNames) {
        if ($Post.PSObject.Properties.Name -contains $name) {
            $location = Get-LocationFromObject -Value $Post.$name
            if ($location) {
                return $location
            }
        }
    }

    if ($Post.string_map_data) {
        foreach ($property in $Post.string_map_data.PSObject.Properties) {
            if ($property.Name -match 'location|place|venue') {
                $location = Get-LocationFromObject -Value $property.Value
                if ($location) {
                    return $location
                }
            }
        }
    }

    foreach ($media in @($Post.media)) {
        foreach ($name in $candidateNames) {
            if ($media.PSObject.Properties.Name -contains $name) {
                $location = Get-LocationFromObject -Value $media.$name
                if ($location) {
                    return $location
                }
            }
        }
    }

    return $null
}

function Get-PostPermalink {
    param(
        [datetime]$Date,
        [string]$FilePath
    )

    $fileBaseName = [System.IO.Path]::GetFileNameWithoutExtension($FilePath)
    $postSlug = $fileBaseName -replace '^\d{4}-\d{2}-\d{2}-', ''

    return "/blog/{0:yyyy/MM/dd}/$postSlug.html" -f $Date
}

function New-PostFileContent {
    param(
        [string]$Title,
        [string]$PostId,
        [datetime]$Date,
        [string]$Caption,
        [string[]]$Hashtags,
        [string[]]$Handles,
        [string[]]$Tags,
        [string[]]$Categories,
        [object]$Location,
        [string]$GalleryKey,
        [string]$SourceId,
        [object]$Timestamp,
        [int]$MediaCount,
        [string]$CrossPostSource
    )

    $frontMatter = New-Object System.Collections.Generic.List[string]
    [void]$frontMatter.Add("---")
    [void]$frontMatter.Add("layout: single")
    [void]$frontMatter.Add("title: $(Escape-YamlString -Value $Title)")
    [void]$frontMatter.Add("post_id: $PostId")
    [void]$frontMatter.Add("date: $($Date.ToString('yyyy-MM-dd HH:mm:ss'))")
    [void]$frontMatter.Add("published: true")
    [void]$frontMatter.Add("comments: false")
    [void]$frontMatter.Add("source:")
    [void]$frontMatter.Add("  type: instagram")
    [void]$frontMatter.Add("  id: $(Escape-YamlString -Value $SourceId)")
    [void]$frontMatter.Add("  timestamp: $Timestamp")
    [void]$frontMatter.Add("  caption: $(Escape-YamlString -Value $Caption)")
    [void]$frontMatter.Add("  media_count: $MediaCount")
    Add-YamlFieldIfPresent -Lines $frontMatter -Name "cross_post_source" -Value $CrossPostSource -Indent "  "
    Add-YamlArray -Lines $frontMatter -Name "hashtags" -Values $Hashtags
    Add-YamlArray -Lines $frontMatter -Name "handles" -Values $Handles
    [void]$frontMatter.Add("location:")

    if ($Location) {
        Add-YamlFieldIfPresent -Lines $frontMatter -Name "name" -Value $Location.Name -Indent "  "
        Add-YamlFieldIfPresent -Lines $frontMatter -Name "url" -Value $Location.Url -Indent "  "
    }

    [void]$frontMatter.Add("gallery: $(Escape-YamlString -Value $GalleryKey)")
    Add-YamlArray -Lines $frontMatter -Name "tags" -Values $Tags
    Add-YamlArray -Lines $frontMatter -Name "categories" -Values $Categories
    [void]$frontMatter.Add("---")
    [void]$frontMatter.Add("")

    $bodyLines = New-Object System.Collections.Generic.List[string]
    $linkedCaption = Linkify-InstagramCaption -Caption $Caption

    if (-not [string]::IsNullOrWhiteSpace($linkedCaption)) {
        foreach ($line in ($linkedCaption -split "`n", -1)) {
            [void]$bodyLines.Add($line)
        }

        [void]$bodyLines.Add("")
    }

    if ($Location -and -not [string]::IsNullOrWhiteSpace($Location.Name)) {
        if (-not [string]::IsNullOrWhiteSpace($Location.Url)) {
            [void]$bodyLines.Add("Location: [$($Location.Name)]($($Location.Url))")
        }
        else {
            [void]$bodyLines.Add("Location: $($Location.Name)")
        }

        [void]$bodyLines.Add("")
    }

    [void]$bodyLines.Add('{% include gallery.html gallery="' + $GalleryKey + '" %}')

    return (($frontMatter -join "`r`n") + "`r`n" + ($bodyLines -join "`r`n") + "`r`n")
}

function New-GalleryItemFileContent {
    param(
        [datetime]$Date,
        [string]$Title,
        [string]$PostId,
        [string[]]$Tags,
        [string]$GalleryKey,
        [string]$ItemId,
        [string]$MediaUri,
        [object]$PostTimestamp,
        [object]$MediaTimestamp,
        [string]$CrossPostSource,
        [string]$MediaMetadataRaw,
        [string]$SourceFileName,
        [string]$RawUrl,
        [string]$ThumbUrl,
        [string]$PostUrl,
        [int]$Index
    )

    $frontMatter = New-Object System.Collections.Generic.List[string]
    [void]$frontMatter.Add("---")
    [void]$frontMatter.Add("layout: item")
    [void]$frontMatter.Add("id: $(Escape-YamlString -Value $ItemId)")
    [void]$frontMatter.Add("title: $(Escape-YamlString -Value $Title)")
    [void]$frontMatter.Add("description:")
    [void]$frontMatter.Add("post_id: $PostId")
    Add-YamlArray -Lines $frontMatter -Name "tags" -Values $Tags
    [void]$frontMatter.Add("taken_at: $($Date.ToString('yyyy-MM-dd'))")
    [void]$frontMatter.Add("year: $($Date.ToString('yyyy'))")
    [void]$frontMatter.Add("month: $($Date.ToString('MM'))")
    [void]$frontMatter.Add("day: $($Date.ToString('dd'))")
    [void]$frontMatter.Add("weekday: $($Date.ToString('dddd'))")
    [void]$frontMatter.Add("gallery: $(Escape-YamlString -Value $GalleryKey)")
    [void]$frontMatter.Add("source:")
    [void]$frontMatter.Add("  type: instagram")
    [void]$frontMatter.Add("  uri: $(Escape-YamlString -Value $MediaUri)")
    [void]$frontMatter.Add("  post_timestamp: $PostTimestamp")

    if ($null -ne $MediaTimestamp -and -not [string]::IsNullOrWhiteSpace([string]$MediaTimestamp)) {
        [void]$frontMatter.Add("  media_timestamp: $MediaTimestamp")
    }

    Add-YamlFieldIfPresent -Lines $frontMatter -Name "cross_post_source" -Value $CrossPostSource -Indent "  "
    Add-YamlFieldIfPresent -Lines $frontMatter -Name "media_metadata_raw" -Value $MediaMetadataRaw -Indent "  "
    [void]$frontMatter.Add("source_filename: $(Escape-YamlString -Value $SourceFileName)")
    [void]$frontMatter.Add("raw_url: $(Escape-YamlString -Value $RawUrl)")
    [void]$frontMatter.Add("thumb_url: $(Escape-YamlString -Value $ThumbUrl)")
    [void]$frontMatter.Add("post: $(Escape-YamlString -Value $PostUrl)")
    [void]$frontMatter.Add("index: $Index")
    [void]$frontMatter.Add("---")
    [void]$frontMatter.Add("")

    return (($frontMatter -join "`r`n") + "`r`n")
}

function Write-PostFile {
    param(
        [string]$Path,
        [string]$Title,
        [string]$PostId,
        [datetime]$Date,
        [string]$Caption,
        [string[]]$Hashtags,
        [string[]]$Handles,
        [string[]]$Tags,
        [string[]]$Categories,
        [object]$Location,
        [string]$GalleryKey,
        [string]$SourceId,
        [object]$Timestamp,
        [int]$MediaCount,
        [string]$CrossPostSource,
        [switch]$DryRun,
        [switch]$Force
    )

    if ((Test-Path -LiteralPath $Path) -and -not $Force) {
        Add-ReportLine "  Post exists and -Force not set. Skipping write: $(Get-RelativeDisplayPath -Path $Path)"
        return
    }

    $output = New-PostFileContent `
        -Title $Title `
        -PostId $PostId `
        -Date $Date `
        -Caption $Caption `
        -Hashtags $Hashtags `
        -Handles $Handles `
        -Tags $Tags `
        -Categories $Categories `
        -Location $Location `
        -GalleryKey $GalleryKey `
        -SourceId $SourceId `
        -Timestamp $Timestamp `
        -MediaCount $MediaCount `
        -CrossPostSource $CrossPostSource

    if ($DryRun) {
        Add-ReportLine "  DRY RUN: Would write post: $(Get-RelativeDisplayPath -Path $Path)"
        return
    }

    $directory = Split-Path $Path -Parent
    if (-not (Test-Path -LiteralPath $directory)) {
        New-Item -ItemType Directory -Path $directory | Out-Null
    }

    Set-Content -LiteralPath $Path -Value $output -Encoding UTF8
    Add-ReportLine "  Wrote post: $(Get-RelativeDisplayPath -Path $Path)"
}

function Write-GalleryItemFile {
    param(
        [string]$Path,
        [datetime]$Date,
        [string]$Title,
        [string]$PostId,
        [string[]]$Tags,
        [string]$GalleryKey,
        [string]$ItemId,
        [string]$MediaUri,
        [object]$PostTimestamp,
        [object]$MediaTimestamp,
        [string]$CrossPostSource,
        [string]$MediaMetadataRaw,
        [string]$SourceFileName,
        [string]$RawUrl,
        [string]$ThumbUrl,
        [string]$PostUrl,
        [int]$Index,
        [switch]$DryRun,
        [switch]$Force
    )

    if ((Test-Path -LiteralPath $Path) -and -not $Force) {
        Add-ReportLine "    Gallery item exists and -Force not set. Skipping write: $(Get-RelativeDisplayPath -Path $Path)"
        return
    }

    $output = New-GalleryItemFileContent `
        -Date $Date `
        -Title $Title `
        -PostId $PostId `
        -Tags $Tags `
        -GalleryKey $GalleryKey `
        -ItemId $ItemId `
        -MediaUri $MediaUri `
        -PostTimestamp $PostTimestamp `
        -MediaTimestamp $MediaTimestamp `
        -CrossPostSource $CrossPostSource `
        -MediaMetadataRaw $MediaMetadataRaw `
        -SourceFileName $SourceFileName `
        -RawUrl $RawUrl `
        -ThumbUrl $ThumbUrl `
        -PostUrl $PostUrl `
        -Index $Index

    if ($DryRun) {
        Add-ReportLine "    DRY RUN: Would write gallery item: $(Get-RelativeDisplayPath -Path $Path)"
        return
    }

    $directory = Split-Path $Path -Parent
    if (-not (Test-Path -LiteralPath $directory)) {
        New-Item -ItemType Directory -Path $directory | Out-Null
    }

    Set-Content -LiteralPath $Path -Value $output -Encoding UTF8
    Add-ReportLine "    Wrote gallery item: $(Get-RelativeDisplayPath -Path $Path)"
}

# ---------- Main ----------

$ExportRoot = Resolve-RepoPath -Path $ExportPath
$PostOutputRoot = Resolve-RepoPath -Path $PostOutputPath
$GalleryOutputRoot = Resolve-RepoPath -Path $GalleryOutputPath
$ReportFullPath = Resolve-RepoPath -Path $ReportPath
$PostsJsonFullPath = if ([System.IO.Path]::IsPathRooted($PostsJsonPath)) {
    [System.IO.Path]::GetFullPath($PostsJsonPath)
}
else {
    [System.IO.Path]::GetFullPath((Join-Path $ExportRoot $PostsJsonPath))
}

$planningOnly = $DryRun -or (-not $WritePosts -and -not $WriteGalleryItems)
$effectiveDryRun = $DryRun -or (-not $WritePosts -and -not $WriteGalleryItems)

Add-ReportLine "Instagram Import Report"
Add-ReportLine "Generated: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz'))"
Add-ReportLine "Repo root: $RepoRoot"
Add-ReportLine "Export path: $ExportRoot"
Add-ReportLine "Posts JSON: $PostsJsonFullPath"
Add-ReportLine "Post output path: $PostOutputRoot"
Add-ReportLine "Gallery output path: $GalleryOutputRoot"
Add-ReportLine "Report path: $ReportFullPath"
Add-ReportLine "Storage base URL: $StorageAccountBaseUrl"
Add-ReportLine "DryRun: $DryRun"
Add-ReportLine "WritePosts: $WritePosts"
Add-ReportLine "WriteGalleryItems: $WriteGalleryItems"
Add-ReportLine "Force: $Force"

if (-not $WritePosts -and -not $WriteGalleryItems) {
    Add-ReportLine "WARNING: Neither -WritePosts nor -WriteGalleryItems was set. Planning only; nothing will be written."
}

if ($DryRun) {
    Add-ReportLine "DRY RUN: No post or gallery files will be written."
}

Add-ReportLine ""

if (-not (Test-Path -LiteralPath $ExportRoot)) {
    throw "Export path not found: $ExportRoot"
}

if (-not (Test-Path -LiteralPath $PostsJsonFullPath)) {
    throw "Posts JSON not found: $PostsJsonFullPath"
}

try {
    $posts = Get-Content -LiteralPath $PostsJsonFullPath -Raw -Encoding UTF8 | ConvertFrom-Json
}
catch {
    throw "Could not parse posts JSON: $($_.Exception.Message)"
}

if ($null -eq $posts) {
    $posts = @()
}

$totalPosts = $posts.Count
$totalMediaReferences = 0
$postsPlanned = 0
$postFilesExisting = 0
$postFilesWritten = 0
$galleryItemsPlanned = 0
$galleryFilesExisting = 0
$galleryFilesWritten = 0
$missingMediaFiles = 0
$hashtagTotal = 0
$handleTotal = 0
$categoryTotal = 0
$locationCount = 0
$postsWithTopTimestamp = 0
$postsUsingMediaTimestampFallback = 0
$postsWithTopCaption = 0
$postsUsingMediaCaptionFallback = 0
$skippedPosts = 0
$badPosts = 0
$badMedia = 0
$countsByYear = @{}
$countsByMediaPrefix = @{}
$samplePostOutput = $null
$sampleGalleryOutput = $null

foreach ($post in $posts) {
    foreach ($media in @($post.media)) {
        if ($null -eq $media) {
            continue
        }

        $totalMediaReferences++
        $prefix = Get-MediaPrefix -Uri $media.uri
        if (-not $countsByMediaPrefix.ContainsKey($prefix)) {
            $countsByMediaPrefix[$prefix] = 0
        }

        $countsByMediaPrefix[$prefix]++
    }
}

Add-ReportLine "Overview"
Add-ReportLine "- Total posts: $totalPosts"
Add-ReportLine "- Total media references: $totalMediaReferences"
Add-ReportLine ""

Add-ReportLine "Counts By Media Folder Prefix"
foreach ($prefix in ($countsByMediaPrefix.Keys | Sort-Object)) {
    Add-ReportLine "- ${prefix}: $($countsByMediaPrefix[$prefix])"
}
Add-ReportLine ""

$postNumber = 0

foreach ($post in $posts) {
    $postNumber++

    try {
        $mediaItems = @($post.media) | Where-Object { $null -ne $_ }
        $firstMedia = if ($mediaItems.Count -gt 0) { $mediaItems[0] } else { $null }
        $timestamp = $post.creation_timestamp
        $timestampSource = "post.creation_timestamp"

        if ($null -ne $timestamp -and -not [string]::IsNullOrWhiteSpace([string]$timestamp)) {
            $postsWithTopTimestamp++
        }
        elseif ($firstMedia -and $firstMedia.creation_timestamp) {
            $timestamp = $firstMedia.creation_timestamp
            $timestampSource = "media[0].creation_timestamp"
            $postsUsingMediaTimestampFallback++
        }

        $date = Convert-UnixTimestamp -Timestamp $timestamp
        if (-not $date) {
            Add-ReportLine "Post $postNumber"
            Add-ReportLine "  ERROR: Missing or invalid timestamp. Skipping post."
            $skippedPosts++
            continue
        }

        $caption = Repair-InstagramString -Value $post.title
        $captionSource = "post.title"

        if (-not [string]::IsNullOrWhiteSpace($caption)) {
            $postsWithTopCaption++
        }
        elseif ($firstMedia -and -not [string]::IsNullOrWhiteSpace([string]$firstMedia.title)) {
            $caption = Repair-InstagramString -Value $firstMedia.title
            $captionSource = "media[0].title"
            $postsUsingMediaCaptionFallback++
        }

        if ($null -eq $caption) {
            $caption = ""
        }

        $hashtags = Extract-Hashtags -Text $caption
        $handles = Extract-Handles -Text $caption
        $postTags = Get-InstagramPostTags -Hashtags $hashtags
        $postCategories = Extract-InstagramCategories -Text $caption
        $hashtagTotal += $hashtags.Count
        $handleTotal += $handles.Count
        $categoryTotal += $postCategories.Count

        $location = Get-PostLocation -Post $post
        if ($location) {
            $locationCount++
        }

        $title = Get-PostTitle -Caption $caption -Date $date
        $slug = Convert-ToSlug -Text $caption
        $dateTimeSlug = $date.ToString("yyyy-MM-dd-HHmmss")
        $postFileName = if ([string]::IsNullOrWhiteSpace($slug)) {
            "$dateTimeSlug.md"
        }
        else {
            "$dateTimeSlug-$slug.md"
        }

        $postPath = Get-UniquePath -Path (Join-Path $PostOutputRoot $postFileName) -ReservedPaths $PlannedPostPaths
        $postId = [System.IO.Path]::GetFileNameWithoutExtension($postPath)
        $postExists = Test-Path -LiteralPath $postPath

        if ($postExists) {
            $postFilesExisting++
        }

        $galleryKeyBase = if ([string]::IsNullOrWhiteSpace($slug)) {
            "instagram-$dateTimeSlug"
        }
        else {
            "instagram-$dateTimeSlug-$slug"
        }

        $galleryKey = Get-UniqueValue -Value $galleryKeyBase -ReservedValues $PlannedGalleryKeys
        $sourceId = $galleryKey
        $postUrl = Get-PostPermalink -Date $date -FilePath $postPath
        $crossPostSource = Get-CrossPostSource -Post $post -Media $firstMedia
        $year = $date.Year

        if (-not $countsByYear.ContainsKey($year)) {
            $countsByYear[$year] = 0
        }

        $countsByYear[$year]++
        $postsPlanned++

        Add-ReportLine "Post $postNumber"
        Add-ReportLine "  proposed post file: $(Get-RelativeDisplayPath -Path $postPath)"
        Add-ReportLine "  post_id: $postId"
        Add-ReportLine "  post file exists: $postExists"
        Add-ReportLine "  post date: $($date.ToString('yyyy-MM-dd HH:mm:ss'))"
        Add-ReportLine "  timestamp source: $timestampSource"
        Add-ReportLine "  caption source: $captionSource"
        Add-ReportLine "  caption preview: $(Get-CaptionPreview -Text $caption)"
        Add-ReportLine "  hashtags: $(if ($hashtags.Count -gt 0) { $hashtags -join ', ' } else { '[]' })"
        Add-ReportLine "  handles: $(if ($handles.Count -gt 0) { $handles -join ', ' } else { '[]' })"
        Add-ReportLine "  tags: $($postTags -join ', ')"
        Add-ReportLine "  categories: $(if ($postCategories.Count -gt 0) { $postCategories -join ', ' } else { '[]' })"

        if ($location) {
            Add-ReportLine "  location: $(if ($location.Url) { "$($location.Name) <$($location.Url)>" } else { $location.Name })"
        }
        else {
            Add-ReportLine "  location: []"
        }

        Add-ReportLine "  gallery key: $galleryKey"
        Add-ReportLine "  media count: $($mediaItems.Count)"

        if ($null -eq $samplePostOutput) {
            $samplePostOutput = New-PostFileContent `
                -Title $title `
                -PostId $postId `
                -Date $date `
                -Caption $caption `
                -Hashtags $hashtags `
                -Handles $handles `
                -Tags $postTags `
                -Categories $postCategories `
                -Location $location `
                -GalleryKey $galleryKey `
                -SourceId $sourceId `
                -Timestamp $timestamp `
                -MediaCount $mediaItems.Count `
                -CrossPostSource $crossPostSource
        }

        if ($WritePosts -and -not $DryRun) {
            $wasExistingBeforeWrite = $postExists
            Write-PostFile `
                -Path $postPath `
                -Title $title `
                -PostId $postId `
                -Date $date `
                -Caption $caption `
                -Hashtags $hashtags `
                -Handles $handles `
                -Tags $postTags `
                -Categories $postCategories `
                -Location $location `
                -GalleryKey $galleryKey `
                -SourceId $sourceId `
                -Timestamp $timestamp `
                -MediaCount $mediaItems.Count `
                -CrossPostSource $crossPostSource `
                -DryRun:$effectiveDryRun `
                -Force:$Force

            if ((-not $wasExistingBeforeWrite) -or $Force) {
                $postFilesWritten++
            }
        }
        elseif ($WritePosts -and $DryRun) {
            Add-ReportLine "  DRY RUN: Would write post: $(Get-RelativeDisplayPath -Path $postPath)"
        }
        else {
            Add-ReportLine "  Post write disabled. Use -WritePosts to write: $(Get-RelativeDisplayPath -Path $postPath)"
        }

        $mediaIndex = 0
        foreach ($media in $mediaItems) {
            $mediaIndex++

            try {
                $mediaUri = Repair-InstagramString -Value $media.uri
                $mediaTimestamp = $media.creation_timestamp
                $mediaDate = Convert-UnixTimestamp -Timestamp $mediaTimestamp

                if (-not $mediaDate) {
                    $mediaDate = $date
                }

                $mediaPath = if ([string]::IsNullOrWhiteSpace($mediaUri)) {
                    $null
                }
                else {
                    [System.IO.Path]::GetFullPath((Join-Path $ExportRoot ($mediaUri -replace '/', [System.IO.Path]::DirectorySeparatorChar)))
                }

                $mediaExists = if ($mediaPath) { Test-Path -LiteralPath $mediaPath } else { $false }
                if (-not $mediaExists) {
                    $missingMediaFiles++
                }

                $blobPlan = Get-BlobPlan -StorageAccountBaseUrl $StorageAccountBaseUrl -Date $date -MediaUri $mediaUri
                $mediaTitle = Repair-InstagramString -Value $media.title

                if ([string]::IsNullOrWhiteSpace($mediaTitle)) {
                    $mediaTitle = $title
                }

                if ([string]::IsNullOrWhiteSpace($mediaTitle)) {
                    $mediaTitle = [System.IO.Path]::GetFileNameWithoutExtension($blobPlan.FileName)
                }

                $itemId = "{0}-{1:00}" -f $sourceId, $mediaIndex
                $galleryPath = Get-UniquePath -Path (Join-Path $GalleryOutputRoot "$itemId.md") -ReservedPaths $PlannedGalleryPaths
                $galleryExists = Test-Path -LiteralPath $galleryPath

                if ($galleryExists) {
                    $galleryFilesExisting++
                }

                $galleryItemsPlanned++
                $mediaCrossPostSource = Get-CrossPostSource -Post $post -Media $media
                $metadataRaw = Get-MediaMetadataRaw -MediaMetadata $media.media_metadata

                Add-ReportLine "  Media $mediaIndex"
                Add-ReportLine "    uri: $mediaUri"
                Add-ReportLine "    local resolved file path: $mediaPath"
                Add-ReportLine "    local file exists: $mediaExists"
                Add-ReportLine "    proposed source_filename: $($blobPlan.FileName)"
                Add-ReportLine "    raw_url: $($blobPlan.RawUrl)"
                Add-ReportLine "    thumb_url: $($blobPlan.ThumbUrl)"
                Add-ReportLine "    proposed gallery file: $(Get-RelativeDisplayPath -Path $galleryPath)"
                Add-ReportLine "    gallery file exists: $galleryExists"

                if ($null -eq $sampleGalleryOutput) {
                    $sampleGalleryOutput = New-GalleryItemFileContent `
                        -Date $mediaDate `
                        -Title $mediaTitle `
                        -PostId $postId `
                        -Tags $hashtags `
                        -GalleryKey $galleryKey `
                        -ItemId $itemId `
                        -MediaUri $mediaUri `
                        -PostTimestamp $timestamp `
                        -MediaTimestamp $mediaTimestamp `
                        -CrossPostSource $mediaCrossPostSource `
                        -MediaMetadataRaw $metadataRaw `
                        -SourceFileName $blobPlan.FileName `
                        -RawUrl $blobPlan.RawUrl `
                        -ThumbUrl $blobPlan.ThumbUrl `
                        -PostUrl $postUrl `
                        -Index $mediaIndex
                }

                if ($WriteGalleryItems -and -not $DryRun) {
                    $wasExistingBeforeWrite = $galleryExists
                    Write-GalleryItemFile `
                        -Path $galleryPath `
                        -Date $mediaDate `
                        -Title $mediaTitle `
                        -PostId $postId `
                        -Tags $hashtags `
                        -GalleryKey $galleryKey `
                        -ItemId $itemId `
                        -MediaUri $mediaUri `
                        -PostTimestamp $timestamp `
                        -MediaTimestamp $mediaTimestamp `
                        -CrossPostSource $mediaCrossPostSource `
                        -MediaMetadataRaw $metadataRaw `
                        -SourceFileName $blobPlan.FileName `
                        -RawUrl $blobPlan.RawUrl `
                        -ThumbUrl $blobPlan.ThumbUrl `
                        -PostUrl $postUrl `
                        -Index $mediaIndex `
                        -DryRun:$effectiveDryRun `
                        -Force:$Force

                    if ((-not $wasExistingBeforeWrite) -or $Force) {
                        $galleryFilesWritten++
                    }
                }
                elseif ($WriteGalleryItems -and $DryRun) {
                    Add-ReportLine "    DRY RUN: Would write gallery item: $(Get-RelativeDisplayPath -Path $galleryPath)"
                }
                else {
                    Add-ReportLine "    Gallery item write disabled. Use -WriteGalleryItems to write: $(Get-RelativeDisplayPath -Path $galleryPath)"
                }
            }
            catch {
                $badMedia++
                Add-ReportLine "  Media $mediaIndex"
                Add-ReportLine "    ERROR: $($_.Exception.Message)"
            }
        }

        Add-ReportLine ""
    }
    catch {
        $badPosts++
        Add-ReportLine "Post $postNumber"
        Add-ReportLine "  ERROR: $($_.Exception.Message)"
        Add-ReportLine ""
    }
}

Add-ReportLine "Counts By Year"
foreach ($yearKey in ($countsByYear.Keys | Sort-Object)) {
    Add-ReportLine "- ${yearKey}: $($countsByYear[$yearKey])"
}
Add-ReportLine ""

Add-ReportLine "Timestamp And Caption Sources"
Add-ReportLine "- Posts with top-level timestamp: $postsWithTopTimestamp"
Add-ReportLine "- Posts using first media timestamp fallback: $postsUsingMediaTimestampFallback"
Add-ReportLine "- Posts with top-level caption: $postsWithTopCaption"
Add-ReportLine "- Posts using first media caption fallback: $postsUsingMediaCaptionFallback"
Add-ReportLine ""

Add-ReportLine "Summary"
Add-ReportLine "- posts planned: $postsPlanned"
Add-ReportLine "- post files that already exist: $postFilesExisting"
Add-ReportLine "- post files written: $postFilesWritten"
Add-ReportLine "- missing media files: $missingMediaFiles"
Add-ReportLine "- gallery items planned: $galleryItemsPlanned"
Add-ReportLine "- gallery files that already exist: $galleryFilesExisting"
Add-ReportLine "- gallery files written: $galleryFilesWritten"
Add-ReportLine "- hashtag count: $hashtagTotal"
Add-ReportLine "- handle count: $handleTotal"
Add-ReportLine "- category assignment count: $categoryTotal"
Add-ReportLine "- location count: $locationCount"
Add-ReportLine "- skipped posts: $skippedPosts"
Add-ReportLine "- bad posts: $badPosts"
Add-ReportLine "- bad media items: $badMedia"
Add-ReportLine ""

if ($samplePostOutput) {
    Add-ReportLine "Sample Proposed Post Output"
    Add-ReportLine $samplePostOutput.TrimEnd()
    Add-ReportLine ""
}

if ($sampleGalleryOutput) {
    Add-ReportLine "Sample Proposed Gallery Item Output"
    Add-ReportLine $sampleGalleryOutput.TrimEnd()
    Add-ReportLine ""
}

$reportDirectory = Split-Path $ReportFullPath -Parent
if (-not (Test-Path -LiteralPath $reportDirectory)) {
    New-Item -ItemType Directory -Path $reportDirectory | Out-Null
}

$ReportLines | Set-Content -LiteralPath $ReportFullPath -Encoding UTF8

Write-Host ""
Write-Host "Report written: $ReportFullPath" -ForegroundColor Green
