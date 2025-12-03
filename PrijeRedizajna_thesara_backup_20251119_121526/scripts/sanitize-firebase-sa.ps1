# Sanitizer for firebase-sa.json
# Usage: run this in Windows PowerShell as the user who owns the workspace
$path = 'C:\thesara_RollBack\apps\api\keys\firebase-sa.json'
$bak = "$path.bak"

if (-not (Test-Path $path)) {
  Write-Error "File not found: $path"
  exit 1
}

Copy-Item $path $bak -Force
Write-Output "Backup created: $bak"

try {
  $content = Get-Content $path -Raw -ErrorAction Stop
} catch {
  Write-Error ("Failed to read {0}: {1}" -f $path, $_)
  exit 2
}

# remove BOM (if present)
$content = $content -replace "^\uFEFF", ''

# remove any characters before the first '{'
$idx = $content.IndexOf('{')
if ($idx -gt 0) { $content = $content.Substring($idx) }

# normalize CRLF -> LF
$content = $content -replace "`r`n","`n"

# write back as UTF8 without BOM
# create UTF8 encoding instance without BOM in a PowerShell 5-safe way
$utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
[System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
Write-Output "Rewrote file as UTF-8 without BOM and normalized newlines."

# validate JSON
try {
  $null = $content | ConvertFrom-Json
  Write-Output 'JSON OK'
} catch {
  Write-Output "JSON BROKEN: $_"
  exit 3
}

# show file meta and checksum
Get-Item $path | Select-Object FullName,Length,LastWriteTime
Get-FileHash $path -Algorithm SHA256 | Select-Object Hash

Write-Output "Sanitizer finished. If JSON OK, set env var and restart your server. Example (current session):"
Write-Output "    $env:GOOGLE_APPLICATION_CREDENTIALS = '$path'"
Write-Output "To persist for user: setx GOOGLE_APPLICATION_CREDENTIALS \"$path\""
