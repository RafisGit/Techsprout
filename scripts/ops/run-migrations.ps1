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
.PARAMETER SkipBackupCheck
    Bypasses pre-migration backup presence verification (only allowed for 'local').
#>

[CmdletBinding()]
param(
    [ValidateSet('staging', 'production', 'local')]
    [string]$Environment = 'staging',

    [string]$DatabaseUrl = '',

    [switch]$SkipBackupCheck
)

$ErrorActionPreference = 'Stop'

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "TechSprout LMS - Controlled Migration Execution" -ForegroundColor Cyan
Write-Host "Target Environment: $Environment" -ForegroundColor Cyan
Write-Host "Timestamp:          $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Backup Requirement Enforcement
if ($Environment -in @('staging', 'production') -and -not $SkipBackupCheck) {
    Write-Host "[CHECK] Verifying pre-migration backup presence..." -ForegroundColor Yellow
    $backupDir = Join-Path $env:USERPROFILE "TechSproutBackups"
    if (-not (Test-Path $backupDir)) {
        Write-Error "FAIL: Backup directory $backupDir not found. Pre-migration backup is mandatory."
        exit 1
    }

    $recentDumps = Get-ChildItem -Path $backupDir -Filter "*.dump" | 
        Where-Object { $_.Length -gt 0 -and $_.LastWriteTime -gt (Get-Date).AddDays(-7) } |
        Sort-Object LastWriteTime -Descending

    if (-not $recentDumps -or $recentDumps.Count -eq 0) {
        Write-Error "FAIL: No verified non-empty .dump archive found within the last 7 days in $backupDir. Execute backup-postgres.ps1 first."
        exit 1
    }

    $latestDump = $recentDumps[0]
    Write-Host "[OK] Pre-migration backup verified: $($latestDump.Name) ($($latestDump.Length) bytes, $($latestDump.LastWriteTime))" -ForegroundColor Green
} elseif ($SkipBackupCheck) {
    if ($Environment -eq 'production') {
        Write-Error "FAIL: -SkipBackupCheck is strictly prohibited for production migrations."
        exit 1
    }
    Write-Warning "WARNING: Backup check skipped via flag."
}

# 2. Resolve Connection String
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
