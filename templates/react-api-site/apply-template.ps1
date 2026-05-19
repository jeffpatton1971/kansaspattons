param(
  [Parameter(Mandatory = $true)]
  [string] $TargetRepo,

  [Parameter(Mandatory = $true)]
  [string] $VariablesPath,

  [switch] $Force
)

$ErrorActionPreference = 'Stop'

function Resolve-RequiredPath([string] $PathValue, [string] $Label) {
  $resolved = Resolve-Path -LiteralPath $PathValue -ErrorAction SilentlyContinue
  if (-not $resolved) {
    throw "$Label does not exist: $PathValue"
  }

  return $resolved.Path
}

function Convert-TokenName([string] $Name) {
  $chars = New-Object System.Collections.Generic.List[string]
  foreach ($char in $Name.ToCharArray()) {
    if ([char]::IsUpper($char)) {
      $chars.Add('_')
      $chars.Add([char]::ToUpperInvariant($char))
    } else {
      $chars.Add([char]::ToUpperInvariant($char))
    }
  }

  return -join $chars
}

$templateRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$scaffoldRoot = Join-Path $templateRoot 'scaffold'
$targetRoot = Resolve-RequiredPath $TargetRepo 'Target repository'
$variablesFile = Resolve-RequiredPath $VariablesPath 'Variables file'
$variables = Get-Content -LiteralPath $variablesFile -Raw | ConvertFrom-Json

$required = @(
  'siteId',
  'siteTitle',
  'canonicalUrl',
  'azureWebAppName',
  'azureWebAppResourceGroup',
  'sharedApiBaseUrl',
  'storageAccount',
  'storageContainer',
  'storagePrefix'
)

foreach ($name in $required) {
  $value = $variables.$name
  if (-not $value -or -not "$value".Trim()) {
    throw "Missing required template variable: $name"
  }
}

if ($variables.siteId -notmatch '^[a-z0-9][a-z0-9-]{0,62}$') {
  throw "siteId must use lowercase letters, numbers, and hyphens: $($variables.siteId)"
}

$tokens = @{}
foreach ($property in $variables.PSObject.Properties) {
  $tokenName = Convert-TokenName $property.Name
  $tokens["__$tokenName`__"] = [string] $property.Value
}

Get-ChildItem -LiteralPath $scaffoldRoot -Recurse -File | ForEach-Object {
  $relativePath = [System.IO.Path]::GetRelativePath($scaffoldRoot, $_.FullName)
  $targetPath = Join-Path $targetRoot $relativePath
  $targetDirectory = Split-Path -Parent $targetPath

  if (-not (Test-Path -LiteralPath $targetDirectory)) {
    New-Item -ItemType Directory -Path $targetDirectory | Out-Null
  }

  if ((Test-Path -LiteralPath $targetPath) -and -not $Force) {
    Write-Host "Skipped existing $relativePath"
    return
  }

  $content = Get-Content -LiteralPath $_.FullName -Raw
  foreach ($token in $tokens.Keys) {
    $content = $content.Replace($token, $tokens[$token])
  }

  Set-Content -LiteralPath $targetPath -Value $content -NoNewline
  Write-Host "Wrote $relativePath"
}

Write-Host ''
Write-Host 'Template applied. Copy the shared React implementation files listed in manifest.json, then run:'
Write-Host '  npm ci'
Write-Host '  npm run content:validate'
Write-Host '  npm run build'
Write-Host '  npm run test'
