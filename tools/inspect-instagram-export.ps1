param(
    [string]$ExportPath = ".tmp/instagram-export",
    [string]$ReportPath = "tools/instagram-export-report.txt",
    [long]$MaxJsonParseBytes = 256KB,
    [long]$MaxLikelyMediaJsonParseBytes = 2MB,
    [long]$MaxJsonScanBytes = 2MB
)

$RepoRoot = Split-Path -Parent $PSScriptRoot
$CommonJsonFields = @(
    "media",
    "uri",
    "title",
    "creation_timestamp",
    "timestamp",
    "string_map_data",
    "attachments",
    "data"
)
$CommonJsonFieldLookup = @{}
foreach ($field in $CommonJsonFields) {
    $CommonJsonFieldLookup[$field.ToLowerInvariant()] = $field
}
$MetadataExtensions = @(".json", ".html", ".htm", ".csv")
$MediaExtensions = @(".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".mov")
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

    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $rootPath = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    $rootWithSlash = $rootPath + [System.IO.Path]::DirectorySeparatorChar

    try {
        return [System.IO.Path]::GetRelativePath($RepoRoot, $fullPath)
    }
    catch {
        if ($fullPath.StartsWith($rootWithSlash, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $fullPath.Substring($rootWithSlash.Length)
        }

        return $fullPath
    }
}

function Add-ReportLine {
    param([string]$Line = "")

    [void]$script:ReportLines.Add($Line)
}

function Write-ReportFile {
    param([string]$Path)

    try {
        $script:ReportLines | Set-Content -LiteralPath $Path -Encoding UTF8 -ErrorAction Stop
        return $true
    }
    catch {
        Write-Host "Could not write report: $Path" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        return $false
    }
}

function Format-FileSize {
    param([long]$Bytes)

    if ($Bytes -ge 1GB) { return "{0:N2} GB" -f ($Bytes / 1GB) }
    if ($Bytes -ge 1MB) { return "{0:N2} MB" -f ($Bytes / 1MB) }
    if ($Bytes -ge 1KB) { return "{0:N2} KB" -f ($Bytes / 1KB) }
    return "$Bytes B"
}

function Get-Snippet {
    param(
        [object]$Value,
        [int]$MaxLength = 220
    )

    if ($null -eq $Value) {
        return "<null>"
    }

    $text = [string]$Value
    $text = $text -replace "\s+", " "
    $text = $text.Trim()

    if ($text.Length -gt $MaxLength) {
        return $text.Substring(0, $MaxLength) + "..."
    }

    return $text
}

function Get-TextWindow {
    param(
        [string]$Text,
        [int]$Index,
        [int]$WindowLength = 260
    )

    if ([string]::IsNullOrEmpty($Text)) {
        return ""
    }

    $start = [Math]::Max(0, $Index - 80)
    $length = [Math]::Min($WindowLength, $Text.Length - $start)

    return Get-Snippet ($Text.Substring($start, $length)) $WindowLength
}

function Read-FilePrefix {
    param(
        [string]$Path,
        [long]$Bytes
    )

    $stream = $null

    try {
        $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        $length = [int][Math]::Min($Bytes, $stream.Length)
        $buffer = New-Object byte[] $length
        [void]$stream.Read($buffer, 0, $length)

        return [System.Text.Encoding]::UTF8.GetString($buffer)
    }
    finally {
        if ($stream) {
            $stream.Dispose()
        }
    }
}

function Test-ScalarValue {
    param([object]$Value)

    if ($null -eq $Value) { return $true }
    if ($Value -is [string]) { return $true }
    if ($Value -is [datetime]) { return $true }
    if ($Value -is [decimal]) { return $true }
    if ($Value.GetType().IsPrimitive) { return $true }

    return $false
}

function Get-JsonTopLevelSummary {
    param([object]$Json)

    if ($null -eq $Json) {
        return "Top level: null"
    }

    if ($Json -is [System.Array]) {
        $summary = "Top level: array, items: $($Json.Count)"

        if ($Json.Count -gt 0 -and -not (Test-ScalarValue $Json[0])) {
            $firstKeys = @($Json[0].PSObject.Properties | Select-Object -ExpandProperty Name)
            if ($firstKeys.Count -gt 0) {
                $summary += "; first item keys: " + (($firstKeys | Select-Object -First 20) -join ", ")
            }
        }

        return $summary
    }

    if (-not (Test-ScalarValue $Json)) {
        $keys = @($Json.PSObject.Properties | Select-Object -ExpandProperty Name)
        if ($keys.Count -gt 0) {
            return "Top level: object; keys: " + (($keys | Select-Object -First 30) -join ", ")
        }
    }

    return "Top level: scalar ($($Json.GetType().Name))"
}

function New-JsonFieldHits {
    $hits = [ordered]@{}

    foreach ($field in $CommonJsonFields) {
        $hits[$field] = [pscustomobject]@{
            HitCount = 0
            Examples = New-Object System.Collections.Generic.List[string]
        }
    }

    return $hits
}

function Add-JsonFieldHit {
    param(
        [hashtable]$Hits,
        [string]$Field,
        [string]$Path,
        [object]$Value
    )

    if (-not $Hits.Contains($Field)) {
        return
    }

    $hit = $Hits[$Field]
    $hit.HitCount = $hit.HitCount + 1

    if ($hit.Examples.Count -lt 5) {
        [void]$hit.Examples.Add("$Path = $(Get-Snippet $Value 160)")
    }
}

function Add-RawJsonSignals {
    param(
        [string]$Raw,
        [hashtable]$Hits,
        [pscustomobject]$Finding
    )

    $comparison = [System.StringComparison]::OrdinalIgnoreCase
    $maxRawFieldHits = 5000

    foreach ($field in $CommonJsonFields) {
        $needle = '"' + $field + '"'
        $hit = $Hits[$field]
        $index = $Raw.IndexOf($needle, 0, $comparison)

        while ($index -ge 0 -and $hit.HitCount -lt $maxRawFieldHits) {
            $hit.HitCount = $hit.HitCount + 1

            if ($hit.Examples.Count -lt 5) {
                [void]$hit.Examples.Add("$.$field ~= $(Get-TextWindow -Text $Raw -Index $index -WindowLength 180)")
            }

            $nextStart = $index + $needle.Length
            if ($nextStart -ge $Raw.Length) {
                break
            }

            $index = $Raw.IndexOf($needle, $nextStart, $comparison)
        }

        if ($index -ge 0 -and $hit.HitCount -ge $maxRawFieldHits -and $hit.Examples.Count -lt 5) {
            [void]$hit.Examples.Add("$.$field scan stopped after $maxRawFieldHits matches")
        }
    }

    if ($Hits["title"].HitCount -gt 0) {
        $Finding.HasCaption = $true
        foreach ($example in $Hits["title"].Examples) {
            Add-CandidateExample -List $Finding.CaptionExamples -Text "raw title ~= $(Get-Snippet $example 180)"
        }
    }

    $captionIndex = $Raw.IndexOf('"caption"', 0, $comparison)
    while ($captionIndex -ge 0 -and $Finding.CaptionExamples.Count -lt 5) {
        $Finding.HasCaption = $true
        Add-CandidateExample -List $Finding.CaptionExamples -Text "raw caption ~= $(Get-TextWindow -Text $Raw -Index $captionIndex -WindowLength 180)"

        $nextStart = $captionIndex + 9
        if ($nextStart -ge $Raw.Length) {
            break
        }

        $captionIndex = $Raw.IndexOf('"caption"', $nextStart, $comparison)
    }

    foreach ($field in @("creation_timestamp", "timestamp")) {
        if ($Hits[$field].HitCount -eq 0) {
            continue
        }

        $Finding.HasTimestamp = $true
        foreach ($example in $Hits[$field].Examples) {
            Add-CandidateExample -List $Finding.TimestampExamples -Text "raw $field ~= $(Get-Snippet $example 140)"
        }
    }

    foreach ($needle in @("media/", "media\/")) {
        $index = $Raw.IndexOf($needle, 0, $comparison)

        while ($index -ge 0 -and $Finding.MediaPathExamples.Count -lt 5) {
            $Finding.HasMediaPath = $true
            Add-CandidateExample -List $Finding.MediaPathExamples -Text "raw media path ~= $(Get-TextWindow -Text $Raw -Index $index -WindowLength 180)"

            $nextStart = $index + $needle.Length
            if ($nextStart -ge $Raw.Length) {
                break
            }

            $index = $Raw.IndexOf($needle, $nextStart, $comparison)
        }
    }
}

function Add-CandidateExample {
    param(
        [System.Collections.Generic.List[string]]$List,
        [string]$Text,
        [int]$Limit = 5
    )

    if ($List.Count -lt $Limit) {
        [void]$List.Add($Text)
    }
}

function Get-JsonArrayCount {
    param([object]$Value)

    if ($null -eq $Value) { return $null }
    if ($Value -is [string]) { return $null }
    if ($Value -is [System.Collections.ICollection]) { return $Value.Count }
    if ($Value -is [System.Array]) { return $Value.Count }

    return $null
}

function Search-JsonValue {
    param(
        [object]$Value,
        [string]$Path,
        [int]$Depth,
        [hashtable]$Hits,
        [pscustomobject]$Finding,
        [int]$MaxDepth = 40,
        [int]$MaxNodes = 20000
    )

    if ($null -eq $Value -or $Depth -gt $MaxDepth) {
        return
    }

    if ($Finding.PSObject.Properties.Name -contains "TraversalNodes") {
        $Finding.TraversalNodes = $Finding.TraversalNodes + 1

        if ($Finding.TraversalNodes -gt $MaxNodes) {
            $Finding.TraversalTruncated = $true
            return
        }
    }

    if ($Value -is [System.Collections.IDictionary]) {
        foreach ($key in $Value.Keys) {
            $name = [string]$key
            $childPath = "$Path.$name"
            $childValue = $Value[$key]

            if ($null -ne $Hits -and $CommonJsonFields -contains $name) {
                Add-JsonFieldHit -Hits $Hits -Field $name -Path $childPath -Value $childValue
            }

            Search-JsonCandidate -Name $name -Path $childPath -Value $childValue -Finding $Finding
            Search-JsonValue -Value $childValue -Path $childPath -Depth ($Depth + 1) -Hits $Hits -Finding $Finding -MaxDepth $MaxDepth -MaxNodes $MaxNodes
        }

        return
    }

    if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
        $index = 0

        foreach ($item in $Value) {
            Search-JsonValue -Value $item -Path "$Path[$index]" -Depth ($Depth + 1) -Hits $Hits -Finding $Finding -MaxDepth $MaxDepth -MaxNodes $MaxNodes
            $index++
        }

        return
    }

    if (-not (Test-ScalarValue $Value)) {
        $properties = @($Value.PSObject.Properties | Where-Object { $_.MemberType -eq "NoteProperty" -or $_.MemberType -eq "Property" })

        if ($properties.Count -gt 0) {
            foreach ($property in $properties) {
                $name = [string]$property.Name
                $childPath = "$Path.$name"
                $childValue = $property.Value

                if ($null -ne $Hits -and $CommonJsonFields -contains $name) {
                    Add-JsonFieldHit -Hits $Hits -Field $name -Path $childPath -Value $childValue
                }

                Search-JsonCandidate -Name $name -Path $childPath -Value $childValue -Finding $Finding
                Search-JsonValue -Value $childValue -Path $childPath -Depth ($Depth + 1) -Hits $Hits -Finding $Finding -MaxDepth $MaxDepth -MaxNodes $MaxNodes
            }

            return
        }
    }
}

function Search-JsonCandidate {
    param(
        [string]$Name,
        [string]$Path,
        [object]$Value,
        [pscustomobject]$Finding
    )

    $lowerName = $Name.ToLowerInvariant()
    $arrayCount = Get-JsonArrayCount $Value

    if (($lowerName -eq "media" -or $lowerName -eq "attachments") -and $null -ne $arrayCount -and $arrayCount -gt 1) {
        $Finding.HasCarousel = $true
        Add-CandidateExample -List $Finding.CarouselExamples -Text "$Path has $arrayCount items"
    }

    if ($lowerName -eq "creation_timestamp" -or $lowerName -eq "timestamp" -or $lowerName -eq "taken_at") {
        $Finding.HasTimestamp = $true
        Add-CandidateExample -List $Finding.TimestampExamples -Text "$Path = $(Get-Snippet $Value 120)"
    }

    if ($Value -is [string]) {
        $text = [string]$Value

        if ($lowerName -eq "title" -or $lowerName -eq "caption" -or $Path -match "(?i)\.(caption|description|text|message)\.value$") {
            if (-not [string]::IsNullOrWhiteSpace($text)) {
                $Finding.HasCaption = $true
                Add-CandidateExample -List $Finding.CaptionExamples -Text "$Path = $(Get-Snippet $text 180)"
            }
        }

        if ($text -match "(?i)(^|[\\/])media[\\/].+\.(jpg|jpeg|png|webp|gif|mp4|mov)$" -or $text -match "(?i)\.(jpg|jpeg|png|webp|gif|mp4|mov)(\?.*)?$") {
            $Finding.HasMediaPath = $true
            Add-CandidateExample -List $Finding.MediaPathExamples -Text "$Path = $(Get-Snippet $text 180)"
        }
    }
}

function Search-JsonTopLevelCandidates {
    param(
        [object]$Json,
        [pscustomobject]$Finding,
        [int]$MaxItems = 5000
    )

    function Test-TopLevelItem {
        param(
            [object]$Item,
            [string]$Path
        )

        if ($null -eq $Item -or (Test-ScalarValue $Item)) {
            return
        }

        foreach ($propertyName in @("media", "attachments")) {
            $property = $Item.PSObject.Properties[$propertyName]

            if ($null -eq $property) {
                continue
            }

            $arrayCount = Get-JsonArrayCount $property.Value

            if ($null -ne $arrayCount -and $arrayCount -gt 1) {
                $Finding.HasCarousel = $true
                Add-CandidateExample -List $Finding.CarouselExamples -Text "$Path.$propertyName has $arrayCount items"
            }
        }
    }

    if ($Json -is [System.Array]) {
        $index = 0

        foreach ($item in $Json) {
            if ($index -ge $MaxItems) {
                $Finding.TraversalTruncated = $true
                break
            }

            Test-TopLevelItem -Item $item -Path "`$[$index]"
            $index++
        }

        return
    }

    if (-not (Test-ScalarValue $Json)) {
        foreach ($property in $Json.PSObject.Properties) {
            $value = $property.Value

            if ($value -is [System.Array]) {
                $index = 0

                foreach ($item in $value) {
                    if ($index -ge $MaxItems) {
                        $Finding.TraversalTruncated = $true
                        break
                    }

                    Test-TopLevelItem -Item $item -Path "`$.$($property.Name)[$index]"
                    $index++
                }
            }
            else {
                Test-TopLevelItem -Item $value -Path "`$.$($property.Name)"
            }
        }
    }
}

function Inspect-JsonFile {
    param([System.IO.FileInfo]$File)

    $relativePath = Get-RelativeDisplayPath $File.FullName
    $finding = [pscustomobject]@{
        Path = $relativePath
        Parsed = $false
        ParseSkipped = $false
        Error = $null
        TopLevelSummary = ""
        FieldHits = New-JsonFieldHits
        RawScanSampled = $false
        RawScanBytes = 0
        HasCaption = $false
        HasTimestamp = $false
        HasMediaPath = $false
        HasCarousel = $false
        TraversalNodes = 0
        TraversalTruncated = $false
        CaptionExamples = New-Object System.Collections.Generic.List[string]
        TimestampExamples = New-Object System.Collections.Generic.List[string]
        MediaPathExamples = New-Object System.Collections.Generic.List[string]
        CarouselExamples = New-Object System.Collections.Generic.List[string]
    }

    try {
        $lowerRelativePath = $relativePath.ToLowerInvariant()
        $fileName = $File.Name.ToLowerInvariant()
        $looksLikePostMediaMetadata = (
            $lowerRelativePath -match '(^|[\\/])media[\\/]' -or
            ($lowerRelativePath -match '(^|[\\/])content[\\/]' -and $fileName -match '^(posts|reels|stories|igtv|profile_photos).*\.json$')
        )
        $generalParseAllowed = ($MaxJsonParseBytes -le 0 -or $File.Length -le $MaxJsonParseBytes)
        $likelyMediaParseAllowed = ($looksLikePostMediaMetadata -and ($MaxLikelyMediaJsonParseBytes -le 0 -or $File.Length -le $MaxLikelyMediaJsonParseBytes))
        $shouldReadFullJson = ($generalParseAllowed -or $likelyMediaParseAllowed)

        if ($shouldReadFullJson -or $MaxJsonScanBytes -le 0) {
            $raw = Get-Content -LiteralPath $File.FullName -Raw -ErrorAction Stop
            $finding.RawScanBytes = $File.Length
        }
        else {
            $raw = Read-FilePrefix -Path $File.FullName -Bytes $MaxJsonScanBytes
            $finding.RawScanSampled = $true
            $finding.RawScanBytes = [Math]::Min($MaxJsonScanBytes, $File.Length)
        }

        Add-RawJsonSignals -Raw $raw -Hits $finding.FieldHits -Finding $finding

        if (-not $shouldReadFullJson) {
            $finding.ParseSkipped = $true
            $finding.Error = "Skipped ConvertFrom-Json because file size is $(Format-FileSize $File.Length), above the active parse limit. Raw field signals were collected from $(Format-FileSize $finding.RawScanBytes)."
            return $finding
        }

        $json = $raw | ConvertFrom-Json -ErrorAction Stop
        $finding.Parsed = $true
        $finding.TopLevelSummary = Get-JsonTopLevelSummary $json

        if ($looksLikePostMediaMetadata) {
            Search-JsonTopLevelCandidates -Json $json -Finding $finding -MaxItems 5000
        }
    }
    catch {
        $finding.Error = $_.Exception.Message
    }

    return $finding
}

function Inspect-HtmlFile {
    param([System.IO.FileInfo]$File)

    $relativePath = Get-RelativeDisplayPath $File.FullName
    $snippets = New-Object System.Collections.Generic.List[string]
    $pattern = "(?i)(caption|timestamp|creation|datetime|media[\\/]|\.jpg|\.jpeg|\.png|\.webp|\.gif|\.mp4|\.mov|<img|<video|<source|posts?)"

    try {
        $matches = @(Select-String -LiteralPath $File.FullName -Pattern $pattern -ErrorAction Stop | Select-Object -First 8)

        foreach ($match in $matches) {
            [void]$snippets.Add("line $($match.LineNumber): $(Get-Snippet $match.Line 220)")
        }
    }
    catch {
        [void]$snippets.Add("ERROR: $($_.Exception.Message)")
    }

    return [pscustomobject]@{
        Path = $relativePath
        MatchCount = $snippets.Count
        Snippets = $snippets
    }
}

function Inspect-CsvFile {
    param([System.IO.FileInfo]$File)

    $relativePath = Get-RelativeDisplayPath $File.FullName
    $header = ""

    try {
        $header = Get-Content -LiteralPath $File.FullName -TotalCount 1 -ErrorAction Stop
    }
    catch {
        $header = "ERROR: $($_.Exception.Message)"
    }

    return [pscustomobject]@{
        Path = $relativePath
        Header = Get-Snippet $header 240
    }
}

$ResolvedExportPath = Resolve-RepoPath $ExportPath
$ResolvedReportPath = Resolve-RepoPath $ReportPath
$ReportDirectory = Split-Path -Parent $ResolvedReportPath

if (-not (Test-Path -LiteralPath $ReportDirectory)) {
    New-Item -ItemType Directory -Path $ReportDirectory -Force | Out-Null
}

Add-ReportLine "Instagram Export Discovery Report"
Add-ReportLine "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
Add-ReportLine "Repo root: $RepoRoot"
Add-ReportLine "Export path: $ResolvedExportPath"
Add-ReportLine "Report path: $ResolvedReportPath"
if ($MaxJsonParseBytes -gt 0) {
    Add-ReportLine "JSON parse size limit: $(Format-FileSize $MaxJsonParseBytes) for general files"
}
else {
    Add-ReportLine "JSON parse size limit: none"
}
if ($MaxLikelyMediaJsonParseBytes -gt 0) {
    Add-ReportLine "Likely media JSON parse size limit: $(Format-FileSize $MaxLikelyMediaJsonParseBytes)"
}
else {
    Add-ReportLine "Likely media JSON parse size limit: none"
}
if ($MaxJsonScanBytes -gt 0) {
    Add-ReportLine "JSON raw scan limit for oversized files: $(Format-FileSize $MaxJsonScanBytes)"
}
else {
    Add-ReportLine "JSON raw scan limit for oversized files: none"
}
Add-ReportLine ""

if (-not (Test-Path -LiteralPath $ResolvedExportPath -PathType Container)) {
    Add-ReportLine "ERROR: Export path was not found or is not a directory."
    Add-ReportLine ""
    Add-ReportLine "Run again with -ExportPath pointing at the root of your Instagram export."

    [void](Write-ReportFile -Path $ResolvedReportPath)

    Write-Host "Instagram export path not found: $ResolvedExportPath" -ForegroundColor Yellow
    Write-Host "Report written to: $ResolvedReportPath" -ForegroundColor Cyan
    exit 1
}

$allFiles = @(Get-ChildItem -LiteralPath $ResolvedExportPath -Recurse -File -Force -ErrorAction SilentlyContinue)
$metadataFiles = @($allFiles | Where-Object { $MetadataExtensions -contains $_.Extension.ToLowerInvariant() } | Sort-Object FullName)
$jsonFiles = @($metadataFiles | Where-Object { $_.Extension.ToLowerInvariant() -eq ".json" })
$htmlFiles = @($metadataFiles | Where-Object { $_.Extension.ToLowerInvariant() -eq ".html" -or $_.Extension.ToLowerInvariant() -eq ".htm" })
$csvFiles = @($metadataFiles | Where-Object { $_.Extension.ToLowerInvariant() -eq ".csv" })
$mediaFiles = @($allFiles | Where-Object { $MediaExtensions -contains $_.Extension.ToLowerInvariant() })

Add-ReportLine "Overview"
Add-ReportLine "- Total files: $($allFiles.Count)"
Add-ReportLine "- Metadata files: $($metadataFiles.Count)"
Add-ReportLine "- JSON files: $($jsonFiles.Count)"
Add-ReportLine "- HTML files: $($htmlFiles.Count)"
Add-ReportLine "- CSV files: $($csvFiles.Count)"
Add-ReportLine "- Media files: $($mediaFiles.Count)"
Add-ReportLine ""

Add-ReportLine "Top-Level Directories"
$topDirectories = @(Get-ChildItem -LiteralPath $ResolvedExportPath -Directory -Force -ErrorAction SilentlyContinue | Sort-Object Name)
if ($topDirectories.Count -eq 0) {
    Add-ReportLine "- No top-level directories found."
}
else {
    foreach ($directory in $topDirectories) {
        Add-ReportLine "- $(Get-RelativeDisplayPath $directory.FullName)"
    }
}
Add-ReportLine ""

Add-ReportLine "Likely Metadata Files"
if ($metadataFiles.Count -eq 0) {
    Add-ReportLine "- No JSON, HTML, HTM, or CSV files found."
}
else {
    foreach ($file in $metadataFiles) {
        Add-ReportLine "- $(Get-RelativeDisplayPath $file.FullName) ($($file.Extension.ToLowerInvariant()), $(Format-FileSize $file.Length))"
    }
}
Add-ReportLine ""

Add-ReportLine "Media File Counts"
if ($mediaFiles.Count -eq 0) {
    Add-ReportLine "- No media files found with extensions: $($MediaExtensions -join ', ')"
}
else {
    foreach ($group in ($mediaFiles | Group-Object { $_.Extension.ToLowerInvariant() } | Sort-Object Name)) {
        Add-ReportLine "- $($group.Name): $($group.Count)"
    }

    Add-ReportLine ""
    Add-ReportLine "Media Directories By Count"
    foreach ($group in ($mediaFiles | Group-Object DirectoryName | Sort-Object Count -Descending | Select-Object -First 25)) {
        Add-ReportLine "- $(Get-RelativeDisplayPath $group.Name): $($group.Count)"
    }

    Add-ReportLine ""
    Add-ReportLine "Sample Media Paths"
    foreach ($file in ($mediaFiles | Select-Object -First 25)) {
        Add-ReportLine "- $(Get-RelativeDisplayPath $file.FullName)"
    }
}
Add-ReportLine ""

$jsonFindings = @()
Add-ReportLine "JSON Inspection"
if ($jsonFiles.Count -eq 0) {
    Add-ReportLine "- No JSON files found."
}
else {
    foreach ($file in $jsonFiles) {
        $finding = Inspect-JsonFile $file
        $jsonFindings += $finding

        Add-ReportLine "- $($finding.Path)"

        if (-not $finding.Parsed) {
            if ($finding.ParseSkipped) {
                Add-ReportLine "  Parse skipped: $($finding.Error)"
            }
            else {
                Add-ReportLine "  Parse error: $($finding.Error)"
            }

            $fieldSummaries = @()
            foreach ($field in $CommonJsonFields) {
                $hit = $finding.FieldHits[$field]
                if ($hit.HitCount -gt 0) {
                    $fieldSummaries += "$field=$($hit.HitCount)"
                }
            }

            if ($fieldSummaries.Count -gt 0) {
                Add-ReportLine "  Common field hits: $($fieldSummaries -join ', ')"
            }

            if ($finding.HasCaption -or $finding.HasTimestamp -or $finding.HasMediaPath -or $finding.HasCarousel) {
                Add-ReportLine "  Candidate content: captions=$($finding.HasCaption), timestamps=$($finding.HasTimestamp), mediaPaths=$($finding.HasMediaPath), carousel=$($finding.HasCarousel)"
            }

            foreach ($example in $finding.CaptionExamples) {
                Add-ReportLine "    caption candidate: $example"
            }
            foreach ($example in $finding.TimestampExamples) {
                Add-ReportLine "    timestamp candidate: $example"
            }
            foreach ($example in $finding.MediaPathExamples) {
                Add-ReportLine "    media path candidate: $example"
            }

            continue
        }

        Add-ReportLine "  $($finding.TopLevelSummary)"

        $fieldSummaries = @()
        foreach ($field in $CommonJsonFields) {
            $hit = $finding.FieldHits[$field]
            if ($hit.HitCount -gt 0) {
                $fieldSummaries += "$field=$($hit.HitCount)"
            }
        }

        if ($fieldSummaries.Count -gt 0) {
            Add-ReportLine "  Common field hits: $($fieldSummaries -join ', ')"
        }
        else {
            Add-ReportLine "  Common field hits: none"
        }

        if ($finding.HasCaption -or $finding.HasTimestamp -or $finding.HasMediaPath -or $finding.HasCarousel) {
            Add-ReportLine "  Candidate content: captions=$($finding.HasCaption), timestamps=$($finding.HasTimestamp), mediaPaths=$($finding.HasMediaPath), carousel=$($finding.HasCarousel)"
        }

        if ($finding.TraversalTruncated) {
            Add-ReportLine "  Deep traversal stopped after $($finding.TraversalNodes) nodes for performance; raw field signals above still apply."
        }

        foreach ($field in $CommonJsonFields) {
            $hit = $finding.FieldHits[$field]
            foreach ($example in $hit.Examples) {
                Add-ReportLine "    $field example: $example"
            }
        }

        foreach ($example in $finding.CaptionExamples) {
            Add-ReportLine "    caption candidate: $example"
        }
        foreach ($example in $finding.TimestampExamples) {
            Add-ReportLine "    timestamp candidate: $example"
        }
        foreach ($example in $finding.MediaPathExamples) {
            Add-ReportLine "    media path candidate: $example"
        }
        foreach ($example in $finding.CarouselExamples) {
            Add-ReportLine "    carousel candidate: $example"
        }
    }
}
Add-ReportLine ""

$htmlFindings = @()
Add-ReportLine "HTML Inspection"
if ($htmlFiles.Count -eq 0) {
    Add-ReportLine "- No HTML or HTM files found."
}
else {
    foreach ($file in $htmlFiles) {
        $finding = Inspect-HtmlFile $file
        $htmlFindings += $finding

        Add-ReportLine "- $($finding.Path)"
        if ($finding.Snippets.Count -eq 0) {
            Add-ReportLine "  No likely post/caption/timestamp/media snippets found."
        }
        else {
            foreach ($snippet in $finding.Snippets) {
                Add-ReportLine "  $snippet"
            }
        }
    }
}
Add-ReportLine ""

Add-ReportLine "CSV Inspection"
if ($csvFiles.Count -eq 0) {
    Add-ReportLine "- No CSV files found."
}
else {
    foreach ($file in $csvFiles) {
        $finding = Inspect-CsvFile $file
        Add-ReportLine "- $($finding.Path)"
        Add-ReportLine "  Header: $($finding.Header)"
    }
}
Add-ReportLine ""

$captionFiles = @($jsonFindings | Where-Object { $_.HasCaption })
$timestampFiles = @($jsonFindings | Where-Object { $_.HasTimestamp })
$mediaPathFiles = @($jsonFindings | Where-Object { $_.HasMediaPath })
$carouselFiles = @($jsonFindings | Where-Object { $_.HasCarousel })
$parsedJsonCount = @($jsonFindings | Where-Object { $_.Parsed }).Count
$jsonParseSkippedCount = @($jsonFindings | Where-Object { $_.ParseSkipped }).Count
$jsonParseErrorCount = @($jsonFindings | Where-Object { -not $_.Parsed -and -not $_.ParseSkipped }).Count

Add-ReportLine "Content Signals"
Add-ReportLine "- Files with caption candidates: $($captionFiles.Count)"
foreach ($finding in ($captionFiles | Select-Object -First 20)) {
    Add-ReportLine "  - $($finding.Path)"
}
Add-ReportLine "- Files with timestamp candidates: $($timestampFiles.Count)"
foreach ($finding in ($timestampFiles | Select-Object -First 20)) {
    Add-ReportLine "  - $($finding.Path)"
}
Add-ReportLine "- Files with media path candidates: $($mediaPathFiles.Count)"
foreach ($finding in ($mediaPathFiles | Select-Object -First 20)) {
    Add-ReportLine "  - $($finding.Path)"
}
Add-ReportLine "- Files with carousel/multiple-media candidates: $($carouselFiles.Count)"
foreach ($finding in ($carouselFiles | Select-Object -First 20)) {
    Add-ReportLine "  - $($finding.Path)"
}
Add-ReportLine ""

Add-ReportLine "Recommended Import Approach"
if ($mediaPathFiles.Count -gt 0 -and $timestampFiles.Count -gt 0) {
    Add-ReportLine "- Prefer JSON as the source of truth. Start with files that have captions/timestamps/media paths, especially any under paths like content, posts, media, or your_instagram_activity."
}
elseif ($htmlFiles.Count -gt 0 -and $jsonFiles.Count -eq 0) {
    Add-ReportLine "- This looks HTML-oriented. Use the HTML snippets above to identify pages that include post text, timestamps, and media links before writing an importer."
}
else {
    Add-ReportLine "- The export shape is not fully obvious yet. Inspect the content-signal files above first, then map one representative post manually before writing an importer."
}
Add-ReportLine "- Resolve Instagram media URI/path values relative to the export root; do not assume they are site-ready URLs."
Add-ReportLine "- Treat media or attachments arrays with more than one item as carousel candidates."
Add-ReportLine "- Preserve original creation timestamps and convert them later into Jekyll post/gallery dates."
Add-ReportLine "- Keep this discovery phase read-only for media. Copying, thumbnailing, uploads, and Jekyll item creation should happen in a separate import script after the structure is confirmed."
Add-ReportLine ""

if (-not (Write-ReportFile -Path $ResolvedReportPath)) {
    exit 1
}

Write-Host "Instagram export discovery complete." -ForegroundColor Cyan
Write-Host "Export path: $ResolvedExportPath" -ForegroundColor Cyan
Write-Host "Report path: $ResolvedReportPath" -ForegroundColor Cyan
Write-Host "Files: total=$($allFiles.Count), metadata=$($metadataFiles.Count), json=$($jsonFiles.Count), html=$($htmlFiles.Count), csv=$($csvFiles.Count), media=$($mediaFiles.Count)" -ForegroundColor Cyan
Write-Host "JSON parsed=$parsedJsonCount, parseSkipped=$jsonParseSkippedCount, parseErrors=$jsonParseErrorCount, captionFiles=$($captionFiles.Count), timestampFiles=$($timestampFiles.Count), mediaPathFiles=$($mediaPathFiles.Count), carouselFiles=$($carouselFiles.Count)" -ForegroundColor Cyan
