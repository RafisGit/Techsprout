<#
.SYNOPSIS
    TechSprout LMS - Hardened PostgreSQL 16 Staging Backup Automation (PowerShell)
.DESCRIPTION
    Creates a PostgreSQL custom-format logical backup using PostgreSQL 16 client tools.
    Enforces strict staging identity validation, uses temporary protected PGPASSFILE
    with restrictive Windows ACLs (never passes credentials in process arguments),
    clears inherited PGPASSWORD, queries the live PostgreSQL server to verify major
    version 16, executes pg_dump, verifies SHA-256 and archive TOC with PostgreSQL 16
    pg_restore, and writes an accurate metadata manifest.
.PARAMETER Environment
    Target environment label. Must be 'staging'. Default is 'staging'.
.PARAMETER ResourceId
    Expected database resource ID. Must be 'dpg-db474ae0tbcc73dcgr10-a'.
.PARAMETER OutputDir
    Destination directory. Defaults to '$env:USERPROFILE\TechSproutBackups'.
.PARAMETER WhatIfOnly
    Dry-run flag for offline configuration validation without connecting to network,
    prompting for credentials, or generating backup dump/manifest artifacts.
.PARAMETER MockServerVersion
    Mock version string used exclusively for isolated offline unit tests with -WhatIfOnly.
#>

[CmdletBinding()]
param(
    [ValidateSet('staging', 'production', 'local')]
    [string]$Environment = 'staging',

    [string]$ResourceId = 'dpg-db474ae0tbcc73dcgr10-a',

    [string]$OutputDir = '',

    [switch]$WhatIfOnly,

    [string]$MockServerVersion = ''
)

$ErrorActionPreference = 'Stop'

Write-Host '====================================================' -ForegroundColor Cyan
Write-Host 'TechSprout LMS - Hardened PostgreSQL 16 Staging Backup' -ForegroundColor Cyan
Write-Host "Target Environment: $Environment" -ForegroundColor Cyan
Write-Host "Expected Resource:  $ResourceId" -ForegroundColor Cyan
Write-Host "Timestamp:          $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')" -ForegroundColor Cyan
Write-Host '====================================================' -ForegroundColor Cyan

# -----------------------------------------------------------------------------
# 1. Environment & Resource Identity Parameter Assertions
# -----------------------------------------------------------------------------
# Reject unknown or prohibited command-line arguments (e.g. -DatabaseUrl)
if ($args -and $args.Count -gt 0) {
    Write-Error "CRITICAL: Unknown or prohibited command-line argument '$($args[0])'. Staging connection credentials cannot be supplied as command-line parameters."
    exit 1
}

if ($Environment -ne 'staging') {
    Write-Error "FAIL: This backup script is specifically hardened for staging backup. Expected -Environment 'staging', but received '$Environment'."
    exit 1
}

$expectedStagingResourceId = 'dpg-db474ae0tbcc73dcgr10-a'
if ($ResourceId -ne $expectedStagingResourceId) {
    Write-Error "FAIL: Resource ID mismatch: expected staging resource ID '$expectedStagingResourceId', but received '$ResourceId'."
    exit 1
}

# Rule: Reject any MockServerVersion unless WhatIfOnly is enabled
if ($MockServerVersion -and -not $WhatIfOnly) {
    Write-Error 'CRITICAL: -MockServerVersion is only permitted when -WhatIfOnly is specified. Bypassing live database identity verification during a real backup is strictly prohibited.'
    exit 1
}

# -----------------------------------------------------------------------------
# 2. Strict PostgreSQL 16 Tool Selection & Version Verification
# -----------------------------------------------------------------------------
$pg16BinDir = 'C:\Program Files\PostgreSQL\16\bin'
$pgDumpPath = Join-Path $pg16BinDir 'pg_dump.exe'
$pgRestorePath = Join-Path $pg16BinDir 'pg_restore.exe'
$psqlPath = Join-Path $pg16BinDir 'psql.exe'

# Explicit check: fail closed if tools are missing from PostgreSQL 16 directory
if ((-not (Test-Path $pgDumpPath)) -or (-not (Test-Path $pgRestorePath)) -or (-not (Test-Path $psqlPath))) {
    Write-Error "CRITICAL: PostgreSQL 16 client tools pg_dump, pg_restore, psql not found in $pg16BinDir. Fallback to PostgreSQL 18 or 14 is strictly prohibited for staging backup."
    exit 1
}

# Verify actual executable versions
$pgDumpVerOutput = (& $pgDumpPath --version 2>&1).ToString().Trim()
$pgRestoreVerOutput = (& $pgRestorePath --version 2>&1).ToString().Trim()
$psqlVerOutput = (& $psqlPath --version 2>&1).ToString().Trim()

function Get-PostgresMajorVersion([string]$versionString) {
    if ($versionString -match '(?:\(PostgreSQL\)\s+|pg_dump\s+|pg_restore\s+|psql\s+)(\d+)\.') {
        return [int]$matches[1]
    }
    return 0
}

$dumpMajor = Get-PostgresMajorVersion $pgDumpVerOutput
$restoreMajor = Get-PostgresMajorVersion $pgRestoreVerOutput
$psqlMajor = Get-PostgresMajorVersion $psqlVerOutput

if ($dumpMajor -ne 16) {
    Write-Error "CRITICAL: pg_dump major version is $dumpMajor (expected 16). Version string: $pgDumpVerOutput. Fallback prohibited."
    exit 1
}
if ($restoreMajor -ne 16) {
    Write-Error "CRITICAL: pg_restore major version is $restoreMajor (expected 16). Version string: $pgRestoreVerOutput. Fallback prohibited."
    exit 1
}
if ($psqlMajor -ne 16) {
    Write-Error "CRITICAL: psql major version is $psqlMajor (expected 16). Version string: $psqlVerOutput. Fallback prohibited."
    exit 1
}

Write-Host '[OK] Verified PostgreSQL 16 Tooling:' -ForegroundColor Green
Write-Host "     pg_dump:    $pgDumpPath ($pgDumpVerOutput)" -ForegroundColor Green
Write-Host "     pg_restore: $pgRestorePath ($pgRestoreVerOutput)" -ForegroundColor Green
Write-Host "     psql:       $psqlPath ($psqlVerOutput)" -ForegroundColor Green

# -----------------------------------------------------------------------------
# 3. Dry-Run Execution Gate (Strictly Before Any Credential, Network, or Disk Ops)
# -----------------------------------------------------------------------------
if ($WhatIfOnly) {
    # If a mock server version was provided for testing version rejection in dry-run mode, evaluate it
    if ($MockServerVersion) {
        $mockMajor = 0
        if ($MockServerVersion -match '^(\d+)') {
            $mockMajor = [int]$matches[1]
        }
        if ($mockMajor -ne 16) {
            Write-Error "CRITICAL: Live database server major version is $mockMajor (expected 16). Aborting backup."
            exit 1
        }
    }

    Write-Host '====================================================' -ForegroundColor Cyan
    Write-Host '[WHATIF] Local PostgreSQL 16 toolchain and static staging configuration checks passed.' -ForegroundColor Cyan
    Write-Host '[WHATIF] No credentials requested, no temporary credential files created, no database contacted, and no backup artifacts generated.' -ForegroundColor Cyan
    Write-Host '====================================================' -ForegroundColor Cyan
    exit 0
}

# =============================================================================
# REAL BACKUP EXECUTION (Only executed when -WhatIfOnly is false)
# =============================================================================

# -----------------------------------------------------------------------------
# 4. Resolve Destination Directory
# -----------------------------------------------------------------------------
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $env:USERPROFILE 'TechSproutBackups'
}

if (-not (Test-Path $OutputDir)) {
    Write-Host "[INFO] Creating backup destination directory: $OutputDir"
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# -----------------------------------------------------------------------------
# 5. Credential Input & Memory-Only Parsing (Never Inherit Generic $env:DATABASE_URL)
# -----------------------------------------------------------------------------
# Strictly do NOT accept connection credentials through command-line parameters.
# Strictly do NOT inherit generic $env:DATABASE_URL for staging.

# Clears the current active clipboard contents. Note: This does not affect OS clipboard history if enabled.
function Clear-StagingClipboard {
    try {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
        [System.Windows.Forms.Clipboard]::Clear()
        Write-Host '[INFO] Cleared staging database credentials from local clipboard.' -ForegroundColor Green
    } catch {
        try {
            Set-Clipboard -Value ' ' -ErrorAction SilentlyContinue
            Write-Host '[INFO] Overwrote staging database credentials in local clipboard.' -ForegroundColor Green
        } catch {
            Write-Warning "Could not clear clipboard: $($_.Exception.Message)"
        }
    }
}

# Parse PostgreSQL connection URI in memory using .NET System.Uri
function Parse-PostgreSqlUri([string]$uriString) {
    if ([string]::IsNullOrWhiteSpace($uriString)) {
        throw 'Connection URI is empty.'
    }

    $trimmed = $uriString.Trim().Trim('"', "'")

    # Reject shell commands and environment variable assignments
    if ($trimmed -match '^(?:psql|pg_dump|pg_restore|export\s+|set\s+|env\s+|[a-zA-Z_][a-zA-Z0-9_]*=)') {
        throw 'Input appears to be a shell command or environment variable assignment, not a PostgreSQL connection URI.'
    }

    # Validate percent-encoding integrity in raw input before System.Uri auto-escapes invalid sequences
    if ($trimmed -match '%(?![0-9a-fA-F]{2})') {
        throw 'Malformed percent-encoding in connection URI.'
    }

    # Extract and validate explicit port string without fragile regexes (handles DNS, IPv4, and bracketed IPv6)
    $atIdx = $trimmed.LastIndexOf('@')
    $explicitPort = $null
    if ($atIdx -ge 0) {
        $afterAt = $trimmed.Substring($atIdx + 1)
        if ($afterAt.StartsWith('[')) {
            $closeBracket = $afterAt.IndexOf(']')
            if ($closeBracket -gt 0 -and ($closeBracket + 1) -lt $afterAt.Length -and $afterAt[$closeBracket + 1] -eq ':') {
                $rest = $afterAt.Substring($closeBracket + 2)
                $termIdx = $rest.IndexOfAny(@('/', '?', '#'))
                $explicitPort = if ($termIdx -ge 0) { $rest.Substring(0, $termIdx) } else { $rest }
            }
        } else {
            $termIdx = $afterAt.IndexOfAny(@('/', '?', '#'))
            $hostPort = if ($termIdx -ge 0) { $afterAt.Substring(0, $termIdx) } else { $afterAt }
            $colonIdx = $hostPort.IndexOf(':')
            if ($colonIdx -ge 0) {
                $explicitPort = $hostPort.Substring($colonIdx + 1)
            }
        }

        if ($explicitPort -ne $null) {
            $parsedPortVal = 0
            if (-not [int]::TryParse($explicitPort, [ref]$parsedPortVal) -or $parsedPortVal -lt 1 -or $parsedPortVal -gt 65535) {
                throw "Invalid port '$explicitPort'. Port must be an integer between 1 and 65535."
            }
        }
    }

    $uri = $null
    $ok = [System.Uri]::TryCreate($trimmed, [System.UriKind]::Absolute, [ref]$uri)
    if (-not $ok -or -not $uri) {
        throw 'Invalid PostgreSQL connection URI format.'
    }

    # 1. Scheme check
    $scheme = $uri.Scheme.ToLowerInvariant()
    if ($scheme -ne 'postgres' -and $scheme -ne 'postgresql') {
        throw "Unsupported URI scheme '$scheme'. Scheme must be 'postgres' or 'postgresql'."
    }

    # 2. Reject URI fragments
    if (-not [string]::IsNullOrEmpty($uri.Fragment)) {
        throw 'URI fragments are prohibited in PostgreSQL connection URI.'
    }

    # 3. Host check
    if ([string]::IsNullOrWhiteSpace($uri.Host)) {
        throw 'Missing or invalid hostname in connection URI.'
    }
    if ($uri.Host -match '\s') {
        throw 'Hostname cannot contain whitespace.'
    }

    # 4. Port check (Default to 5432 if omitted)
    $portNum = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
    if ($portNum -lt 1 -or $portNum -gt 65535) {
        throw "Invalid port: $portNum. Port must be between 1 and 65535."
    }

    # 5. UserInfo check via GetComponents with UriEscaped
    $userInfo = $uri.GetComponents([System.UriComponents]::UserInfo, [System.UriFormat]::UriEscaped)
    if ([string]::IsNullOrWhiteSpace($userInfo)) {
        throw 'Missing credentials in connection URI: username and password are required.'
    }

    $colonIdx = $userInfo.IndexOf(':')
    if ($colonIdx -lt 0) {
        throw 'Missing password in connection URI.'
    }

    $rawUser = $userInfo.Substring(0, $colonIdx)
    $rawPass = $userInfo.Substring($colonIdx + 1)

    if ([string]::IsNullOrWhiteSpace($rawUser)) {
        throw 'Missing username in connection URI.'
    }
    if ([string]::IsNullOrEmpty($rawPass)) {
        throw 'Missing password in connection URI.'
    }

    # Validate percent-encoding integrity
    if ($rawUser -match '%(?![0-9a-fA-F]{2})' -or $rawPass -match '%(?![0-9a-fA-F]{2})') {
        throw 'Malformed percent-encoding in connection URI credentials.'
    }

    $user = [System.Uri]::UnescapeDataString($rawUser)
    $pass = [System.Uri]::UnescapeDataString($rawPass)

    if ([string]::IsNullOrWhiteSpace($user) -or [string]::IsNullOrEmpty($pass)) {
        throw 'Missing username or password in connection URI.'
    }

    # 6. Database check - reject multi-segment paths (single trailing slash allowed)
    # Query parameters (e.g. ?sslmode=require) are accepted but ignored for database name extraction.
    # The backup process independently enforces $env:PGSSLMODE = 'require' on the libpq environment.
    $segs = @($uri.Segments | Where-Object { $_.Trim('/') -ne '' })
    if ($segs.Count -eq 0) {
        throw 'Missing database name in connection URI.'
    }
    if ($segs.Count -gt 1) {
        throw 'Invalid database path in connection URI: multiple path segments are prohibited. Connection URI database path must contain exactly one database name segment.'
    }

    $rawDb = $segs[0].Trim('/')
    if ($rawDb -match '%(?![0-9a-fA-F]{2})') {
        throw 'Malformed percent-encoding in database name.'
    }

    $db = [System.Uri]::UnescapeDataString($rawDb)
    if ([string]::IsNullOrWhiteSpace($db)) {
        throw 'Missing database name in connection URI.'
    }

    return [PSCustomObject]@{
        Host     = $uri.Host
        Port     = $portNum
        Database = $db
        Username = $user
        Password = $pass
    }
}

Write-Host ''
Write-Host 'Staging database credentials must be entered securely via clipboard.' -ForegroundColor Yellow
Write-Host 'Never paste connection URIs into chat, logs, or command line arguments.' -ForegroundColor Yellow
Write-Host ''
Write-Host 'Instructions:' -ForegroundColor Cyan
Write-Host '  1. Copy the Render External Database URL from the Render Dashboard.' -ForegroundColor Cyan
Write-Host '  2. Return to this PowerShell window.' -ForegroundColor Cyan
Write-Host '  3. Press Enter to allow the script to capture and clear the clipboard.' -ForegroundColor Cyan
Write-Host ''

$null = Read-Host -Prompt 'Press Enter once the Render External Database URL is copied to your clipboard'

$connStr = $null
try {
    $connStr = Get-Clipboard -Raw
} catch {
    Write-Error "FAIL: Unable to access clipboard: $($_.Exception.Message)"
    exit 1
} finally {
    Clear-StagingClipboard
}

if ([string]::IsNullOrWhiteSpace($connStr)) {
    Write-Error 'FAIL: Clipboard is empty or contains no database connection URI. Backup cannot proceed.'
    exit 1
}

try {
    $parsedUri = Parse-PostgreSqlUri $connStr
} catch {
    Write-Error "FAIL: Could not parse connection URI: $_"
    exit 1
}

# -----------------------------------------------------------------------------
# 6. Staging Identity & Anti-Production Boundary Verification
# -----------------------------------------------------------------------------
Write-Host '[CHECK] Verifying connection target against staging resource contract...' -ForegroundColor Yellow

# Anti-Production Check: Fail closed if connection identifies production database
$prodResourceId = 'dpg-dasmr1e0tbcc73849i90-a'
if ($parsedUri.Host -match [regex]::Escape($prodResourceId)) {
    Write-Error "CRITICAL REJECTION: Connection host identifies the PRODUCTION database ($prodResourceId). Refusing to proceed with staging backup."
    exit 1
}

if ($parsedUri.Database -eq 'techsprout' -or $parsedUri.Database -eq 'techsprout_production') {
    Write-Error "CRITICAL REJECTION: Connection database is '$($parsedUri.Database)'. Expected 'techsprout_staging'. Refusing to proceed with production database."
    exit 1
}

# Staging Resource Match: Host must contain staging resource ID
if (-not ($parsedUri.Host -match [regex]::Escape($expectedStagingResourceId))) {
    Write-Error "CRITICAL: Connection host does not identify staging resource ID '$expectedStagingResourceId'."
    exit 1
}

# Staging Database Name Match: Must be techsprout_staging
if ($parsedUri.Database -ne 'techsprout_staging') {
    Write-Error "CRITICAL: Connection database '$($parsedUri.Database)' does not match expected staging database 'techsprout_staging'."
    exit 1
}

Write-Host "[PASS] Staging connection contract verified: Host identifies $expectedStagingResourceId, DB is techsprout_staging." -ForegroundColor Green

# -----------------------------------------------------------------------------
# 7. Target Filename and File Paths
# -----------------------------------------------------------------------------
$timestamp = Get-Date -Format 'yyyy-MM-dd-HHmmss'
$backupFileName = "techsprout-${Environment}-${timestamp}.dump"
$backupPath = Join-Path $OutputDir $backupFileName
$manifestPath = Join-Path $OutputDir "techsprout-${Environment}-${timestamp}.manifest.json"

if (Test-Path $backupPath) {
    Write-Error "FAIL: Backup file already exists at '$backupPath'. Overwrites are prohibited."
    exit 1
}

# -----------------------------------------------------------------------------
# 8. Safe Credential Handling via Temporary Protected PGPASSFILE
# -----------------------------------------------------------------------------
function Format-PgPassValue([string]$val) {
    if ([string]::IsNullOrEmpty($val)) { return '*' }
    return $val.Replace('\', '\\').Replace(':', '\:')
}

$escapedHost = Format-PgPassValue $parsedUri.Host
$escapedPort = Format-PgPassValue ($parsedUri.Port.ToString())
$escapedDb   = Format-PgPassValue $parsedUri.Database
$escapedUser = Format-PgPassValue $parsedUri.Username
$escapedPass = if ($parsedUri.Password) { $parsedUri.Password.Replace('\', '\\').Replace(':', '\:') } else { '' }

$pgPassEntry = "$($escapedHost):$($escapedPort):$($escapedDb):$($escapedUser):$($escapedPass)"

# Create a temporary password file with restrictive Windows file ACLs
$tempPassPath = Join-Path $env:TEMP ('techsprout_pgpass_' + [Guid]::NewGuid().ToString('N') + '.tmp')

# Backup existing environment variables to restore in finally block
$origPgPassword = $env:PGPASSWORD
$origPgPassFile = $env:PGPASSFILE
$origPgHost     = $env:PGHOST
$origPgPort     = $env:PGPORT
$origPgDatabase = $env:PGDATABASE
$origPgUser     = $env:PGUSER
$origPgSslMode  = $env:PGSSLMODE

# Protect against inherited PGPASSWORD - clear it so libpq exclusively uses the protected PGPASSFILE
$env:PGPASSWORD = $null
Remove-Item env:\PGPASSWORD -ErrorAction SilentlyContinue

try {
    # 8.1 Create file and apply restrictive Windows ACL (Current user only)
    [System.IO.File]::WriteAllText($tempPassPath, '', [System.Text.Encoding]::ASCII)
    $acl = Get-Acl -Path $tempPassPath
    $acl.SetAccessRuleProtection($true, $false) # Strip inherited rules
    $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        $currentUser,
        'FullControl',
        [System.Security.AccessControl.AccessControlType]::Allow
    )
    $acl.SetAccessRule($accessRule)
    Set-Acl -Path $tempPassPath -AclObject $acl

    # 8.2 Write the pgpass entry
    [System.IO.File]::WriteAllText($tempPassPath, "$pgPassEntry`n", [System.Text.Encoding]::ASCII)

    # 8.3 Set libpq environment variables pointing to pgpassfile and host options
    $env:PGPASSFILE = $tempPassPath
    $env:PGHOST     = $parsedUri.Host
    $env:PGPORT     = $parsedUri.Port.ToString()
    $env:PGDATABASE = $parsedUri.Database
    $env:PGUSER     = $parsedUri.Username
    $env:PGSSLMODE  = 'require'

    # -------------------------------------------------------------------------
    # 9. Live Database Server Identity & Major Version Verification via psql
    # -------------------------------------------------------------------------
    Write-Host '[RUN] Verifying live server identity and version using PostgreSQL 16 psql...' -ForegroundColor Yellow
    $serverQuery = 'SELECT current_database(), current_setting(''server_version''), version();'
    $queryOutput = & $psqlPath `
        --no-password `
        --tuples-only `
        --no-align `
        --field-separator='|' `
        --command="$serverQuery" 2>&1

    if ($LASTEXITCODE -ne 0) {
        Write-Error "FAIL: Live database identity check failed. psql exited with code $LASTEXITCODE. Verify credentials and network access."
        exit 1
    }

    $queryLines = @($queryOutput | Where-Object { $_ -match '\|' })
    if ($queryLines.Count -eq 0) {
        Write-Error 'FAIL: Received empty or invalid response from psql server identity query.'
        exit 1
    }

    $parts = $queryLines[0].Split('|')
    $queriedDb = $parts[0].Trim()
    $serverVersionSetting = $parts[1].Trim()
    $fullVersionStr = if ($parts.Count -gt 2) { $parts[2].Trim() } else { $serverVersionSetting }

    if ($queriedDb -ne 'techsprout_staging') {
        Write-Error "CRITICAL: Live database identity returned '$queriedDb', expected 'techsprout_staging'. Aborting."
        exit 1
    }

    $postgresMajorVersion = 0
    if ($serverVersionSetting -match '^(\d+)\.') {
        $postgresMajorVersion = [int]$matches[1]
    }
    $postgresServerVersion = $serverVersionSetting

    if ($postgresMajorVersion -ne 16) {
        Write-Error "CRITICAL: Live database server major version is $postgresMajorVersion (expected 16). Aborting backup."
        exit 1
    }

    Write-Host "[PASS] Live server verified: DB='$queriedDb', Server Version='$serverVersionSetting' (Major: $postgresMajorVersion)" -ForegroundColor Green

    # -------------------------------------------------------------------------
    # 10. Execute pg_dump (Zero Credentials in Process Arguments)
    # -------------------------------------------------------------------------
    Write-Host '[RUN] Executing PostgreSQL 16 pg_dump logical backup...' -ForegroundColor Yellow
    Write-Host "      Destination: $backupPath"

    # Strictly use --no-password with no credentials or URIs in command line arguments
    & $pgDumpPath `
        --no-password `
        --format=custom `
        --no-owner `
        --no-acl `
        --file="$backupPath"

    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump process exited with code $LASTEXITCODE"
    }

    # -------------------------------------------------------------------------
    # 11. Confirm Archive Existence and Non-Zero Length
    # -------------------------------------------------------------------------
    if ((-not (Test-Path $backupPath)) -or ((Get-Item $backupPath).Length -eq 0)) {
        if (Test-Path $backupPath) {
            Remove-Item -Path $backupPath -Force -ErrorAction SilentlyContinue
        }
        Write-Error 'FAIL: Backup file was not created or has 0 bytes length.'
        exit 1
    }

    $fileItem = Get-Item $backupPath
    $fileSize = $fileItem.Length
    Write-Host "[OK] Backup dump file created successfully: $fileSize bytes." -ForegroundColor Green

    # -------------------------------------------------------------------------
    # 12. Compute Cryptographic Checksum
    # -------------------------------------------------------------------------
    $hashObj = Get-FileHash -Algorithm SHA256 -Path $backupPath
    $sha256 = $hashObj.Hash
    Write-Host "[OK] SHA-256 Checksum: $sha256" -ForegroundColor Green

    # -------------------------------------------------------------------------
    # 13. Validate Archive TOC via PostgreSQL 16 pg_restore --list
    # -------------------------------------------------------------------------
    Write-Host '[RUN] Validating archive integrity via PostgreSQL 16 pg_restore --list...' -ForegroundColor Yellow
    $tocOutput = & $pgRestorePath --list "$backupPath" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "FAIL: Archive validation failed. pg_restore --list exited with code $LASTEXITCODE. Archive is corrupt."
        exit 1
    }
    $archiveValidation = 'passed'
    Write-Host '[PASS] Archive passed PostgreSQL 16 pg_restore --list integrity check.' -ForegroundColor Green

    # -------------------------------------------------------------------------
    # 14. Write Accurate Machine-Readable Non-Sensitive Manifest
    # -------------------------------------------------------------------------
    $manifest = [PSCustomObject]@{
        environment           = $Environment
        resourceId            = $ResourceId
        postgresMajorVersion  = $postgresMajorVersion
        postgresServerVersion = $postgresServerVersion
        pgDumpVersion         = $pgDumpVerOutput
        pgRestoreVersion      = $pgRestoreVerOutput
        backupTimestamp       = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        backupFile            = $backupFileName
        fileSizeBytes         = $fileSize
        sha256                = $sha256
        archiveValidation     = $archiveValidation
        restoreTest           = $null
        format                = 'custom'
        flags                 = '--no-owner --no-acl --no-password'
    }

    $jsonStr = $manifest | ConvertTo-Json -Depth 4
    [System.IO.File]::WriteAllText($manifestPath, $jsonStr, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "[OK] Backup manifest written to $manifestPath" -ForegroundColor Green

    Write-Host '====================================================' -ForegroundColor Cyan
    Write-Host 'SUCCESS: Staging backup completed and verified on disk.' -ForegroundColor Green
    Write-Host "Archive:  $backupPath" -ForegroundColor Green
    Write-Host "Manifest: $manifestPath" -ForegroundColor Green
    Write-Host '====================================================' -ForegroundColor Cyan

} finally {
    # -------------------------------------------------------------------------
    # 15. Cleanup & Environment Restoration (Always Runs on Success and Error)
    # -------------------------------------------------------------------------
    # Restore previous environment variables
    $env:PGPASSWORD = $origPgPassword
    $env:PGPASSFILE = $origPgPassFile
    $env:PGHOST     = $origPgHost
    $env:PGPORT     = $origPgPort
    $env:PGDATABASE = $origPgDatabase
    $env:PGUSER     = $origPgUser
    $env:PGSSLMODE  = $origPgSslMode

    # Remove temporary password file securely
    if ($tempPassPath -and (Test-Path $tempPassPath)) {
        Remove-Item -Path $tempPassPath -Force -ErrorAction SilentlyContinue
    }
}
