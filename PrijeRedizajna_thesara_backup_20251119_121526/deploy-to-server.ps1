# Thesara Deployment Script
# Usage: .\deploy-to-server.ps1 [server-ssh-connection]

param(
    [string]$Server = "",
    [string]$ServerPath = "/home/thesara/thesara"
)

if ($Server -eq "") {
    Write-Host "ERROR: Please provide server SSH connection string" -ForegroundColor Red
    Write-Host "Usage: .\deploy-to-server.ps1 -Server user@yourserver.com [-ServerPath /path/to/thesara]" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n=== Thesara Deployment ===" -ForegroundColor Cyan
Write-Host "Server: $Server" -ForegroundColor White
Write-Host "Path: $ServerPath`n" -ForegroundColor White

# Step 1: Build locally
Write-Host "[1/5] Building API locally..." -ForegroundColor Yellow
Set-Location apps\api
pnpm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed" -ForegroundColor Red
    exit 1
}
Set-Location ..\..

# Step 2: Create deployment package
Write-Host "[2/5] Creating deployment package..." -ForegroundColor Yellow
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$packageName = "thesara-api-$timestamp.tar.gz"
Set-Location apps\api
tar -czf "..\..\$packageName" dist/ package.json
Set-Location ..\..

# Step 3: Upload to server
Write-Host "[3/5] Uploading to server..." -ForegroundColor Yellow
scp $packageName "${Server}:${ServerPath}/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Upload failed" -ForegroundColor Red
    exit 1
}

# Step 4: Extract and setup on server
Write-Host "[4/5] Extracting on server..." -ForegroundColor Yellow
$extractCmd = @"
cd $ServerPath/apps/api && \
tar -xzf ../../$packageName && \
echo 'Extracted successfully'
"@
ssh $Server $extractCmd

# Step 5: Restart PM2
Write-Host "[5/5] Restarting API..." -ForegroundColor Yellow
$restartCmd = "cd $ServerPath && pm2 restart thesara-api || pm2 start ecosystem.config.cjs"
ssh $Server $restartCmd

Write-Host "`n=== Deployment Complete ===" -ForegroundColor Green
Write-Host "Package: $packageName" -ForegroundColor White
Write-Host "You can delete the package with: Remove-Item $packageName" -ForegroundColor Gray
