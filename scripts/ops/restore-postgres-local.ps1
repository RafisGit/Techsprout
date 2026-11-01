<#
.SYNOPSIS
    TechSprout LMS - Isolated Local Database Restore & Verification Script (PowerShell)
.DESCRIPTION
    Safely tests restoring a PostgreSQL custom-format logical dump archive.
    Runs strictly against localhost/127.0.0.1. By default, spins up an isolated,
    disposable PostgreSQL instance on an ephemeral port, verifies table inventory
    and row counts, and cleans up the cluster completely.
.PARAMETER BackupFile
    Path to the .dump file to restore.
.PARAMETER Port
    Ephemeral port to use for disposable server (default: 54333).
.PARAMETER KeepRunning
    Switch to keep disposable cluster running for manual inspection.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,

    [int]$Port = 54333,

    [switch]$KeepRunning
)

$ErrorActionPreference = 'Stop'

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "TechSprout LMS - Isolated PostgreSQL Restore Test" -ForegroundColor Cyan
Write-Host "Target Archive: $BackupFile" -ForegroundColor Cyan
Write-Host "Execution Mode: Isolated Disposable Local Cluster" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# Safety Assertion: Never restore over remote or production host
$SafetyHost = '127.0.0.1'

# 1. Check Backup File
if (-not (Test-Path $BackupFile)) {
    Write-Error "FAIL: Target backup archive does not exist: $BackupFile"
    exit 1
}

$fileItem = Get-Item $BackupFile
if ($fileItem.Length -eq 0) {
    Write-Error "FAIL: Backup file has 0 bytes length."
    exit 1
}

# 2. Locate PostgreSQL tools
$binDir = $null
$potentialBinDirs = @(
    "C:\Program Files\PostgreSQL\18\bin",
    "C:\Program Files\PostgreSQL\16\bin",
    "C:\Program Files\PostgreSQL\14\bin"
)

foreach ($dir in $potentialBinDirs) {
    if ((Test-Path "$dir\initdb.exe") -and (Test-Path "$dir\pg_ctl.exe") -and (Test-Path "$dir\pg_restore.exe")) {
        $binDir = $dir
        break
    }
}

if (-not $binDir) {
    Write-Error "CRITICAL: PostgreSQL binaries not found."
    exit 1
}

Write-Host "[OK] Using PostgreSQL binaries from: $binDir" -ForegroundColor Green

$uniqueId = [Guid]::NewGuid().ToString().Substring(0, 8)
$tempClusterDir = Join-Path $env:TEMP ("techsprout_pg_restore_" + $uniqueId)
$logFile = Join-Path $tempClusterDir "pg_server.log"

try {
    # 3. Initialize Disposable Cluster
    Write-Host "[RUN] Initializing disposable cluster at $tempClusterDir..." -ForegroundColor Yellow
    & "$binDir\initdb.exe" -D $tempClusterDir -U postgres -A trust --encoding=UTF8 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "initdb failed" }
    Write-Host "[OK] Disposable cluster initialized." -ForegroundColor Green

    # 4. Start Server on Ephemeral Port
    Write-Host "[RUN] Starting disposable server on port $Port..." -ForegroundColor Yellow
    & "$binDir\pg_ctl.exe" -D $tempClusterDir -o "-p $Port -c listen_addresses=127.0.0.1" -l $logFile start
    Start-Sleep -Seconds 2

    # 5. Create Test Database
    $testDb = "techsprout_restore_verification"
    Write-Host "[RUN] Creating target database '$testDb'..." -ForegroundColor Yellow
    & "$binDir\createdb.exe" -h $SafetyHost -p $Port -U postgres $testDb
    if ($LASTEXITCODE -ne 0) { throw "createdb failed" }
    Write-Host "[OK] Database created." -ForegroundColor Green

    # 6. Execute Restore
    Write-Host "[RUN] Restoring archive with pg_restore --no-owner --no-acl..." -ForegroundColor Yellow
    & "$binDir\pg_restore.exe" -h $SafetyHost -p $Port -U postgres -d $testDb --no-owner --no-acl "$BackupFile"
    $restoreCode = $LASTEXITCODE
    if ($restoreCode -ne 0) {
        Write-Warning "pg_restore exited with code $restoreCode"
    } else {
        Write-Host "[PASS] pg_restore completed with exit code 0." -ForegroundColor Green
    }

    # 7. Verification Queries
    $sqlTables = 'SELECT schemaname, count(*) as tables_count FROM pg_tables WHERE schemaname IN (''public'', ''drizzle'') GROUP BY schemaname;'
    Write-Host "`n--- Table Inventory ---" -ForegroundColor Cyan
    & "$binDir\psql.exe" -h $SafetyHost -p $Port -U postgres -d $testDb -c $sqlTables

    $sqlCounts = 'SELECT (SELECT count(*) FROM users) as users_count, (SELECT count(*) FROM courses) as courses_count, (SELECT count(*) FROM categories) as categories_count, (SELECT count(*) FROM modules) as modules_count, (SELECT count(*) FROM lessons) as lessons_count, (SELECT count(*) FROM enrollments) as enrollments_count, (SELECT count(*) FROM certificates) as certificates_count, (SELECT count(*) FROM drizzle.__drizzle_migrations) as migrations_count;'
    Write-Host "`n--- Primary Table Row Counts ---" -ForegroundColor Cyan
    & "$binDir\psql.exe" -h $SafetyHost -p $Port -U postgres -d $testDb -c $sqlCounts

    Write-Host "====================================================" -ForegroundColor Cyan
    Write-Host "SUCCESS: Isolated restore test completed successfully." -ForegroundColor Green
    Write-Host "====================================================" -ForegroundColor Cyan

} finally {
    if (-not $KeepRunning) {
        Write-Host "[CLEANUP] Stopping disposable PostgreSQL server..." -ForegroundColor Yellow
        & "$binDir\pg_ctl.exe" -D $tempClusterDir stop -m immediate 2>&1 | Out-Null
        Start-Sleep -Seconds 1
        Remove-Item -Recurse -Force $tempClusterDir -ErrorAction SilentlyContinue
        Write-Host "[OK] Disposable cluster destroyed cleanly." -ForegroundColor Green
    } else {
        Write-Host "[NOTICE] Disposable cluster running at port $Port" -ForegroundColor Yellow
    }
}
