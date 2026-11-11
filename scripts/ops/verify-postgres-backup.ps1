<#
.SYNOPSIS
    TechSprout LMS - PostgreSQL Backup Verification Script (PowerShell)
.DESCRIPTION
    Validates the integrity of a PostgreSQL custom-format dump archive using pg_restore --list
    and verifies its SHA-256 cryptographic checksum against the manifest.
.PARAMETER BackupFile
    Path to the .dump file to verify.
.PARAMETER ManifestFile
    Optional path to the associated .manifest.json file.
.PARAMETER Environment
    Optional environment name ('staging', 'production', or 'local'). Inferred if omitted.
.PARAMETER ResourceId
    Optional resource identifier. Inferred if omitted.
.PARAMETER GenerateManifest
    Generates or updates the .manifest.json file with verified metadata.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,

    [string]$ManifestFile = '',

    [string]$Environment = '',

    [string]$ResourceId = '',

    [switch]$GenerateManifest
)

$ErrorActionPreference = 'Stop'

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "TechSprout LMS - PostgreSQL Backup Archive Verifier" -ForegroundColor Cyan
Write-Host "Backup File: $BackupFile" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Check file existence
if (-not (Test-Path $BackupFile)) {
    Write-Error "FAIL: Target backup file does not exist: $BackupFile"
    exit 1
}

$fileItem = Get-Item $BackupFile
$fileSize = $fileItem.Length
if ($fileSize -eq 0) {
    Write-Error "FAIL: Backup file has 0 bytes length."
    exit 1
}
Write-Host "[OK] Backup file exists on disk: $fileSize bytes" -ForegroundColor Green

# 2. Check SHA-256 Checksum
$currentHash = (Get-FileHash -Algorithm SHA256 -Path $BackupFile).Hash
Write-Host "[OK] Computed SHA-256: $currentHash" -ForegroundColor Green

# Resolve manifest if not explicitly given
if ([string]::IsNullOrWhiteSpace($ManifestFile)) {
    $potentialManifest = [System.IO.Path]::ChangeExtension($BackupFile, ".manifest.json")
    if (Test-Path $potentialManifest) {
        $ManifestFile = $potentialManifest
    }
}

if (-not [string]::IsNullOrWhiteSpace($ManifestFile) -and (Test-Path $ManifestFile)) {
    Write-Host "[INFO] Validating against manifest: $ManifestFile"
    $manifestData = Get-Content $ManifestFile -Raw | ConvertFrom-Json
    if (-not $manifestData.sha256) {
        Write-Error "FAIL: Manifest at '$ManifestFile' is missing required 'sha256' field."
        exit 1
    }
    if ($manifestData.sha256.ToString().ToUpper() -eq $currentHash.ToUpper()) {
        Write-Host "[PASS] Cryptographic integrity match: SHA-256 matches manifest." -ForegroundColor Green
    } else {
        Write-Error "FAIL: Checksum mismatch! Manifest: $($manifestData.sha256), Actual: $currentHash"
        exit 1
    }
}

# 3. Locate PostgreSQL 16 pg_restore strictly
$pgRestorePath = "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe"
if (-not (Test-Path $pgRestorePath)) {
    Write-Error "CRITICAL: PostgreSQL 16 'pg_restore' executable not found at '$pgRestorePath'. Fallback prohibited."
    exit 1
}

# 4. Read Table of Contents (TOC)
Write-Host "[RUN] Reading archive Table of Contents with pg_restore --list..." -ForegroundColor Yellow
$tocOutput = & $pgRestorePath --list "$BackupFile" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "FAIL: pg_restore --list failed with exit code $LASTEXITCODE. Archive is corrupt."
    exit 1
}

$tocLines = @($tocOutput | Where-Object { $_ -match '^\d+;\s+\d+\s+\d+' })
$tocCount = $tocLines.Count

$schemasFound = @()
$tablesFound = @()

foreach ($line in $tocLines) {
    if ($line -match 'SCHEMA\s+-\s+(\w+)') {
        $schemasFound += $matches[1]
    }
    if ($line -match 'TABLE\s+(\w+)\s+(\w+)') {
        $tablesFound += "$($matches[1]).$($matches[2])"
    }
}

$schemasUnique = @($schemasFound | Select-Object -Unique)
$tablesUnique = @($tablesFound | Select-Object -Unique)

Write-Host "[OK] Archive TOC successfully parsed." -ForegroundColor Green
Write-Host "     TOC Entries:   $tocCount" -ForegroundColor Green
Write-Host "     Schemas Found: $($schemasUnique -join ', ')" -ForegroundColor Green
Write-Host "     Tables Found:  $($tablesUnique.Count) tables" -ForegroundColor Green

if ($tablesUnique.Count -lt 5) {
    Write-Warning "WARNING: Less than 5 tables found in backup. Check database schema scope."
}

# 5. Optionally generate manifest if requested or missing
if ($GenerateManifest -or ([string]::IsNullOrWhiteSpace($ManifestFile) -or -not (Test-Path $ManifestFile))) {
    $targetManifestPath = if (-not [string]::IsNullOrWhiteSpace($ManifestFile)) { $ManifestFile } else { [System.IO.Path]::ChangeExtension($BackupFile, ".manifest.json") }
    
    $inferredEnv = $Environment
    if ([string]::IsNullOrWhiteSpace($inferredEnv)) {
        if ($fileItem.Name -match 'techsprout-(staging|production|local)') {
            $inferredEnv = $matches[1]
        } else {
            $inferredEnv = 'staging'
        }
    }

    $inferredResId = $ResourceId
    if ([string]::IsNullOrWhiteSpace($inferredResId)) {
        if ($inferredEnv -eq 'staging') {
            $inferredResId = 'dpg-db474ae0tbcc73dcgr10-a'
        } elseif ($inferredEnv -eq 'production') {
            $inferredResId = 'dpg-dasmr1e0tbcc73849i90-a'
        } else {
            $inferredResId = 'local'
        }
    }

    $manifestObj = [PSCustomObject]@{
        environment          = $inferredEnv
        resourceId           = $inferredResId
        postgresMajorVersion = 16
        backupTimestamp      = $fileItem.LastWriteTimeUtc.ToString("yyyy-MM-ddTHH:mm:ssZ")
        backupFile           = $fileItem.Name
        fileSizeBytes        = $fileSize
        sha256               = $currentHash
        archiveValidation    = "passed"
        restoreTest          = $null
    }

    $jsonStr = $manifestObj | ConvertTo-Json -Depth 4
    [System.IO.File]::WriteAllText($targetManifestPath, $jsonStr, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "[OK] Generated verified manifest at: $targetManifestPath" -ForegroundColor Green
}

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "SUCCESS: Backup archive verified healthy." -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Cyan
