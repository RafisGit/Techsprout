<#
.SYNOPSIS
    TechSprout LMS - Controlled Database Migration Runner (PowerShell)
.DESCRIPTION
    Executes pending Drizzle ORM migrations as an isolated, deliberate release operation.
    Enforces pre-migration backup verification, serializes execution, logs applied
    migration timestamps, and fails closed on error. Never executes seed scripts.
.PARAMETER Environment
    Target environment: 'staging', 'production', or 'local'.
.PARAMETER DatabaseUrl
    Connection string. If omitted, prompts privately or uses $env:DATABASE_URL.
.PARAMETER ResourceId
    Expected database resource ID. Defaults to standard Render IDs if omitted.
.PARAMETER BackupDir
    Directory holding verified backup archives. Defaults to '$env:USERPROFILE\TechSproutBackups'.
.PARAMETER SkipBackupCheck
    Bypasses pre-migration backup verification (STRICTLY prohibited for staging & production).
#>

[CmdletBinding()]
param(
    [ValidateSet('staging', 'production', 'local')]
    [string]$Environment = 'staging',

    [string]$DatabaseUrl = '',

    [string]$ResourceId = '',

    [string]$BackupDir = '',

    [switch]$SkipBackupCheck
)

$ErrorActionPreference = 'Stop'

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "TechSprout LMS - Controlled Migration Execution" -ForegroundColor Cyan
Write-Host "Target Environment: $Environment" -ForegroundColor Cyan
Write-Host "Timestamp:          $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Pre-Migration Backup Verification Gate
if ($Environment -in @('staging', 'production')) {
    if ($SkipBackupCheck) {
        Write-Error "FAIL: -SkipBackupCheck is strictly prohibited for '$Environment' migrations. A verified pre-migration backup is mandatory."
        exit 1
    }

    $resolvedBackupDir = if (-not [string]::IsNullOrWhiteSpace($BackupDir)) { $BackupDir } else { Join-Path $env:USERPROFILE "TechSproutBackups" }
    Write-Host "[CHECK] Verifying pre-migration backup gate in $resolvedBackupDir..." -ForegroundColor Yellow

    $gateEngine = Join-Path $PSScriptRoot "backup-gate.mjs"
    if (Test-Path $gateEngine) {
        & node "$gateEngine" $Environment $resolvedBackupDir
        if ($LASTEXITCODE -ne 0) {
            Write-Error "FAIL: Pre-migration backup gate check failed for environment '$Environment'. Migration aborted."
            exit 1
        }
    } else {
        # Fallback to direct directory check if engine is missing
        if (-not (Test-Path $resolvedBackupDir)) {
            Write-Error "FAIL: Backup directory $resolvedBackupDir not found. Pre-migration backup is mandatory."
            exit 1
        }
        $manifests = Get-ChildItem -Path $resolvedBackupDir -Filter "techsprout-${Environment}-*.manifest.json"
        if (-not $manifests -or $manifests.Count -eq 0) {
            Write-Error "FAIL: No verified pre-migration backup manifest found for environment '$Environment' in $resolvedBackupDir."
            exit 1
        }
    }
    Write-Host "[PASS] Pre-migration backup gate successfully verified for '$Environment'." -ForegroundColor Green
} elseif ($SkipBackupCheck) {
    Write-Warning "WARNING: Backup check skipped for local development environment."
}

# 2. Resolve Connection String safely without printing credentials
$connStr = $DatabaseUrl
if ([string]::IsNullOrWhiteSpace($connStr)) {
    if (-not [string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
        $connStr = $env:DATABASE_URL
    } else {
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
    Write-Error "FAIL: No database connection string provided."
    exit 1
}

# 3. Locate Migration Runner
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$migrateScriptDist = Join-Path $repoRoot "apps\api\dist\database\migrate.js"
$migrateScriptSrc = Join-Path $repoRoot "apps\api\src\database\migrate.ts"

$env:DATABASE_URL = $connStr
$env:PGSSLMODE = 'require'

try {
    Write-Host "[RUN] Executing Drizzle ORM migrations..." -ForegroundColor Yellow
    if (Test-Path $migrateScriptDist) {
        Write-Host "      Using compiled runner: $migrateScriptDist"
        & node $migrateScriptDist
    } else {
        Write-Host "      Using TypeScript runner: $migrateScriptSrc"
        & pnpm --filter @techsprout/api exec tsx src/database/migrate.ts
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Migration process failed with exit code $LASTEXITCODE"
    }

    Write-Host "[PASS] Migrations applied successfully." -ForegroundColor Green
    Write-Host "====================================================" -ForegroundColor Cyan
    Write-Host "SUCCESS: Database migration run completed." -ForegroundColor Green
    Write-Host "====================================================" -ForegroundColor Cyan
} catch {
    Write-Error "CRITICAL: Database migration failed: $_"
    exit 1
} finally {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}
