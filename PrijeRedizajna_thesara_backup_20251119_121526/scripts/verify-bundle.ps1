param(
  [string]$BuildId,
  [string]$BaseUrl = "http://localhost:8788"
)

if (-not $BuildId) {
  Write-Host "Usage: .\verify-bundle.ps1 -BuildId <buildId> [-BaseUrl <baseUrl>]"
  exit 1
}

$bundleUrl = "$BaseUrl/builds/$BuildId/build/app.bundle.js"
Write-Host "Fetching bundle from: $bundleUrl"

try {
  $content = Invoke-WebRequest -Uri $bundleUrl -UseBasicParsing | Select-Object -ExpandProperty Content
} catch {
  Write-Error "Failed to fetch bundle: $_"
  exit 1
}

$bundleSizeBytes = [System.Text.Encoding]::UTF8.GetByteCount($content)
$hasBareReactImport = $content -match 'from "react"'
$hasJsxDevRuntime = $content -match 'react/jsx-dev-runtime'
$hasAliasAtSign = $content -match 'from "@/'

Write-Host "--- Verification Results ---"
Write-Host "BundleSizeBytes=$bundleSizeBytes"
Write-Host "HasBareReactImport=$hasBareReactImport"
Write-Host "HasJsxDevRuntime=$hasJsxDevRuntime"
Write-Host "HasAliasAtSign=$hasAliasAtSign"

if ($hasBareReactImport -or $hasJsxDevRuntime -or $hasAliasAtSign) {
  Write-Error "Verification FAILED: Bundle is not self-contained."
  exit 1
} else {
  Write-Host "Verification PASSED: Bundle is self-contained."
}
