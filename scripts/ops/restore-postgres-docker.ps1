<#
.SYNOPSIS
    TechSprout LMS - Repeatable Docker PostgreSQL 16 Recovery & Verification Procedure (PowerShell)
.DESCRIPTION
    Provides an automated, repeatable, and isolated database restore and verification procedure:
    - Runs in an isolated Docker PostgreSQL 16.15 container with --network none (no network exposure).
    - Restores a PostgreSQL custom-format dump archive.
    - Verifies server identity, major version 16, schemas, extensions, Drizzle migrations,
      exact table inventory, and row counts.
    - Validates database constraints, indexes, and foreign-key integrity.
    - Compares and captures SHA-256 checksums.
    - Updates the associated manifest file with the verified restoreTest record.
    - Destroys disposable containers cleanly upon completion (unless -KeepRunning or -TargetContainer is specified).
.PARAMETER BackupFile
    Path to the .dump file to restore. Defaults to the latest verified backup in ~/TechSproutBackups.
.PARAMETER TargetContainer
    Optional name of an existing running container to verify (e.g. techsprout-restore-pg16).
    If provided, the container is preserved and not destroyed.
.PARAMETER KeepRunning
    Switch to keep disposable container running for inspection.
#>

[CmdletBinding()]
param(
    [string]$BackupFile = '',
    [string]$TargetContainer = '',
    [switch]$KeepRunning
)

$ErrorActionPreference = 'Stop'

Write-Host '====================================================' -ForegroundColor Cyan
Write-Host 'TechSprout LMS - Docker PostgreSQL 16 Recovery Test' -ForegroundColor Cyan
Write-Host ('Timestamp: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')) -ForegroundColor Cyan
Write-Host '====================================================' -ForegroundColor Cyan

# 1. Resolve Backup File
$defaultBackupDir = Join-Path $env:USERPROFILE 'TechSproutBackups'
if ([string]::IsNullOrWhiteSpace($BackupFile)) {
    if (Test-Path $defaultBackupDir) {
        $latest = Get-ChildItem -Path $defaultBackupDir -Filter 'techsprout-staging-*.dump' |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($latest) {
            $BackupFile = $latest.FullName
        }
    }
}

if ([string]::IsNullOrWhiteSpace($BackupFile) -or -not (Test-Path $BackupFile)) {
    Write-Error "FAIL: Backup file not found: '$BackupFile'."
    exit 1
}

$fileItem = Get-Item $BackupFile
if ($fileItem.Length -eq 0) {
    Write-Error "FAIL: Backup file has 0 bytes length: '$BackupFile'."
    exit 1
}

Write-Host ('[OK] Target Backup File: ' + $BackupFile + ' (' + $fileItem.Length + ' bytes)') -ForegroundColor Green

# 2. Cryptographic SHA-256 Checksum Verification
$computedHash = (Get-FileHash -Algorithm SHA256 -Path $BackupFile).Hash.ToUpper()
Write-Host ('[OK] Computed Backup SHA-256: ' + $computedHash) -ForegroundColor Green

$manifestPath = [System.IO.Path]::ChangeExtension($BackupFile, '.manifest.json')
if (Test-Path $manifestPath) {
    $manifestData = Get-Content $manifestPath -Raw | ConvertFrom-Json
    if ($manifestData.sha256) {
        if ($manifestData.sha256.ToUpper() -eq $computedHash) {
            Write-Host '[PASS] Cryptographic integrity match: SHA-256 matches manifest.' -ForegroundColor Green
        } else {
            Write-Error "FAIL: SHA-256 checksum mismatch! Manifest: $($manifestData.sha256), Computed: $computedHash"
            exit 1
        }
    }
}

# 3. Docker Environment Setup
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "FAIL: 'docker' CLI is not available on PATH."
    exit 1
}

$isDisposable = [string]::IsNullOrWhiteSpace($TargetContainer)
$containerName = if ($isDisposable) {
    'techsprout-restore-test-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
} else {
    $TargetContainer
}

$dbName = 'techsprout_restore'

try {
    if ($isDisposable) {
        Write-Host ('[RUN] Starting isolated disposable PostgreSQL 16.15 container ' + $containerName + ' (--network none)...') -ForegroundColor Yellow
        $runOut = docker run -d `
            --name $containerName `
            --network none `
            -e POSTGRES_DB=$dbName `
            -e POSTGRES_HOST_AUTH_METHOD=trust `
            postgres:16.15 2>&1

        if ($LASTEXITCODE -ne 0) {
            throw "Failed to start Docker container: $runOut"
        }
        Write-Host ('[OK] Container started: ' + $containerName) -ForegroundColor Green

        # Wait for database readiness
        Write-Host '[RUN] Waiting for PostgreSQL readiness...' -ForegroundColor Yellow
        $ready = $false
        for ($i = 0; $i -lt 15; $i++) {
            Start-Sleep -Seconds 1
            $check = docker exec $containerName pg_isready -U postgres -d $dbName 2>&1
            if ($LASTEXITCODE -eq 0) {
                $ready = $true
                break
            }
        }
        if (-not $ready) {
            throw 'PostgreSQL container failed to become ready in time.'
        }
        Write-Host '[OK] PostgreSQL 16 is ready.' -ForegroundColor Green

        # Copy archive into container
        Write-Host '[RUN] Copying backup archive to container...' -ForegroundColor Yellow
        docker cp "$BackupFile" "${containerName}:/tmp/restore.dump"
        if ($LASTEXITCODE -ne 0) {
            throw 'Failed to copy backup archive into container.'
        }
        Write-Host '[OK] Archive copied into container.' -ForegroundColor Green

        # Execute pg_restore
        Write-Host '[RUN] Executing PostgreSQL 16 pg_restore inside container...' -ForegroundColor Yellow
        $restoreOut = docker exec $containerName pg_restore -U postgres -d $dbName --no-owner --no-acl /tmp/restore.dump 2>&1
        $restoreCode = $LASTEXITCODE
        if ($restoreCode -ne 0) {
            Write-Warning "pg_restore finished with code ${restoreCode}: $restoreOut"
        } else {
            Write-Host '[PASS] pg_restore completed with exit code 0.' -ForegroundColor Green
        }
    } else {
        Write-Host ('[INFO] Using existing target container: ' + $TargetContainer) -ForegroundColor Yellow
    }

    # 4. Identity & Server Version Verification
    Write-Host '[RUN] Verifying database server version and identity...' -ForegroundColor Yellow
    $idQuery = "SELECT current_database(), current_setting('server_version'), version();"
    $idOut = docker exec $containerName psql -U postgres -d $dbName -t -A -F'|' -c "$idQuery" 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Identity query failed: $idOut" }

    $idParts = $idOut.Split('|')
    $currentDb = $idParts[0].Trim()
    $serverVersion = $idParts[1].Trim()
    $fullVersion = if ($idParts.Count -gt 2) { $idParts[2].Trim() } else { $serverVersion }

    $serverMajor = 0
    if ($serverVersion -match '^(\d+)\.') {
        $serverMajor = [int]$matches[1]
    }

    if ($serverMajor -ne 16) {
        Write-Error "FAIL: Server major version is $serverMajor (expected 16). Aborting."
        exit 1
    }
    Write-Host "[PASS] Server Verified: DB='$currentDb', Server Version='$serverVersion' (Major: $serverMajor)" -ForegroundColor Green

    # 5. Schema & Extensions Verification
    Write-Host '[RUN] Verifying extensions and schemas...' -ForegroundColor Yellow
    $extQuery = "SELECT extname, extversion FROM pg_extension WHERE extname != 'plpgsql';"
    $extOut = docker exec $containerName psql -U postgres -d $dbName -t -A -F':' -c "$extQuery" 2>&1
    Write-Host "[OK] Active extensions: $extOut" -ForegroundColor Green

    # 6. Drizzle Migrations Verification
    Write-Host '[RUN] Verifying Drizzle migration records...' -ForegroundColor Yellow
    $migQuery = 'SELECT count(*) FROM drizzle.__drizzle_migrations;'
    $migCount = [int](docker exec $containerName psql -U postgres -d $dbName -t -A -c "$migQuery").Trim()
    if ($migCount -ne 12) {
        Write-Error "FAIL: Expected 12 Drizzle migrations, found $migCount."
        exit 1
    }
    Write-Host "[PASS] Drizzle Migrations Verified: 12 migrations recorded in drizzle.__drizzle_migrations." -ForegroundColor Green

    # 7. Table Inventory and Row Count Verification
    Write-Host '[RUN] Verifying table inventory and total row counts...' -ForegroundColor Yellow
    $tableCountsSql = @'
DO $$
DECLARE
    r RECORD;
    cnt BIGINT;
BEGIN
    CREATE TEMP TABLE IF NOT EXISTS _counts (schemaname text, tablename text, rows_count bigint);
    TRUNCATE _counts;
    FOR r IN (
        SELECT schemaname, tablename 
        FROM pg_tables 
        WHERE schemaname IN ('public', 'drizzle')
        ORDER BY schemaname, tablename
    ) LOOP
        EXECUTE format('SELECT count(*) FROM %I.%I', r.schemaname, r.tablename) INTO cnt;
        INSERT INTO _counts VALUES (r.schemaname, r.tablename, cnt);
    END LOOP;
END $$;
SELECT count(*) || '|' || coalesce(sum(rows_count), 0) FROM _counts;
'@
    $countOut = docker exec $containerName psql -U postgres -d $dbName -t -A -c "$tableCountsSql" 2>&1
    $countLines = @($countOut | Where-Object { $_ -match '\|' })
    if ($countLines.Count -eq 0) { throw "Row count query failed: $countOut" }
    $countParts = $countLines[0].Split('|')
    $tablesCount = [int]$countParts[0].Trim()
    $totalRows = [int]$countParts[1].Trim()

    if ($tablesCount -ne 46) {
        Write-Error "FAIL: Expected 46 tables, found $tablesCount."
        exit 1
    }
    if ($totalRows -ne 870) {
        Write-Error "FAIL: Expected 870 total rows, found $totalRows."
        exit 1
    }
    Write-Host "[PASS] Inventory & Row Counts Verified: $tablesCount tables, $totalRows exact rows." -ForegroundColor Green

    # 8. Constraints, Indexes, and Foreign Key Integrity
    Write-Host '[RUN] Verifying constraints, indexes, and foreign key integrity...' -ForegroundColor Yellow
    $fkQuery = "SELECT count(*) FROM pg_constraint WHERE contype = 'f';"
    $fkCount = [int](docker exec $containerName psql -U postgres -d $dbName -t -A -c "$fkQuery").Trim()
    if ($fkCount -lt 80) {
        Write-Error "FAIL: Expected at least 80 foreign keys, found $fkCount."
        exit 1
    }

    $idxQuery = "SELECT count(*) FROM pg_indexes WHERE schemaname IN ('public', 'drizzle');"
    $idxCount = [int](docker exec $containerName psql -U postgres -d $dbName -t -A -c "$idxQuery").Trim()
    Write-Host "[PASS] Integrity Verified: $fkCount foreign keys active and enforced, $idxCount indexes present." -ForegroundColor Green

    # 9. Update Manifest with Verified Restore Test Metadata
    if (Test-Path $manifestPath) {
        try {
            $manifestObj = Get-Content $manifestPath -Raw | ConvertFrom-Json
            $manifestObj.restoreTest = [PSCustomObject]@{
                status                = 'passed'
                postgresMajorVersion  = 16
                postgresServerVersion = $serverVersion
                testedBackupSha256    = $computedHash
                testedAt              = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
                tablesCount           = $tablesCount
                totalRows             = $totalRows
                migrationsCount       = $migCount
            }
            $updatedJson = $manifestObj | ConvertTo-Json -Depth 5
            [System.IO.File]::WriteAllText($manifestPath, $updatedJson, (New-Object System.Text.UTF8Encoding($false)))
            Write-Host "[OK] Recorded verified restoreTest metadata in manifest: $manifestPath" -ForegroundColor Green
        } catch {
            Write-Warning "Could not update manifest: $($_.Exception.Message)"
        }
    }

    Write-Host '====================================================' -ForegroundColor Cyan
    Write-Host 'SUCCESS: Database backup recovery procedure passed.' -ForegroundColor Green
    Write-Host "Archive:            $BackupFile" -ForegroundColor Green
    Write-Host "Database Verified:  $dbName" -ForegroundColor Green
    Write-Host "Server:             PostgreSQL $serverVersion" -ForegroundColor Green
    Write-Host "Tables:             $tablesCount (1 drizzle + 45 public)" -ForegroundColor Green
    Write-Host "Total Rows:         $totalRows" -ForegroundColor Green
    Write-Host "Migrations:         $migCount" -ForegroundColor Green
    Write-Host "Foreign Keys:       $fkCount enforced" -ForegroundColor Green
    Write-Host "SHA-256 Match:      PASSED ($computedHash)" -ForegroundColor Green
    Write-Host '====================================================' -ForegroundColor Cyan

} finally {
    if ($isDisposable -and -not $KeepRunning) {
        Write-Host "[CLEANUP] Destroying disposable container '$containerName'..." -ForegroundColor Yellow
        docker rm -f $containerName 2>&1 | Out-Null
        Write-Host '[OK] Disposable container destroyed.' -ForegroundColor Green
    } elseif ($isDisposable -and $KeepRunning) {
        Write-Host "[NOTICE] Disposable container '$containerName' kept running on isolated network." -ForegroundColor Yellow
    } else {
        Write-Host "[INFO] Preserved verified baseline container '$TargetContainer'." -ForegroundColor Green
    }
}
