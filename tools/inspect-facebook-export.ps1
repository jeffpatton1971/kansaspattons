param(
    [string]$ExportPath = ".facebook",
    [string]$ReportPath = "tools/facebook-export-report.txt"
)

$RepoRoot = Split-Path -Parent $PSScriptRoot
$MediaExtensions = @(".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".mov")
$PhotoExtensions = @(".jpg", ".jpeg", ".png", ".webp", ".gif")
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
        return $fullPath
    }
}

function Test-IsWithinPath {
    param(
        [string]$ChildPath,
        [string]$ParentPath
    )

    if ([string]::IsNullOrWhiteSpace($ChildPath) -or [string]::IsNullOrWhiteSpace($ParentPath)) {
        return $false
    }

    $child = [System.IO.Path]::GetFullPath($ChildPath).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    $parent = [System.IO.Path]::GetFullPath($ParentPath).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)

    return $child.Equals($parent, [System.StringComparison]::OrdinalIgnoreCase) -or
        $child.StartsWith($parent + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -or
        $child.StartsWith($parent + [System.IO.Path]::AltDirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}

function Add-ReportLine {
    param([string]$Line = "")

    [void]$script:ReportLines.Add($Line)
}

function Write-ReportFile {
    param([string]$Path)

    $directory = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($directory) -and -not (Test-Path -LiteralPath $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }

    $script:ReportLines | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Read-JsonFileSafe {
    param([System.IO.FileInfo]$File)

    try {
        $raw = Get-Content -LiteralPath $File.FullName -Raw -Encoding UTF8 -ErrorAction Stop
        $json = $raw | ConvertFrom-Json -Depth 100 -ErrorAction Stop

        return [pscustomobject]@{
            Success = $true
            Value = $json
            Error = $null
        }
    }
    catch {
        return [pscustomobject]@{
            Success = $false
            Value = $null
            Error = $_.Exception.Message
        }
    }
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

function Convert-ToText {
    param([object]$Value)

    if ($null -eq $Value) {
        return ""
    }

    return [string]$Value
}

function Get-TextPreview {
    param(
        [object]$Value,
        [int]$MaxLength = 120
    )

    $text = (Convert-ToText $Value) -replace "\s+", " "
    $text = $text.Trim()

    if ($text.Length -le $MaxLength) {
        return $text
    }

    return $text.Substring(0, $MaxLength - 3) + "..."
}

function Convert-TimestampToDateTime {
    param([object]$Value)

    if ($null -eq $Value) {
        return $null
    }

    try {
        $number = [Int64]$Value
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

function Format-DateValue {
    param([object]$Date)

    if ($null -eq $Date) {
        return ""
    }

    if ($Date -is [DateTime]) {
        return $Date.ToString("yyyy-MM-dd HH:mm:ss")
    }

    try {
        return ([DateTime]$Date).ToString("yyyy-MM-dd HH:mm:ss")
    }
    catch {
        return ""
    }
}

function Test-IsMediaUri {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $false
    }

    return $Value -match '(?i)\.(jpg|jpeg|png|webp|gif|mp4|mov)(\?.*)?$'
}

function Resolve-ExportMediaPath {
    param(
        [string]$Uri,
        [string]$ResolvedExportPath
    )

    if ([string]::IsNullOrWhiteSpace($Uri)) {
        return $null
    }

    $uriPath = ($Uri -split '\?')[0]
    $uriPath = $uriPath -replace '/', [System.IO.Path]::DirectorySeparatorChar

    if ([System.IO.Path]::IsPathRooted($uriPath)) {
        return [System.IO.Path]::GetFullPath($uriPath)
    }

    $exportCandidate = [System.IO.Path]::GetFullPath((Join-Path $ResolvedExportPath $uriPath))
    if (Test-Path -LiteralPath $exportCandidate) {
        return $exportCandidate
    }

    return [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $uriPath))
}

function Add-MediaUrisFromObject {
    param(
        [object]$Value,
        [System.Collections.Generic.HashSet[string]]$Uris,
        [int]$Depth = 0
    )

    if ($null -eq $Value -or $Depth -gt 60) {
        return
    }

    if ($Value -is [string]) {
        if (Test-IsMediaUri $Value) {
            [void]$Uris.Add($Value)
        }
        return
    }

    if ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [string]) {
        foreach ($item in $Value) {
            Add-MediaUrisFromObject -Value $item -Uris $Uris -Depth ($Depth + 1)
        }
        return
    }

    if ($null -eq $Value.PSObject) {
        return
    }

    foreach ($property in $Value.PSObject.Properties) {
        if ($property.Name -ieq "uri" -and $property.Value -is [string] -and (Test-IsMediaUri $property.Value)) {
            [void]$Uris.Add($property.Value)
        }

        Add-MediaUrisFromObject -Value $property.Value -Uris $Uris -Depth ($Depth + 1)
    }
}

function Add-TimestampsFromObject {
    param(
        [object]$Value,
        [System.Collections.Generic.List[DateTime]]$Dates,
        [int]$Depth = 0
    )

    if ($null -eq $Value -or $Depth -gt 60) {
        return
    }

    if ($Value -is [string]) {
        return
    }

    if ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [string]) {
        foreach ($item in $Value) {
            Add-TimestampsFromObject -Value $item -Dates $Dates -Depth ($Depth + 1)
        }
        return
    }

    if ($null -eq $Value.PSObject) {
        return
    }

    foreach ($property in $Value.PSObject.Properties) {
        if ($property.Name -match '^(timestamp|timestamp_ms|creation_timestamp|taken_timestamp|update_timestamp)$') {
            $date = Convert-TimestampToDateTime $property.Value
            if ($null -ne $date) {
                [void]$Dates.Add($date)
            }
        }

        Add-TimestampsFromObject -Value $property.Value -Dates $Dates -Depth ($Depth + 1)
    }
}

function Get-DateRange {
    param([System.Collections.Generic.List[DateTime]]$Dates)

    if ($null -eq $Dates -or $Dates.Count -eq 0) {
        return [pscustomobject]@{
            Start = $null
            End = $null
        }
    }

    $sorted = $Dates | Sort-Object

    return [pscustomobject]@{
        Start = $sorted[0]
        End = $sorted[-1]
    }
}

function Get-PostText {
    param([object]$Post)

    $direct = Get-ObjectProperty -Value $Post -Names @("post", "text", "content", "description")
    if (-not [string]::IsNullOrWhiteSpace($direct)) {
        return [string]$direct
    }

    $data = Get-ObjectProperty -Value $Post -Names @("data")
    if ($null -ne $data -and $data -is [System.Collections.IEnumerable]) {
        foreach ($item in $data) {
            $postText = Get-ObjectProperty -Value $item -Names @("post")
            if (-not [string]::IsNullOrWhiteSpace($postText)) {
                return [string]$postText
            }
        }
    }

    return ""
}

function Get-ObjectList {
    param([object]$Json)

    if ($null -eq $Json) {
        return @()
    }

    if ($Json -is [System.Collections.IEnumerable] -and $Json -isnot [string]) {
        return @($Json)
    }

    foreach ($name in @("posts", "photos", "videos", "data", "items")) {
        $value = Get-ObjectProperty -Value $Json -Names @($name)
        if ($null -ne $value -and $value -is [System.Collections.IEnumerable] -and $value -isnot [string]) {
            return @($value)
        }
    }

    return @($Json)
}

function Get-AlbumInfo {
    param(
        [System.IO.FileInfo]$File,
        [object]$Json,
        [string]$ResolvedExportPath
    )

    $mediaUris = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    Add-MediaUrisFromObject -Value $Json -Uris $mediaUris

    $dates = New-Object 'System.Collections.Generic.List[DateTime]'
    Add-TimestampsFromObject -Value $Json -Dates $dates
    $dateRange = Get-DateRange $dates

    $missingCount = 0
    foreach ($uri in $mediaUris) {
        $resolved = Resolve-ExportMediaPath -Uri $uri -ResolvedExportPath $ResolvedExportPath
        if (-not (Test-Path -LiteralPath $resolved)) {
            $missingCount++
        }
    }

    $title = Get-ObjectProperty -Value $Json -Names @("name", "title", "album_name")
    $description = Get-ObjectProperty -Value $Json -Names @("description", "caption")

    return [pscustomobject]@{
        File = $File.FullName
        Title = Get-TextPreview -Value $title -MaxLength 160
        Description = Get-TextPreview -Value $description -MaxLength 220
        StartDate = $dateRange.Start
        EndDate = $dateRange.End
        MediaReferenceCount = $mediaUris.Count
        MissingMediaCount = $missingCount
        FirstMediaUris = @($mediaUris | Select-Object -First 5)
    }
}

function Get-PostSample {
    param(
        [System.IO.FileInfo]$File,
        [object]$Post,
        [int]$Index
    )

    $mediaUris = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    Add-MediaUrisFromObject -Value $Post -Uris $mediaUris

    $timestamp = Get-ObjectProperty -Value $Post -Names @("timestamp", "creation_timestamp", "update_timestamp")
    $date = Convert-TimestampToDateTime $timestamp

    return [pscustomobject]@{
        File = $File.FullName
        Index = $Index
        Date = $date
        Title = Get-TextPreview -Value (Get-ObjectProperty -Value $Post -Names @("title", "name")) -MaxLength 140
        Text = Get-TextPreview -Value (Get-PostText $Post) -MaxLength 180
        MediaReferenceCount = $mediaUris.Count
    }
}

function Get-MessageFolderInfo {
    param(
        [System.IO.DirectoryInfo]$Folder,
        [string]$ResolvedExportPath
    )

    $photoPath = Join-Path $Folder.FullName "photos"
    $photoFiles = @()
    if (Test-Path -LiteralPath $photoPath) {
        $photoFiles = @(Get-ChildItem -LiteralPath $photoPath -File -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $PhotoExtensions -contains $_.Extension.ToLowerInvariant() })
    }

    $messageJsonFiles = @(Get-ChildItem -LiteralPath $Folder.FullName -Filter "*.json" -File -ErrorAction SilentlyContinue)
    $dates = New-Object 'System.Collections.Generic.List[DateTime]'
    $jsonErrors = New-Object System.Collections.Generic.List[string]

    foreach ($messageJson in $messageJsonFiles) {
        $parsed = Read-JsonFileSafe $messageJson
        if (-not $parsed.Success) {
            [void]$jsonErrors.Add("$($messageJson.Name): $($parsed.Error)")
            continue
        }

        Add-TimestampsFromObject -Value $parsed.Value -Dates $dates
    }

    $dateRange = Get-DateRange $dates

    return [pscustomobject]@{
        Folder = $Folder.FullName
        Name = $Folder.Name
        HasPhotosFolder = Test-Path -LiteralPath $photoPath
        PhotoCount = $photoFiles.Count
        MessageJsonFiles = @($messageJsonFiles | Sort-Object Name | ForEach-Object { $_.Name })
        StartDate = $dateRange.Start
        EndDate = $dateRange.End
        FirstPhotoFiles = @($photoFiles | Sort-Object Name | Select-Object -First 5 | ForEach-Object { $_.Name })
        JsonErrors = @($jsonErrors)
    }
}

$ResolvedExportPath = Resolve-RepoPath $ExportPath
$ResolvedReportPath = Resolve-RepoPath $ReportPath

if (-not (Test-Path -LiteralPath $ResolvedExportPath -PathType Container)) {
    throw "Facebook export path not found: $ResolvedExportPath"
}

if (Test-IsWithinPath -ChildPath $ResolvedReportPath -ParentPath $ResolvedExportPath) {
    throw "ReportPath must not be inside ExportPath. Refusing to write into the Facebook export: $ResolvedReportPath"
}

$jsonFiles = @(Get-ChildItem -LiteralPath $ResolvedExportPath -Filter "*.json" -File -Recurse -ErrorAction SilentlyContinue)
$mediaFiles = @(Get-ChildItem -LiteralPath $ResolvedExportPath -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $MediaExtensions -contains $_.Extension.ToLowerInvariant() })

$postsRoot = Join-Path $ResolvedExportPath "your_facebook_activity\posts"
$albumRoot = Join-Path $postsRoot "album"
$messagesInboxRoot = Join-Path $ResolvedExportPath "your_facebook_activity\messages\inbox"

$postJsonCandidates = @()
if (Test-Path -LiteralPath $postsRoot) {
    $postJsonCandidates = @($jsonFiles | Where-Object {
        (Test-IsWithinPath -ChildPath $_.FullName -ParentPath $postsRoot) -and
        -not (Test-IsWithinPath -ChildPath $_.FullName -ParentPath $albumRoot)
    })
}

$primaryPostJsonCandidates = @($postJsonCandidates | Where-Object {
    $_.Name -like "your_posts__check_ins__photos_and_videos*.json"
})

$albumJsonCandidates = @()
if (Test-Path -LiteralPath $albumRoot) {
    $albumJsonCandidates = @($jsonFiles | Where-Object { Test-IsWithinPath -ChildPath $_.FullName -ParentPath $albumRoot })
}

$albumInfos = New-Object System.Collections.Generic.List[object]
$jsonErrors = New-Object System.Collections.Generic.List[string]

foreach ($albumFile in ($albumJsonCandidates | Sort-Object FullName)) {
    $parsed = Read-JsonFileSafe $albumFile
    if (-not $parsed.Success) {
        [void]$jsonErrors.Add("Album JSON parse error: $(Get-RelativeDisplayPath $albumFile.FullName): $($parsed.Error)")
        continue
    }

    try {
        [void]$albumInfos.Add((Get-AlbumInfo -File $albumFile -Json $parsed.Value -ResolvedExportPath $ResolvedExportPath))
    }
    catch {
        [void]$jsonErrors.Add("Album inspection error: $(Get-RelativeDisplayPath $albumFile.FullName): $($_.Exception.Message)")
    }
}

$postSampleCandidates = @($postJsonCandidates | Sort-Object -Property @{
    Expression = {
        if ($_.Name -like "your_posts__check_ins__photos_and_videos*.json") { 0 }
        elseif ($_.Name -like "your_posts*.json") { 1 }
        else { 2 }
    }
}, FullName)

$postSamples = New-Object System.Collections.Generic.List[object]
foreach ($postFile in $postSampleCandidates) {
    if ($postSamples.Count -ge 3) {
        break
    }

    $parsed = Read-JsonFileSafe $postFile
    if (-not $parsed.Success) {
        [void]$jsonErrors.Add("Post JSON parse error: $(Get-RelativeDisplayPath $postFile.FullName): $($parsed.Error)")
        continue
    }

    $objects = Get-ObjectList $parsed.Value
    $index = 0
    foreach ($object in $objects) {
        if ($postSamples.Count -ge 3) {
            break
        }

        try {
            [void]$postSamples.Add((Get-PostSample -File $postFile -Post $object -Index $index))
        }
        catch {
            [void]$jsonErrors.Add("Post sample inspection error: $(Get-RelativeDisplayPath $postFile.FullName)[$index]: $($_.Exception.Message)")
        }

        $index++
    }
}

$messageFolders = @()
if (Test-Path -LiteralPath $messagesInboxRoot) {
    $messageFolders = @(Get-ChildItem -LiteralPath $messagesInboxRoot -Directory -ErrorAction SilentlyContinue | Sort-Object Name)
}

$messageFolderInfos = New-Object System.Collections.Generic.List[object]
foreach ($folder in $messageFolders) {
    try {
        [void]$messageFolderInfos.Add((Get-MessageFolderInfo -Folder $folder -ResolvedExportPath $ResolvedExportPath))
    }
    catch {
        [void]$jsonErrors.Add("Message folder inspection error: $(Get-RelativeDisplayPath $folder.FullName): $($_.Exception.Message)")
    }
}

$messageFoldersWithPhotos = @($messageFolderInfos | Where-Object { $_.PhotoCount -gt 0 })
$messageFoldersSkipped = @($messageFolderInfos | Where-Object { $_.PhotoCount -eq 0 })

$mediaFolderCounts = @($mediaFiles |
    Group-Object {
        $relative = Get-RelativeDisplayPath $_.DirectoryName
        if ([string]::IsNullOrWhiteSpace($relative)) { "." } else { $relative }
    } |
    Sort-Object -Property @{ Expression = "Count"; Descending = $true }, Name)

$albumMediaReferenceCount = ($albumInfos | Measure-Object -Property MediaReferenceCount -Sum).Sum
if ($null -eq $albumMediaReferenceCount) { $albumMediaReferenceCount = 0 }

$albumMissingMediaCount = ($albumInfos | Measure-Object -Property MissingMediaCount -Sum).Sum
if ($null -eq $albumMissingMediaCount) { $albumMissingMediaCount = 0 }

Add-ReportLine "Facebook Export Discovery Report"
Add-ReportLine "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Add-ReportLine "ExportPath: $ResolvedExportPath"
Add-ReportLine "ReportPath: $ResolvedReportPath"
Add-ReportLine ""
Add-ReportLine "Summary"
Add-ReportLine "======="
Add-ReportLine "Total JSON files: $($jsonFiles.Count)"
Add-ReportLine "Total media files: $($mediaFiles.Count)"
Add-ReportLine "Posts-related JSON candidates: $($postJsonCandidates.Count)"
Add-ReportLine "Primary regular post JSON candidates: $($primaryPostJsonCandidates.Count)"
Add-ReportLine "Album JSON candidates: $($albumJsonCandidates.Count)"
Add-ReportLine "Album count: $($albumInfos.Count)"
Add-ReportLine "Album media reference count: $albumMediaReferenceCount"
Add-ReportLine "Album missing media count: $albumMissingMediaCount"
Add-ReportLine "Message inbox folders total: $($messageFolders.Count)"
Add-ReportLine "Message inbox folders with photos: $($messageFoldersWithPhotos.Count)"
Add-ReportLine "Message inbox folders skipped because no photos: $($messageFoldersSkipped.Count)"
Add-ReportLine "JSON parse/inspection errors: $($jsonErrors.Count)"
Add-ReportLine ""

Add-ReportLine "Posts-Related JSON Candidates"
Add-ReportLine "============================="
foreach ($file in ($postJsonCandidates | Sort-Object FullName)) {
    Add-ReportLine "- $(Get-RelativeDisplayPath $file.FullName) ($($file.Length) bytes)"
}
Add-ReportLine ""

Add-ReportLine "Album JSON Candidates"
Add-ReportLine "====================="
foreach ($file in ($albumJsonCandidates | Sort-Object FullName)) {
    Add-ReportLine "- $(Get-RelativeDisplayPath $file.FullName) ($($file.Length) bytes)"
}
Add-ReportLine ""

Add-ReportLine "Media Folder Counts"
Add-ReportLine "==================="
foreach ($group in $mediaFolderCounts) {
    Add-ReportLine "- $($group.Name): $($group.Count)"
}
Add-ReportLine ""

Add-ReportLine "Sample Album Objects (first 3)"
Add-ReportLine "=============================="
foreach ($album in ($albumInfos | Select-Object -First 3)) {
    Add-ReportLine "- File: $(Get-RelativeDisplayPath $album.File)"
    Add-ReportLine "  Title: $($album.Title)"
    Add-ReportLine "  Date range: $(Format-DateValue $album.StartDate) to $(Format-DateValue $album.EndDate)"
    Add-ReportLine "  Description: $($album.Description)"
    Add-ReportLine "  Media references: $($album.MediaReferenceCount)"
    Add-ReportLine "  Missing media: $($album.MissingMediaCount)"
    if ($album.FirstMediaUris.Count -gt 0) {
        Add-ReportLine "  First media URIs:"
        foreach ($uri in $album.FirstMediaUris) {
            $resolved = Resolve-ExportMediaPath -Uri $uri -ResolvedExportPath $ResolvedExportPath
            Add-ReportLine "    - $uri"
            Add-ReportLine "      exists: $(Test-Path -LiteralPath $resolved)"
            Add-ReportLine "      local: $(Get-RelativeDisplayPath $resolved)"
        }
    }
}
Add-ReportLine ""

Add-ReportLine "Album Details"
Add-ReportLine "============="
foreach ($album in ($albumInfos | Sort-Object File)) {
    Add-ReportLine "- $(Get-RelativeDisplayPath $album.File)"
    Add-ReportLine "  title: $($album.Title)"
    Add-ReportLine "  date_range: $(Format-DateValue $album.StartDate) to $(Format-DateValue $album.EndDate)"
    Add-ReportLine "  media_references: $($album.MediaReferenceCount)"
    Add-ReportLine "  missing_media: $($album.MissingMediaCount)"
    if ($album.Description) {
        Add-ReportLine "  description: $($album.Description)"
    }
}
Add-ReportLine ""

Add-ReportLine "Sample Post Objects (first 3)"
Add-ReportLine "============================="
foreach ($post in $postSamples) {
    Add-ReportLine "- File: $(Get-RelativeDisplayPath $post.File)"
    Add-ReportLine "  Object index: $($post.Index)"
    Add-ReportLine "  Date: $(Format-DateValue $post.Date)"
    Add-ReportLine "  Title: $($post.Title)"
    Add-ReportLine "  Text: $($post.Text)"
    Add-ReportLine "  Media references: $($post.MediaReferenceCount)"
}
Add-ReportLine ""

Add-ReportLine "Sample Message-Photo Folders (first 10)"
Add-ReportLine "======================================="
foreach ($folder in ($messageFoldersWithPhotos | Sort-Object Name | Select-Object -First 10)) {
    Add-ReportLine "- Folder: $($folder.Name)"
    Add-ReportLine "  Photo count: $($folder.PhotoCount)"
    Add-ReportLine "  Message JSON files: $([string]::Join(', ', $folder.MessageJsonFiles))"
    Add-ReportLine "  Date range: $(Format-DateValue $folder.StartDate) to $(Format-DateValue $folder.EndDate)"
    Add-ReportLine "  First 5 photos: $([string]::Join(', ', $folder.FirstPhotoFiles))"
}
Add-ReportLine ""

Add-ReportLine "All Message-Photo Folders"
Add-ReportLine "========================="
foreach ($folder in ($messageFoldersWithPhotos | Sort-Object -Property @{ Expression = "PhotoCount"; Descending = $true }, Name)) {
    Add-ReportLine "- $($folder.Name)"
    Add-ReportLine "  photo_count: $($folder.PhotoCount)"
    Add-ReportLine "  message_json_files: $([string]::Join(', ', $folder.MessageJsonFiles))"
    Add-ReportLine "  date_range: $(Format-DateValue $folder.StartDate) to $(Format-DateValue $folder.EndDate)"
    Add-ReportLine "  first_5_photos: $([string]::Join(', ', $folder.FirstPhotoFiles))"
}
Add-ReportLine ""

Add-ReportLine "Message Inbox Folders Skipped Because No Photos"
Add-ReportLine "==============================================="
foreach ($folder in ($messageFoldersSkipped | Sort-Object Name)) {
    $reason = if ($folder.HasPhotosFolder) { "photos folder exists but contains no supported photo files" } else { "no photos folder" }
    Add-ReportLine "- $($folder.Name): $reason"
}
Add-ReportLine ""

if ($jsonErrors.Count -gt 0) {
    Add-ReportLine "JSON Parse/Inspection Errors"
    Add-ReportLine "============================"
    foreach ($errorLine in $jsonErrors) {
        Add-ReportLine "- $errorLine"
    }
    Add-ReportLine ""
}

Write-ReportFile $ResolvedReportPath

Write-Host "Facebook export discovery complete." -ForegroundColor Green
Write-Host "Report: $(Get-RelativeDisplayPath $ResolvedReportPath)"
Write-Host "Total JSON files: $($jsonFiles.Count)"
Write-Host "Total media files: $($mediaFiles.Count)"
Write-Host "Posts-related JSON candidates: $($postJsonCandidates.Count)"
Write-Host "Primary regular post JSON candidates: $($primaryPostJsonCandidates.Count)"
Write-Host "Album JSON candidates: $($albumJsonCandidates.Count)"
Write-Host "Album count: $($albumInfos.Count)"
Write-Host "Album media references: $albumMediaReferenceCount"
Write-Host "Album missing media: $albumMissingMediaCount"
Write-Host "Message inbox folders total: $($messageFolders.Count)"
Write-Host "Message inbox folders with photos: $($messageFoldersWithPhotos.Count)"
Write-Host "Message inbox folders skipped because no photos: $($messageFoldersSkipped.Count)"
Write-Host "JSON parse/inspection errors: $($jsonErrors.Count)"
