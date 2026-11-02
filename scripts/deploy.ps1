# scripts/deploy.ps1
# Deploys server changes to the live Ubuntu server.
# Usage: .\scripts\deploy.ps1 [-Files "server/index.js,server/lib/mcpServer.js"]

param(
    [string]$Files = "server/index.js,server/lib/mcpServer.js,server/lib/adminStore.js,server/lib/models/McpQuota.js,server/assets/icon-256.png,server/assets/favicon.ico",
    [string]$SshKey = $env:EXAM_STUDIO_SSH_KEY,
    [string]$HostName = $env:EXAM_STUDIO_HOST
)

$ErrorActionPreference = "Stop"
if (-not $SshKey -or -not (Test-Path $SshKey)) { throw "Set EXAM_STUDIO_SSH_KEY to your private SSH key path." }
if (-not $HostName) { throw "Set EXAM_STUDIO_HOST to your server host." }
$Server = $HostName
$User = "ubuntu"
$RemoteApp = "/opt/exam-studio"
$BackupBase = "/opt/exam-studio-backups"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupDir = "$BackupBase/$Timestamp"
$Ssh = @("-i", $SshKey, "-o", "BatchMode=yes")

function Invoke-Remote([string]$Command) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $output = & ssh @Ssh "${User}@${Server}" $Command 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $previous
    $output | Where-Object { $_ -notmatch 'sudoers|Cmnd_Alias|\^~|garbage|wildcards are not allowed' } | ForEach-Object { Write-Host $_ }
    if ($code -ne 0) { throw "Remote command failed ($code)" }
}

Write-Host "=== Exam Studio Deploy ===" -ForegroundColor Cyan
Write-Host "Timestamp: $Timestamp"

# 1. Backup
Write-Host "`n[1/5] Backing up server..." -ForegroundColor Yellow
Invoke-Remote "sudo mkdir -p $BackupDir && sudo cp -r $RemoteApp/server $BackupDir/server && echo 'Backup done: $BackupDir'"

# 2. Copy changed files
Write-Host "`n[2/5] Copying changed files..." -ForegroundColor Yellow
$fileList = $Files -split ","
foreach ($f in $fileList) {
    $f = $f.Trim()
    $localPath = Join-Path (Split-Path $PSScriptRoot -Parent) $f
    $remoteDir = Split-Path "$RemoteApp/$f" -Parent
    Invoke-Remote "sudo mkdir -p $remoteDir"
    & scp @Ssh $localPath "${User}@${Server}:/tmp/$(Split-Path $f -Leaf)"
    if ($LASTEXITCODE -ne 0) { throw "scp failed for $f" }
    Invoke-Remote "sudo mv /tmp/$(Split-Path $f -Leaf) $RemoteApp/$f && sudo chown examstudio:examstudio $RemoteApp/$f"
    Write-Host "  Copied: $f"
}

# 3. Syntax check
Write-Host "`n[3/5] Running node --check..." -ForegroundColor Yellow
Invoke-Remote "cd $RemoteApp && /opt/exam-studio/node/bin/node --check server/index.js && echo 'Syntax OK'"

# 4. Restart
Write-Host "`n[4/5] Restarting service..." -ForegroundColor Yellow
Invoke-Remote "sudo systemctl restart exam-studio && sleep 2 && sudo systemctl is-active exam-studio"

# 5. Health check
Write-Host "`n[5/5] Checking health..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
$health = Invoke-RestMethod -Uri "https://examstudio.duckdns.org/health/ai" -Method Get -ErrorAction SilentlyContinue
Write-Host "Health: $($health | ConvertTo-Json -Compress)"

# Journal tail (filtered)
Write-Host "`n--- Last 20 journal lines (filtered) ---" -ForegroundColor Gray
Invoke-Remote "sudo journalctl -u exam-studio -n 20 --no-pager 2>/dev/null | grep -viE 'sudoers|Cmnd_Alias|\^~|garbage' || true"

Write-Host "`n=== Deploy complete ===" -ForegroundColor Green