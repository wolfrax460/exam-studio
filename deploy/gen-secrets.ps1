# gen-secrets.ps1 - generates JWT_SECRET and EXAM_STUDIO_MASTER_KEY
$jwt = [System.Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
$master = [System.Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
Write-Host "JWT_SECRET=$jwt"
Write-Host "EXAM_STUDIO_MASTER_KEY=$master"
'