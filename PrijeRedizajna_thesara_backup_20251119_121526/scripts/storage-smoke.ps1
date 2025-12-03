param(
  [string]$Namespace = "smoke",
  [string]$AppId = "smoke"
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg){ Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Fail($msg){ Write-Error $msg; exit 1 }

# 1) BASE iz .diag
$portFile = Join-Path (Resolve-Path "apps/api").Path ".diag/api-port.txt"
$PORT = 8788
if (Test-Path $portFile) {
  $PORT = (Get-Content $portFile | Select-Object -Last 1).Trim()
}
$BASE = "http://127.0.0.1:$PORT"
Write-Host "BASE=$BASE"

# 2) Healthz
Write-Step "Health check"
$h = Invoke-RestMethod "$BASE/healthz"
if (-not $h.ok) { Fail "healthz not ok" }

# 3) JWT (dev)
Write-Step "Dev JWT"
$JWT = $null
try { $JWT = (Invoke-RestMethod "$BASE/jwt").token } catch {
  try { $JWT = (Invoke-RestMethod "$BASE/api/jwt").token } catch { }
}
if ($JWT) { Write-Host "JWT acquired" } else { Write-Host "JWT not available; proceeding anon" -ForegroundColor Yellow }

# 4) Preflight
Write-Step "Preflight OPTIONS"
$opt = curl.exe -s -o NUL -w "%{http_code}" "$BASE/api/storage?ns=$Namespace" `
  -X OPTIONS -H "Origin: http://localhost:3000" `
  -H "Access-Control-Request-Method: PATCH" `
  -H "Access-Control-Request-Headers: authorization, if-match, content-type, x-thesara-app-id"
if ($opt -ne '204') { Fail "Preflight expected 204, got $opt" }

# 5) GET -> etag
Write-Step "GET snapshot"
$headers = @{ }
if ($JWT) { $headers['Authorization'] = "Bearer $JWT" }
$headers['X-Thesara-App-Id'] = $AppId

$resp = Invoke-WebRequest "$BASE/api/storage?ns=$Namespace" -Headers $headers
$etag = $resp.Headers['ETag']
if (-not $etag) { Fail "Missing ETag header" }
Write-Host "ETag: $etag"

# 6) payload
Write-Step "Create payload file"
@'
[
  {"op":"set","key":"foo","value":"baz"}
]
'@ | Set-Content ops.json

# 7) PATCH create/update
Write-Step "PATCH create/update"
$patchArgs = @(
  '-s',
  '-i','-X','PATCH',"$BASE/api/storage?ns=$Namespace",
  '-H',("Authorization: Bearer $JWT"),
  '-H',("If-Match: $etag"),
  '-H',("X-Thesara-App-Id: $AppId"),
  '-H','Content-Type: application/json',
  '--data-binary','@ops.json'
) | Where-Object { $_ -ne $null -and $_ -ne 'Authorization: Bearer ' }

$raw = curl.exe @patchArgs
if (-not $raw) { Fail "curl command returned no output." }
if ($raw[0] -notmatch "HTTP/1.1 (200|201)") { Fail "PATCH expected 200/201, got:`n$raw" }

# izvuci novi ETag
$newEtag = ($raw -split "`r?`n") | Where-Object { $_ -match '^etag: ' } | ForEach-Object { ($_ -split ':',2)[1].Trim() } | Select-Object -First 1
if (-not $newEtag) { Fail "Missing new ETag" }
Write-Host "New ETag: $newEtag"

# 8) Namjerni konflikt
Write-Step "PATCH conflict"
$raw2 = curl.exe -s -i -X PATCH "$BASE/api/storage?ns=$Namespace" `
  -H ("Authorization: Bearer $JWT") -H ("If-Match: $etag") -H ("X-Thesara-App-Id: $AppId") `
  -H 'Content-Type: application/json' --data-binary '@ops.json'
if (-not $raw2) { Fail "curl command for conflict test returned no output." }
if ($raw2[0] -notmatch 'HTTP/1.1 412') { Fail "Expected 412, got:`n$raw2" }

# 9) Final GET
Write-Step "Final GET"
$resp2 = Invoke-WebRequest "$BASE/api/storage?ns=$Namespace" -Headers $headers
$etag2 = $resp2.Headers['ETag']
if ($etag2 -ne $newEtag) { Fail "ETag mismatch: $etag2 vs $newEtag" }
$json = $resp2.Content | ConvertFrom-Json
if ($json.foo -ne 'baz') { Fail "Snapshot mismatch: expected foo=baz, got $($json | ConvertTo-Json -Compress)" }

Write-Host "All good ✅" -ForegroundColor Green
exit 0
