# Gyanam AI UAT helper functions (Windows PowerShell 5.1 or later). See docs/uat/RUNBOOK.md.
# Load once per PowerShell window, from the project root:   . .\docs\uat\uat.ps1
#
#   Initialize-Uat   one-time: build master DB from data\vidhi_legal.db, seed fictional matters, save the seeded copy
#   Start-Uat        start the staging server on http://localhost:8091 against the working copy
#   Stop-Uat         stop it
#   Reset-Uat        stop, restore the seeded copy over the working DB, empty uploads, start again (run between sessions)
#   Test-Uat         pre-session health checks (prints PASS or FAIL per check)
#   Get-UatErrors    count HTTP 5xx lines in the server log (criterion S12)
#
# Nothing here ever writes to data\vidhi_legal.db. The staging server uses C:\gyanam-uat\work\vidhi_legal.db.

$script:Repo   = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$script:Root   = 'C:\gyanam-uat'
$script:Port   = 8091
$script:Base   = "http://localhost:$($script:Port)"
$script:Work   = Join-Path $script:Root 'work\vidhi_legal.db'
$script:Master = Join-Path $script:Root 'master\uat_master.db'
$script:Seeded = Join-Path $script:Root 'master\uat_seeded.db'
$script:Uploads = Join-Path $script:Root 'uploads'
$script:Log    = Join-Path $script:Root 'logs\server.log'
$script:ErrLog = Join-Path $script:Root 'logs\server.err.log'

function Get-UatPython {
    $venv = Join-Path $script:Repo 'venv\Scripts\python.exe'
    if (Test-Path $venv) { return $venv }
    return (Get-Command python -ErrorAction Stop).Source
}

function Stop-Uat {
    $c = Get-NetTCPConnection -LocalPort $script:Port -State Listen -ErrorAction SilentlyContinue
    if ($c) {
        Stop-Process -Id ($c | Select-Object -First 1).OwningProcess -Force
        Start-Sleep -Seconds 2
        Write-Host "Stopped the server on port $($script:Port)."
    }
}

function Start-Uat {
    if (Get-NetTCPConnection -LocalPort $script:Port -State Listen -ErrorAction SilentlyContinue) {
        Write-Host "Port $($script:Port) is already in use. Run Stop-Uat first."; return
    }
    foreach ($d in 'logs', 'uploads', 'work') { New-Item -ItemType Directory -Force (Join-Path $script:Root $d) | Out-Null }
    if (-not (Test-Path $script:Work)) { Write-Host 'No working DB. Run Initialize-Uat or Reset-Uat first.'; return }
    # These are inherited by the child process. JWT secret and other settings come from the project .env.
    $env:GYANAM_DB_PATH      = $script:Work
    $env:GYANAM_UPLOAD_DIR   = $script:Uploads
    $env:PORT                = "$($script:Port)"
    $env:GYANAM_UI           = 'new'
    $env:GYANAM_ENFORCE_AUTH = '1'
    $env:GEMINI_API_KEY      = ''     # empty on purpose: the engine is then "Template fallback" (repeatable, offline)
    $py = Get-UatPython
    Start-Process -FilePath $py -ArgumentList 'backend\server.py' -WorkingDirectory $script:Repo `
        -RedirectStandardOutput $script:Log -RedirectStandardError $script:ErrLog -WindowStyle Hidden | Out-Null
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 750
        try { $s = Invoke-RestMethod "$($script:Base)/api/status" -TimeoutSec 3; Write-Host "Server up: $($s.total_judgments_indexed) judgments at $($script:Base)"; return } catch { }
    }
    Write-Host "Server did not answer in 30 s. See $($script:ErrLog)"
}

function Initialize-Uat {
    foreach ($d in 'master', 'work', 'uploads', 'logs', 'files', 'recordings', 'profile') {
        New-Item -ItemType Directory -Force (Join-Path $script:Root $d) | Out-Null
    }
    $py = Get-UatPython
    Push-Location $script:Repo
    try {
        & $py docs\uat\prepare_uat_db.py --source data\vidhi_legal.db --out $script:Master
        if ($LASTEXITCODE -ne 0) { throw 'prepare_uat_db.py failed' }
        Stop-Uat
        Copy-Item $script:Master $script:Work -Force
        Remove-Item "$($script:Work)-wal", "$($script:Work)-shm" -ErrorAction SilentlyContinue
        Start-Uat
        & $py docs\uat\seed_uat.py --base $script:Base
        if ($LASTEXITCODE -ne 0) { throw 'seed_uat.py failed' }
        Stop-Uat
        Copy-Item $script:Work $script:Seeded -Force
        # Fixture files for tasks C-05 and C-06
        Copy-Item sample_docs\sample_writ_petition.txt (Join-Path $script:Root 'files') -Force
        & $py -c "import zlib,struct;c=lambda t,d:struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff);w=h=64;raw=b''.join(b'\x00'+b'\xff'*w for _ in range(h));open(r'$($script:Root)\files\unreadable_scan.png','wb').write(b'\x89PNG\r\n\x1a\n'+c(b'IHDR',struct.pack('>IIBBBBB',w,h,8,0,0,0,0))+c(b'IDAT',zlib.compress(raw))+c(b'IEND',b''))"
        $h = (Get-FileHash $script:Seeded -Algorithm SHA256).Hash
        Set-Content -Path (Join-Path $script:Root 'master\uat_seeded.sha256') -Value "$h  uat_seeded.db"
        Write-Host "Seeded copy saved. SHA-256: $h  (copy this into RESULTS_TEMPLATE.md section 1)"
    } finally { Pop-Location }
}

function Reset-Uat {
    if (-not (Test-Path $script:Seeded)) { Write-Host 'No seeded copy. Run Initialize-Uat first.'; return }
    Stop-Uat
    Copy-Item $script:Seeded $script:Work -Force
    Remove-Item "$($script:Work)-wal", "$($script:Work)-shm" -ErrorAction SilentlyContinue
    if (Test-Path $script:Uploads) { Get-ChildItem $script:Uploads -Force | Remove-Item -Recurse -Force }
    Start-Uat
}

function Test-Uat {
    $ok = $true
    function Check($name, $pass) { if ($pass) { Write-Host "PASS  $name" } else { Write-Host "FAIL  $name"; $script:okFlag = $false } }
    $script:okFlag = $true
    try {
        $s = Invoke-RestMethod "$($script:Base)/api/status"
        Check 'server answers /api/status' $true
        Check 'about 118,096 judgments indexed' ($s.total_judgments_indexed -ge 118000)
        $tok = (Invoke-RestMethod -Method Post -Uri "$($script:Base)/api/auth/sso/nluj" -ContentType 'application/json' -Body '{"target_role":"JUDICIAL_USER"}').access_token
        $h = @{ Authorization = "Bearer $tok" }
        $al = Invoke-RestMethod "$($script:Base)/api/alerts" -Headers $h
        Check "at least one alert (found $($al.total))" ($al.total -ge 1)
        $dr = Invoke-RestMethod "$($script:Base)/api/drafts" -Headers $h
        $list = if ($dr -is [array]) { $dr } else { $dr.drafts }
        $fixtures = @($list | Where-Object { $_.case_number -like 'UAT/WP/91*' })
        Check "five UAT fixture drafts present (found $($fixtures.Count))" ($fixtures.Count -eq 5)
        $lv = Invoke-RestMethod "$($script:Base)/api/audit/ledger/verify" -Headers $h
        Check "audit ledger verifies ($($lv.status), $($lv.total_blocks_verified) blocks)" ($lv.status -eq 'VERIFIED_SECURE')
        $r = Invoke-RestMethod -Method Post -Uri "$($script:Base)/api/verify_single_citation" -Headers $h -ContentType 'application/json' -Body '{"citation":"(2008) 4 SCC 54"}'
        Check '(2008) 4 SCC 54 is recorded as overruled' (($r | ConvertTo-Json -Depth 6) -match 'OVERRULED')
        $web = Invoke-WebRequest "$($script:Base)/app/" -UseBasicParsing
        Check 'new UI served at /app/' ($web.StatusCode -eq 200)
    } catch { Write-Host "FAIL  $($_.Exception.Message)"; $script:okFlag = $false }
    $envFile = Join-Path $script:Repo '.env'
    $active = @()
    if (Test-Path $envFile) { $active = @(Select-String -Path $envFile -Pattern '^\s*GEMINI_API_KEY\s*=\s*\S+') }
    Check 'no active GEMINI_API_KEY line in .env (template fallback)' ($active.Count -eq 0)
    if ($script:okFlag) { Write-Host 'ALL CHECKS PASSED' } else { Write-Host 'SOME CHECKS FAILED - fix before the session' }
}

function Get-UatErrors {
    if (-not (Test-Path $script:ErrLog) -and -not (Test-Path $script:Log)) { Write-Host 'No logs yet.'; return }
    $all = Select-String -Path $script:Log, $script:ErrLog -Pattern '"\s(\d{3})\s' -ErrorAction SilentlyContinue
    $total = @($all).Count
    $bad = @($all | Where-Object { $_.Matches[0].Groups[1].Value -like '5*' })
    Write-Host "HTTP responses logged: $total; 5xx: $($bad.Count)"
    $bad | ForEach-Object { $_.Line }
}
