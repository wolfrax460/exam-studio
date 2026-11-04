# scripts/deploy.ps1
# Deploys the server files and the built client to the live Ubuntu server.
#
#   1. builds the client and runs both test suites locally;
#   2. backs up $RemoteApp/server and client/dist to /opt/exam-studio-backups/<timestamp>;
#   3. scp's the changed files to /tmp, then sudo cp's them into place;
#   4. keeps the files owned by the account the systemd service actually runs as;
#   5. restarts the service and waits for https://examstudio.duckdns.org/health/ai to answer ok:true;
#   6. restores the backup and restarts again if the health check does not pass.
#
# .env is never copied or touched: the server keeps its own file.
#
# Usage:
#   $env:EXAM_STUDIO_SSH_KEY = "F:\path\to\key"
#   $env:EXAM_STUDIO_HOST    = "examstudio.duckdns.org"
#   .\scripts\deploy.ps1
#   .\scripts\deploy.ps1 -Files "server/index.js,server/lib/ai.js"

param(
    [string]$Files = "server/index.js,server/lib/mcpServer.js,server/lib/ai.js,server/lib/adminStore.js,server/lib/providers.js,server/lib/errors.js,server/lib/ssrf.js,server/lib/userAISettings.js,server/lib/userAiApi.js,server/lib/examTake.js,server/lib/models/McpQuota.js,server/lib/models/ExamPublication.js,server/lib/models/ExamAttempt.js,server/assets/icon-256.png,server/assets/favicon.ico",
    [string]$SshKey = $env:EXAM_STUDIO_SSH_KEY,
    [string]$HostName = $env:EXAM_STUDIO_HOST,
    [string]$HealthUrl = "https://examstudio.duckdns.org/health/ai"
)

$ErrorActionPreference = "Stop"

if (-not $SshKey -or -not (Test-Path $SshKey)) { throw "Set EXAM_STUDIO_SSH_KEY to your private SSH key path." }
if (-not $HostName) { throw "Set EXAM_STUDIO_HOST to your server host." }

$RepoRoot = Split-Path $PSScriptRoot -Parent
$RemoteUser = "ubuntu"
$RemoteApp = "/opt/exam-studio"
$ServiceName = "exam-studio"
$BackupBase = "/opt/exam-studio-backups"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupDir = "$BackupBase/$Timestamp"
$StagingDir = "/tmp/exam-studio-deploy-$Timestamp"
$SshOptions = @("-i", $SshKey, "-o", "BatchMode=yes")

# Runs one command on the server and returns its stdout. sudo's noise is filtered out,
# and a non-zero exit code becomes a terminating error instead of being lost.
function Invoke-Remote {
    param([string]$Command)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $output = & ssh @SshOptions "$RemoteUser@$HostName" $Command 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $previous
    $text = ($output | Where-Object { $_ -notmatch 'sudoers|Cmnd_Alias|wildcards are not allowed|garbage' }) -join "`n"
    if ($text) { Write-Host $text -ForegroundColor DarkGray }
    if ($code -ne 0) { throw "Remote command failed ($code): $Command`n$text" }
    return $text
}

function Send-File {
    param([string]$LocalPath, [string]$RemotePath, [switch]$Recurse)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $scpOptions = if ($Recurse) { $SshOptions + "-r" } else { $SshOptions }
    & scp @scpOptions $LocalPath "${RemoteUser}@${HostName}:$RemotePath" 2>&1 | Out-Null
    $code = $LASTEXITCODE
    $ErrorActionPreference = $previous
    if ($code -ne 0) { throw "scp failed for $LocalPath" }
}

Write-Host "=== Exam Studio Deploy ===" -ForegroundColor Cyan
Write-Host "Target:  $RemoteUser@$HostName : $RemoteApp"
Write-Host "Backup:  $BackupDir"

# 0. Validate the file list before anything runs on the server.
$fileList = @($Files -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($fileList.Count -eq 0) { throw "No files to deploy." }
foreach ($f in $fileList) {
    if ($f -match '(^|/)\.env') { throw "Refusing to deploy $f - .env belongs to the server and is never copied." }
    if (-not (Test-Path (Join-Path $RepoRoot $f))) { throw "Missing local file: $f" }
}

# 1. Build and test locally. A failing check stops the deploy before the server is touched.
Write-Host "`n[1/6] Building the client..." -ForegroundColor Yellow
Push-Location $RepoRoot
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "Client build failed ($LASTEXITCODE)." }

    Write-Host "`n[2/6] Running tests..." -ForegroundColor Yellow
    & npm test
    if ($LASTEXITCODE -ne 0) { throw "Tests failed ($LASTEXITCODE). Nothing was deployed." }
} finally {
    Pop-Location
}
if (-not (Test-Path (Join-Path $RepoRoot "client/dist"))) { throw "client/dist was not produced by the build." }

# 2. Who does the service run as? Files must stay owned by that account.
Write-Host "`n[3/6] Backing up server and client..." -ForegroundColor Yellow
$serviceUser = (Invoke-Remote "systemctl show $ServiceName -p User --value").Trim()
if ($serviceUser) { Write-Host "Service runs as: $serviceUser" } else { Write-Host "Service runs as root (no User= set)." }

$clientInBackup = (Invoke-Remote "if [ -d $RemoteApp/client/dist ]; then echo yes; else echo no; fi").Trim()
Invoke-Remote "sudo mkdir -p $BackupDir && sudo cp -a $RemoteApp/server $BackupDir/server && if [ '$clientInBackup' = 'yes' ]; then sudo cp -a $RemoteApp/client/dist $BackupDir/client-dist; fi && sudo touch $BackupDir/.ok"
if ((Invoke-Remote "test -d $BackupDir/server && echo yes").Trim() -ne "yes") { throw "Backup of $RemoteApp/server is missing. Deploy stopped." }

# 3. Copy the changed server files through /tmp, then sudo cp into place.
Write-Host "`n[4/6] Copying server files..." -ForegroundColor Yellow
$stagingDirs = @($fileList | ForEach-Object { "$StagingDir/" + ((Split-Path $_ -Parent) -replace '\\', '/') } | Where-Object { $_ -notmatch '/$' } | Sort-Object -Unique)
Invoke-Remote ("mkdir -p " + ($stagingDirs -join " "))

foreach ($f in $fileList) {
    $remotePath = "$StagingDir/$f"
    Send-File (Join-Path $RepoRoot $f) $remotePath
    $owner = if ($serviceUser) { " && sudo chown $serviceUser`:$serviceUser $RemoteApp/$f" } else { "" }
    Invoke-Remote "sudo cp -a $remotePath $RemoteApp/$f$owner"
    Write-Host "  Copied: $f"
}

Write-Host "`n[5/6] Copying the client build..." -ForegroundColor Yellow
Send-File (Join-Path $RepoRoot "client/dist") "$StagingDir/client-dist" -Recurse
$distOwner = if ($serviceUser) { " && sudo chown -R $serviceUser`:$serviceUser $RemoteApp/client/dist" } else { "" }
Invoke-Remote "sudo rm -rf $RemoteApp/client/dist && sudo cp -a $StagingDir/client-dist $RemoteApp/client/dist$distOwner"
Write-Host "  Copied: client/dist"

# 4. Restart, then insist on a real ok:true answer from the public health endpoint.
Write-Host "`n[6/6] Restarting and checking health..." -ForegroundColor Yellow
Invoke-Remote "sudo systemctl restart $ServiceName && sleep 2 && sudo systemctl is-active $ServiceName"

$healthy = $false
for ($attempt = 1; $attempt -le 12; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 10
        if ($health.ok -eq $true) {
            $healthy = $true
            Write-Host "Health: ok:true (latency $($health.latency) ms)" -ForegroundColor Green
            break
        }
        Write-Host "Health attempt $attempt : ok=$($health.ok)"
    } catch {
        Write-Host "Health attempt $attempt : $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 3
}

if (-not $healthy) {
    Write-Host "`nHealth check failed - restoring $BackupDir" -ForegroundColor Red
    $restoreClock = "sudo systemctl stop $ServiceName || true"
    $restoreServer = "sudo rm -rf $RemoteApp/server && sudo cp -a $BackupDir/server $RemoteApp/server"
    $restoreClient = if ($clientInBackup -eq "yes") { " && sudo rm -rf $RemoteApp/client/dist && sudo cp -a $BackupDir/client-dist $RemoteApp/client/dist" } else { "" }
    $restoreOwner = if ($serviceUser) { " && sudo chown -R $serviceUser`:$serviceUser $RemoteApp/server $RemoteApp/client/dist" } else { "" }
    Invoke-Remote "$restoreClock && $restoreServer$restoreClient$restoreOwner"
    Invoke-Remote "sudo systemctl restart $ServiceName && sleep 2 && sudo systemctl is-active $ServiceName"
    try {
        $after = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 10
        Write-Host "After rollback health: ok=$($after.ok)" -ForegroundColor Yellow
    } catch {
        Write-Host "After rollback health: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    Invoke-Remote "sudo journalctl -u $ServiceName -n 30 --no-pager 2>/dev/null | grep -viE 'sudoers|Cmnd_Alias|wildcards are not allowed|garbage' || true"
    throw "Deploy rolled back to the $Timestamp backup. Server left on the previous code."
}

Write-Host "`n=== Deploy complete (backup kept at $BackupDir) ===" -ForegroundColor Green
