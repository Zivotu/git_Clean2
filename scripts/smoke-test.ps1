
<#
.SYNOPSIS
  Smoke test for a Thesara app build.

.DESCRIPTION
  This script performs a series of checks to ensure a build is valid and accessible.

.PARAMETER ListingId
  The ID of the listing to test.

.EXAMPLE
  ./smoke-test.ps1 -ListingId my-cool-app
#>
param(
    [Parameter(Mandatory=$true)]
    [string]$ListingId
)

$ErrorActionPreference = 'Stop'

$baseUrl = "http://localhost:3000"
$apiUrl = "http://localhost:8788"

Write-Host "Smoke testing listing: $ListingId"

# 1. Check /shim.js
Write-Host "1. Checking HEAD /shim.js..."
$shimResponse = Invoke-WebRequest -Uri "$apiUrl/shim.js" -Method Head
if ($shimResponse.StatusCode -ne 200) {
    throw "HEAD /shim.js returned $($shimResponse.StatusCode)"
}
Write-Host "  OK (200)"

# 2. Get Build ID from listing
# This part is tricky as there is no direct API to get listing details by slug.
# We will assume the test runner provides the buildId or we can get it from the DB.
# For now, we will use a placeholder.
# A real implementation would need to query the apps.json or the database.
Write-Host "2. Fetching build information (skipping - placeholder)..."
# In a real scenario, you would fetch the listing details and get the buildId.
# $listingDetails = Invoke-RestMethod -Uri "$apiUrl/api/listings/$ListingId"
# $buildId = $listingDetails.buildId

# For this test, we'll assume a build was just created and we have the ID.
# This script is more of a template.

Write-Host "NOTE: This script is a template. To run it, you need to implement a way to get the buildId for a listing."
Write-Host "You can extend the test API to get this data."

# 3. Check manifest, bundle, and Play page (requires buildId)
# ... implementation would go here ...

# 4. Playwright check for CSP errors
# This would be the final step.
# npx playwright test --grep "Play page for $ListingId boots without errors"

Write-Host "Smoke test finished (partially implemented)."
