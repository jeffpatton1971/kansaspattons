param(
  [Parameter(Mandatory = $true)]
  [string] $TargetRepo
)

$ErrorActionPreference = 'Stop'

$templateRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifest = Get-Content -LiteralPath (Join-Path $templateRoot 'manifest.json') -Raw | ConvertFrom-Json
$targetRoot = Resolve-Path -LiteralPath $TargetRepo -ErrorAction Stop
$failures = New-Object System.Collections.Generic.List[string]

function Add-Failure([string] $Message) {
  $failures.Add($Message) | Out-Null
}

function Test-RepoPath([string] $RelativePath) {
  Test-Path -LiteralPath (Join-Path $targetRoot.Path $RelativePath)
}

$requiredPaths = @(
  '.github/workflows/pr-ci.yml',
  '.github/workflows/publish.yml',
  'content/site.config.json',
  'content/taxonomy.aliases.json',
  'content/media/index.json',
  '_posts',
  'src',
  'scripts',
  'tests',
  'webapp',
  'index.html',
  'package.json',
  'vite.config.ts'
)

foreach ($path in $requiredPaths) {
  if (-not (Test-RepoPath $path)) {
    Add-Failure "Missing required path: $path"
  }
}

foreach ($path in $manifest.forbiddenRuntimePaths) {
  if (Test-RepoPath $path) {
    Add-Failure "Forbidden framework path exists: $path"
  }
}

$packagePath = Join-Path $targetRoot.Path 'package.json'
if (Test-Path -LiteralPath $packagePath) {
  $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
  foreach ($script in $manifest.requiredScripts) {
    if (-not $package.scripts.$script) {
      Add-Failure "Missing package script: $script"
    }
  }
}

$siteConfigPath = Join-Path $targetRoot.Path 'content/site.config.json'
if (Test-Path -LiteralPath $siteConfigPath) {
  $siteConfig = Get-Content -LiteralPath $siteConfigPath -Raw | ConvertFrom-Json
  if (-not $siteConfig.key -or $siteConfig.key -notmatch '^[a-z0-9][a-z0-9-]{0,62}$') {
    Add-Failure "content/site.config.json key must be a lowercase site id."
  }
}

$publishPath = Join-Path $targetRoot.Path '.github/workflows/publish.yml'
if (Test-Path -LiteralPath $publishPath) {
  $publish = Get-Content -LiteralPath $publishPath -Raw
  if ($publish -notmatch 'id-token:\s*write') {
    Add-Failure 'publish.yml must grant id-token: write for Azure OIDC.'
  }

  if ($publish -notmatch 'contents:\s*write') {
    Add-Failure 'publish.yml must grant contents: write for publish source updates.'
  }

  if ($publish -notmatch 'VITE_API_SITE_ID') {
    Add-Failure 'publish.yml must set and validate VITE_API_SITE_ID.'
  }

  if ($publish -match 'static-web-apps-deploy|api_location|Azure/functions-action') {
    Add-Failure 'publish.yml must deploy the React Web App only, not SWA or Functions.'
  }
}

$gitignorePath = Join-Path $targetRoot.Path '.gitignore'
if (Test-Path -LiteralPath $gitignorePath) {
  $gitignore = Get-Content -LiteralPath $gitignorePath -Raw
  foreach ($ignored in @('dist/', 'public/content/', 'node_modules/', '.tmp/')) {
    if ($gitignore -notmatch [regex]::Escape($ignored)) {
      Add-Failure ".gitignore should include $ignored"
    }
  }
}

if ($failures.Count -gt 0) {
  Write-Host 'Framework check failed:' -ForegroundColor Red
  foreach ($failure in $failures) {
    Write-Host " - $failure" -ForegroundColor Red
  }
  exit 1
}

Write-Host 'Framework check passed.' -ForegroundColor Green
