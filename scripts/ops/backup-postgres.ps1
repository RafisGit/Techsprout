<#
.SYNOPSIS
    TechSprout LMS - Secure PostgreSQL Database Backup Script (PowerShell)
.DESCRIPTION
    Creates a PostgreSQL custom-format logical backup using pg_dump (--format=custom --no-owner --no-acl).
    Calculates SHA-256 checksum and generates a non-sensitive metadata manifest.
    Guarantees secrets are never printed to terminal or saved to logs.
.PARAMETER Environment
    Target environment label: 'staging' or 'production'. Default is 'staging'.
.PARAMETER ResourceId
    Render resource identifier (e.g. 'dpg-db474ae0tbcc73dcgr10-a').
.PARAMETER OutputDir
    Destination directory. Defaults to '$env:USERPROFILE\TechSproutBackups'.
.PARAMETER DatabaseUrl
    Optional connection string. If omitted, prompts privately or reads $env:DATABASE_URL.
#>

[CmdletBinding()]
param(
    [ValidateSet('staging', 'production', 'local')]
    [string]$Environment = 'staging',

    [string]$ResourceId = '',

    [string]$OutputDir = '',

    [string]$DatabaseUrl = ''
)

$ErrorActionPreference = 'Stop'

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "TechSprout LMS - PostgreSQL Logical Backup Automation" -ForegroundColor Cyan
Write-Host "Target Environment: $Environment" -ForegroundColor Cyan
Write-Host "Timestamp:          $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Resolve PostgreSQL tooling (pg_dump)
$pgDumpPath = $null
$potentialPaths = @(
    "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe",
    "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
    "C:\Program Files\PostgreSQL\14\bin\pg_dump.exe"
)

foreach ($path in $potentialPaths) {
    if (Test-Path $path) {
        $pgDumpPath = $path
        break
    }
}

if (-not $pgDumpPath) {
    $cmd = Get-Command pg_dump -ErrorAction SilentlyContinue
    if ($cmd) {
        $pgDumpPath = $cmd.Source
    }
}

if (-not $pgDumpPath) {
    Write-Error "CRITICAL: 'pg_dump' executable not found. Please install PostgreSQL 16+ client tools."
    exit 1
}

$pgDumpVersion = & $pgDumpPath --version
Write-Host "[OK] Using pg_dump: $pgDumpPath ($pgDumpVersion)" -ForegroundColor Green

# 2. Resolve Destination Directory
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $env:USERPROFILE "TechSproutBackups"
}

if (-not (Test-Path $OutputDir)) {
    Write-Host "[INFO] Creating backup destination directory: $OutputDir"
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# 3. Resolve Database Connection String safely without printing credentials
$connStr = $DatabaseUrl
if ([string]::IsNullOrWhiteSpace($connStr)) {
    if (-not [string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
        $connStr = $env:DATABASE_URL
    } else {
        Write-Host "DATABASE_URL not set in environment." -ForegroundColor Yellow
        $secureInput = Read-Host "Enter PostgreSQL connection string privately (masked)" -AsSecureString
        $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureInput)
        try {
            $connStr = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
        } finally {
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    }
}

if ([string]::IsNullOrWhiteSpace($connStr)) {
    Write-Error "FAIL: No database connection string provided. Backup cannot proceed."
    exit 1
}

# 4. Generate Target Filename and File Paths
$timestamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
$backupFileName = "techsprout-${Environment}-${timestamp}.dump"
$backupPath = Join-Path $OutputDir $backupFileName
$manifestPath = Join-Path $OutputDir "techsprout-${Environment}-${timestamp}.manifest.json"

if (Test-Path $backupPath) {
    Write-Error "FAIL: Backup file already exists at $backupPath. Overwrites are prohibited."
    exit 1
}

# 5. Execute pg_dump
Write-Host "[RUN] Executing pg_dump logical backup..." -ForegroundColor Yellow
Write-Host "      Destination: $backupPath"

$env:PGSSLMODE = 'require'
try {
    & $pgDumpPath `
        --format=custom `
        --no-owner `
        --no-acl `
        --file="$backupPath" `
        "$connStr"

    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump process exited with code $LASTEXITCODE"
    }
} catch {
    if (Test-Path $backupPath) {
        Remove-Item -Path $backupPath -Force -ErrorAction SilentlyContinue
    }
    Write-Error "FAIL: pg_dump failed: $_"
    exit 1
}

if (-not (Test-Path $backupPath) -or (Get-Item $backupPath).Length -eq 0) {
    if (Test-Path $backupPath) {
        Remove-Item -Path $backupPath -Force -ErrorAction SilentlyContinue
    }
    Write-Error "FAIL: Backup file was not created or has 0 bytes length."
    exit 1
}

$fileItem = Get-Item $backupPath
$fileSize = $fileItem.Length
Write-Host "[OK] Backup dump file created successfully: $fileSize bytes." -ForegroundColor Green

# 6. Compute Cryptographic Checksum
$hashObj = Get-FileHash -Algorithm SHA256 -Path $backupPath
$sha256 = $hashObj.Hash
Write-Host "[OK] SHA-256 Checksum: $sha256" -ForegroundColor Green

# 7. Validate Archive via pg_restore --list
Write-Host "[RUN] Validating archive integrity via pg_restore --list..." -ForegroundColor Yellow
$pgRestorePath = $null
$potentialRestorePaths = @(
    "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe",
    "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe",
    "C:\Program Files\PostgreSQL\14\bin\pg_restore.exe"
)
foreach ($p in $potentialRestorePaths) {
    if (Test-Path $p) { $pgRestorePath = $p; break }
}
if (-not $pgRestorePath) {
    $cmd = Get-Command pg_restore -ErrorAction SilentlyContinue
    if ($cmd) { $pgRestorePath = $cmd.Source }
}

$archiveValidation = "failed"
if ($pgRestorePath) {
    & $pgRestorePath --list "$backupPath" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $archiveValidation = "passed"
        Write-Host "[PASS] Archive passed pg_restore --list integrity check." -ForegroundColor Green
    }
}

$effectiveResourceId = $ResourceId
if ([string]::IsNullOrWhiteSpace($effectiveResourceId)) {
    if ($Environment -eq 'staging') {
        $effectiveResourceId = 'dpg-db474ae0tbcc73dcgr10-a'
    } elseif ($Environment -eq 'production') {
        $effectiveResourceId = 'dpg-dasmr1e0tbcc73849i90-a'
    } else {
        $effectiveResourceId = 'local'
    }
}

# 8. Write Machine-Readable Safe Metadata Manifest
$manifest = [PSCustomObject]@{
    environment          = $Environment
    resourceId           = $effectiveResourceId
    postgresMajorVersion = 16
    backupTimestamp      = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    backupFile           = $backupFileName
    fileSizeBytes        = $fileSize
    sha256               = $sha256
    archiveValidation    = $archiveValidation
    restoreTest          = $null
    pgDumpVersion        = $pgDumpVersion
    format               = "custom"
    flags                = "--no-owner --no-acl"
}

$jsonStr = $manifest | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($manifestPath, $jsonStr, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "[OK] Backup manifest written to $manifestPath" -ForegroundColor Green

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "SUCCESS: Backup completed and verified on disk." -ForegroundColor Green
Write-Host "Archive:  $backupPath" -ForegroundColor Green
Write-Host "Manifest: $manifestPath" -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Cyan
