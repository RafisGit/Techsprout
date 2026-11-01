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
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,

    [string]$ManifestFile = ''
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
    if ($manifestData.sha256) {
        if ($manifestData.sha256.ToUpper() -eq $currentHash.ToUpper()) {
            Write-Host "[PASS] Cryptographic integrity match: SHA-256 matches manifest." -ForegroundColor Green
        } else {
            Write-Error "FAIL: Checksum mismatch! Manifest: $($manifestData.sha256), Actual: $currentHash"
            exit 1
        }
    }
}

# 3. Locate pg_restore
$pgRestorePath = $null
$potentialPaths = @(
    "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe",
    "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe",
    "C:\Program Files\PostgreSQL\14\bin\pg_restore.exe"
)

foreach ($path in $potentialPaths) {
    if (Test-Path $path) {
        $pgRestorePath = $path
        break
    }
}

if (-not $pgRestorePath) {
    $cmd = Get-Command pg_restore -ErrorAction SilentlyContinue
    if ($cmd) {
        $pgRestorePath = $cmd.Source
    }
}

if (-not $pgRestorePath) {
    Write-Error "CRITICAL: 'pg_restore' executable not found."
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

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "SUCCESS: Backup archive verified healthy." -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Cyan
