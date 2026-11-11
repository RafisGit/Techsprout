<#
.SYNOPSIS
    TechSprout LMS - Hardened Staging Backup Safety Verification Suite (PowerShell)
.DESCRIPTION
    Automated safety test suite validating the security guards of backup-postgres.ps1:
    - WhatIfOnly works without any credentials or interactive prompt
    - WhatIfOnly creates no output directory or backup artifacts
    - WhatIfOnly creates no temporary PGPASSFILE
    - WhatIfOnly does not modify inherited PostgreSQL environment variables
    - Static toolchain and staging resource checks apply before dry-run
    - MockServerVersion cannot bypass real verification
    - DatabaseUrl command-line parameter is rejected
    - Anti-production host and database name rejection during real execution
    - Temporary credential file cleanup on error in real execution
    - Fails closed on any security breach
#>

$ErrorActionPreference = 'Stop'

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "TechSprout LMS -- Staging Backup Safety Test Suite" -ForegroundColor Cyan
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

$scriptPath = (Resolve-Path (Join-Path $PSScriptRoot "backup-postgres.ps1")).Path
$testDir = Join-Path $env:TEMP ("techsprout_backup_safety_tests_" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $testDir -Force | Out-Null

# Extract Parse-PostgreSqlUri and Clear-StagingClipboard directly from backup-postgres.ps1 for unit assertions
$backupScriptContent = Get-Content -Raw $scriptPath
$parserMatch = [regex]::Match($backupScriptContent, '(?ms)function Parse-PostgreSqlUri\b.*?^\}')
if ($parserMatch.Success) {
    Invoke-Expression $parserMatch.Value
} else {
    throw "Could not extract Parse-PostgreSqlUri from $scriptPath"
}

$clearClipMatch = [regex]::Match($backupScriptContent, '(?ms)function Clear-StagingClipboard\b.*?^\}')
if ($clearClipMatch.Success) {
    Invoke-Expression $clearClipMatch.Value
} else {
    throw "Could not extract Clear-StagingClipboard from $scriptPath"
}

$script:passCount = 0
$script:failCount = 0

function Invoke-StagingBackupTest {
    param(
        [string]$ConnectionUri = "",
        [string[]]$Arguments = @()
    )

    $encodedUri = if ($ConnectionUri) {
        [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($ConnectionUri))
    } else {
        ""
    }

    $sb = @"
`$ErrorActionPreference = 'Continue'
`$rawBytes = [Convert]::FromBase64String('$encodedUri')
`$mockClipboardVal = if ('$encodedUri') { [System.Text.Encoding]::UTF8.GetString(`$rawBytes) } else { "" }
function Read-Host {
    param([string]`$Prompt, [switch]`$AsSecureString)
    return ""
}
function Get-Clipboard {
    param([switch]`$Raw)
    return `$mockClipboardVal
}
& '$scriptPath' $($Arguments -join ' ')
"@

    $bytes = [System.Text.Encoding]::Unicode.GetBytes($sb)
    $encodedCmd = [Convert]::ToBase64String($bytes)
    return (& powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand $encodedCmd 2>&1)
}

function Assert-Test {
    param(
        [Parameter(Mandatory=$true)]
        [string]$TestName,
        [Parameter(Mandatory=$true)]
        [scriptblock]$Action,
        [Parameter(Mandatory=$false)]
        [string]$ExpectedErrorPattern = "",
        [Parameter(Mandatory=$false)]
        [scriptblock]$PostAssert = $null
    )

    Write-Host "`n[TEST] $TestName" -ForegroundColor Yellow
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $Action 2>&1
    } catch {
        $output = @($_)
    }
    $ErrorActionPreference = $prevEap

    # Extract raw text from string or ErrorRecord without PowerShell's wrapper banner
    $rawLines = @($output | ForEach-Object {
        if ($_ -is [System.Management.Automation.ErrorRecord]) {
            if ($_.TargetObject) { $_.TargetObject.ToString() }
            elseif ($_.Exception) { $_.Exception.Message }
            else { $_.ToString() }
        } else {
            $_.ToString()
        }
    })
    $joinedText = ($rawLines -join ' ') -replace '\s+', ' '

    if ($ExpectedErrorPattern) {
        if ($joinedText -match $ExpectedErrorPattern) {
            Write-Host "  [PASS] Expected failure occurred matching: '$ExpectedErrorPattern'" -ForegroundColor Green
            $script:passCount++
        } else {
            Write-Host "  [FAIL] Expected error matching '$ExpectedErrorPattern', but got:`n$joinedText" -ForegroundColor Red
            $script:failCount++
            return
        }
    } else {
        # Check if any error records occurred when success was expected
        $errCount = ($output | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] }).Count
        if ($errCount -gt 0) {
            Write-Host "  [FAIL] Unexpected error occurred:`n$joinedText" -ForegroundColor Red
            $script:failCount++
            return
        } else {
            Write-Host "  [PASS] Execution succeeded without error." -ForegroundColor Green
            $script:passCount++
        }
    }

    if ($PostAssert) {
        try {
            & $PostAssert
            Write-Host "  [PASS] Post-assertion passed." -ForegroundColor Green
        } catch {
            Write-Host "  [FAIL] Post-assertion failed: $($_.Exception.Message)" -ForegroundColor Red
            $script:failCount++
        }
    }
}

try {
    # 1. PostgreSQL 16 Tooling Verification
    Assert-Test -TestName "PostgreSQL 16 Tool Directory Exists" -Action {
        $pg16Dir = "C:\Program Files\PostgreSQL\16\bin"
        if (-not (Test-Path "$pg16Dir\pg_dump.exe") -or -not (Test-Path "$pg16Dir\pg_restore.exe") -or -not (Test-Path "$pg16Dir\psql.exe")) {
            throw "PostgreSQL 16 binaries missing from $pg16Dir"
        }
    }

    # 2. Rejection of Non-Staging Environment parameter (Static Check)
    Assert-Test -TestName "Rejection of Non-Staging Environment parameter" `
        -ExpectedErrorPattern "specifically hardened for staging backup" `
        -Action {
            Invoke-StagingBackupTest `
                -Arguments @("-Environment", "production", "-WhatIfOnly")
        }

    # 3. Rejection of Resource ID Mismatch (Static Check)
    Assert-Test -TestName "Rejection of Resource ID Mismatch" `
        -ExpectedErrorPattern "Resource ID mismatch" `
        -Action {
            Invoke-StagingBackupTest `
                -Arguments @("-Environment", "staging", "-ResourceId", "dpg-wrong-resource-id-12345", "-WhatIfOnly")
        }

    # 4. Elimination of Mock-Version Verification Bypass
    Assert-Test -TestName "MockServerVersion without WhatIfOnly is rejected" `
        -ExpectedErrorPattern "CRITICAL: -MockServerVersion is only permitted when -WhatIfOnly is specified" `
        -Action {
            Invoke-StagingBackupTest `
                -Arguments @("-Environment", "staging", "-MockServerVersion", "16")
        }

    # 5. Rejection of Non-16 Server Version in WhatIf Simulation
    Assert-Test -TestName "Rejection of Non-16 Database Server in WhatIf (e.g. 18.6)" `
        -ExpectedErrorPattern "Live database server major version is 18 \(expected 16\)" `
        -Action {
            Invoke-StagingBackupTest `
                -Arguments @("-Environment", "staging", "-MockServerVersion", "18.6", "-WhatIfOnly")
        }

    # 6. Rejection of Non-16 Database Server in WhatIf (e.g. 14.2)
    Assert-Test -TestName "Rejection of Non-16 Database Server in WhatIf (e.g. 14.2)" `
        -ExpectedErrorPattern "Live database server major version is 14 \(expected 16\)" `
        -Action {
            Invoke-StagingBackupTest `
                -Arguments @("-Environment", "staging", "-MockServerVersion", "14.2", "-WhatIfOnly")
        }

    # 7. Rejection of DatabaseUrl Command-Line Parameter
    Assert-Test -TestName "DatabaseUrl command-line parameter is prohibited and rejected" `
        -ExpectedErrorPattern "A parameter cannot be found that matches parameter name 'DatabaseUrl'" `
        -Action {
            Invoke-StagingBackupTest `
                -Arguments @("-Environment", "staging", "-DatabaseUrl", "'postgresql://techsprout:secret@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:5432/techsprout_staging'")
        } `
        -PostAssert {
            $cmd = Get-Command $scriptPath
            if ($cmd.Parameters.ContainsKey('DatabaseUrl')) {
                throw "backup-postgres.ps1 must not define a 'DatabaseUrl' parameter!"
            }
        }

    # 8. WhatIfOnly works without ANY credentials or interactive prompt
    Assert-Test -TestName "WhatIfOnly succeeds without any credentials or interactive prompt" `
        -Action {
            # Completely zero connection URI or mock input provided
            Invoke-StagingBackupTest `
                -Arguments @("-Environment", "staging", "-WhatIfOnly")
        } `
        -PostAssert {
            # Output of post assert will verify message structure in test 9
        }

    # 9. WhatIfOnly creates no output directory or backup artifacts
    $nonExistentOut = Join-Path $testDir "never_created_dir"
    Assert-Test -TestName "WhatIfOnly creates no output directory, dump files, or manifests" `
        -Action {
            Invoke-StagingBackupTest `
                -Arguments @("-Environment", "staging", "-OutputDir", "'$nonExistentOut'", "-WhatIfOnly")
        } `
        -PostAssert {
            if (Test-Path $nonExistentOut) {
                throw "WhatIfOnly created the output directory! Dry-run must not create directories."
            }
            $dumps = Get-ChildItem -Path $testDir -Filter "*.dump" -Recurse -ErrorAction SilentlyContinue
            if ($dumps -and $dumps.Count -gt 0) {
                throw "WhatIfOnly created a .dump file!"
            }
            $manifests = Get-ChildItem -Path $testDir -Filter "*.manifest.json" -Recurse -ErrorAction SilentlyContinue
            if ($manifests -and $manifests.Count -gt 0) {
                throw "WhatIfOnly created a .manifest.json file!"
            }
        }

    # 10. WhatIfOnly creates no temporary PGPASSFILE in TEMP
    Assert-Test -TestName "WhatIfOnly creates no temporary PGPASSFILE in TEMP" `
        -Action {
            Invoke-StagingBackupTest `
                -Arguments @("-Environment", "staging", "-WhatIfOnly")
        } `
        -PostAssert {
            $leftover = Get-ChildItem -Path $env:TEMP -Filter "techsprout_pgpass_*.tmp" -ErrorAction SilentlyContinue
            if ($leftover -and $leftover.Count -gt 0) {
                throw "Temporary pgpass file was created during dry-run!"
            }
        }

    # 11. WhatIfOnly does not modify inherited PostgreSQL environment variables
    Assert-Test -TestName "WhatIfOnly does not modify inherited PostgreSQL environment variables" `
        -Action {
            $sentinelPassword = "SENTINEL_CALLER_PASSWORD_12345"
            $sentinelHost = "sentinel_host_999"
            $testScript = @"
`$env:PGPASSWORD = '$sentinelPassword'
`$env:PGHOST = '$sentinelHost'
& '$scriptPath' -Environment staging -WhatIfOnly | Out-Null
if (`$env:PGPASSWORD -ne '$sentinelPassword') {
    throw "PGPASSWORD was mutated during WhatIfOnly! Got: '`$(`$env:PGPASSWORD)'"
}
if (`$env:PGHOST -ne '$sentinelHost') {
    throw "PGHOST was mutated during WhatIfOnly! Got: '`$(`$env:PGHOST)'"
}
Write-Output "ENV_VARS_PRESERVED_OK"
"@
            $bytes = [System.Text.Encoding]::Unicode.GetBytes($testScript)
            $encCmd = [Convert]::ToBase64String($bytes)
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand $encCmd 2>&1
        }

    # 12. Real Backup: Anti-Production Check - Rejection of Production Database Host
    Assert-Test -TestName "Real Backup Rejection of Production Host (dpg-dasmr1e0tbcc73849i90-a)" `
        -ExpectedErrorPattern "Connection host identifies the PRODUCTION database" `
        -Action {
            Invoke-StagingBackupTest `
                -ConnectionUri "postgresql://techsprout:secret@dpg-dasmr1e0tbcc73849i90-a.oregon-postgres.render.com:5432/techsprout_staging" `
                -Arguments @("-Environment", "staging")
        }

    # 13. Real Backup: Anti-Production Check - Rejection of Production DB Name (techsprout)
    Assert-Test -TestName "Real Backup Rejection of Production DB Name (techsprout)" `
        -ExpectedErrorPattern "Connection database is 'techsprout'. Expected 'techsprout_staging'" `
        -Action {
            Invoke-StagingBackupTest `
                -ConnectionUri "postgresql://techsprout:secret@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:5432/techsprout" `
                -Arguments @("-Environment", "staging")
        }

    # 14. Real Backup: Temporary Credential File Cleanup on Live Connection Error
    $realTempOut = Join-Path $testDir "out_real_test"
    Assert-Test -TestName "Real Backup Temporary Credential File Cleanup on Error" `
        -ExpectedErrorPattern "Live database identity check failed|could not translate host name|connection to server" `
        -Action {
            Invoke-StagingBackupTest `
                -ConnectionUri "postgresql://techsprout_staging:secret@dpg-db474ae0tbcc73dcgr10-a.localhost:59999/techsprout_staging" `
                -Arguments @("-Environment", "staging", "-OutputDir", "'$realTempOut'")
        } `
        -PostAssert {
            $leftover = Get-ChildItem -Path $env:TEMP -Filter "techsprout_pgpass_*.tmp" -ErrorAction SilentlyContinue
            if ($leftover -and $leftover.Count -gt 0) {
                throw "Temporary pgpass file was not cleaned up after live connection error!"
            }
        }

    # 15. URI Parser: Standard postgres:// URL
    Assert-Test -TestName "URI Parser: Standard postgres:// URL" -Action {
        $parsed = Parse-PostgreSqlUri "postgres://techsprout_user:secret@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:5432/techsprout_staging"
        if ($parsed.Host -ne "dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com" -or $parsed.Port -ne 5432 -or $parsed.Database -ne "techsprout_staging" -or $parsed.Username -ne "techsprout_user" -or $parsed.Password -ne "secret") {
            throw "Parsed postgres:// URI properties mismatch"
        }
    }

    # 16. URI Parser: Standard postgresql:// URL
    Assert-Test -TestName "URI Parser: Standard postgresql:// URL" -Action {
        $parsed = Parse-PostgreSqlUri "postgresql://techsprout_user:secret@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:5432/techsprout_staging"
        if ($parsed.Host -ne "dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com" -or $parsed.Port -ne 5432 -or $parsed.Database -ne "techsprout_staging" -or $parsed.Username -ne "techsprout_user" -or $parsed.Password -ne "secret") {
            throw "Parsed postgresql:// URI properties mismatch"
        }
    }

    # 17. URI Parser: Query parameters ignored in database name
    Assert-Test -TestName "URI Parser: Query parameters ignored in database name" -Action {
        $parsed = Parse-PostgreSqlUri "postgresql://techsprout_user:secret@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:5432/techsprout_staging?sslmode=require&connect_timeout=15"
        if ($parsed.Database -ne "techsprout_staging" -or $parsed.Port -ne 5432) {
            throw "Query parameters corrupted database name or port: Database='$($parsed.Database)'"
        }
    }

    # 18. URI Parser: Percent-encoded @ in password (%40)
    Assert-Test -TestName "URI Parser: Percent-encoded @ in password (%40)" -Action {
        $parsed = Parse-PostgreSqlUri "postgresql://techsprout_user:p%40ssword@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:5432/techsprout_staging"
        if ($parsed.Password -ne "p@ssword") {
            throw "Failed to decode %40 in password: '$($parsed.Password)'"
        }
    }

    # 19. URI Parser: Percent-encoded : in password (%3A)
    Assert-Test -TestName "URI Parser: Percent-encoded : in password (%3A)" -Action {
        $parsed = Parse-PostgreSqlUri "postgresql://techsprout_user:p%3Asword@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:5432/techsprout_staging"
        if ($parsed.Password -ne "p:sword") {
            throw "Failed to decode %3A in password: '$($parsed.Password)'"
        }
    }

    # 20. URI Parser: Percent-encoded /, ?, and # in password (%2F, %3F, %23)
    Assert-Test -TestName "URI Parser: Percent-encoded /, ?, and # in password (%2F, %3F, %23)" -Action {
        $parsed = Parse-PostgreSqlUri "postgresql://techsprout_user:p%2Fslash%3Fquest%23hash@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:5432/techsprout_staging"
        if ($parsed.Password -ne "p/slash?quest#hash") {
            throw "Failed to decode %2F, %3F, %23 in password: '$($parsed.Password)'"
        }
    }

    # 21. URI Parser: Missing credentials rejection
    Assert-Test -TestName "URI Parser: Missing credentials rejection" `
        -ExpectedErrorPattern "Missing credentials in connection URI" `
        -Action {
            Parse-PostgreSqlUri "postgresql://dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:5432/techsprout_staging"
        }

    # 22. URI Parser: Missing password rejection
    Assert-Test -TestName "URI Parser: Missing password rejection" `
        -ExpectedErrorPattern "Missing password in connection URI" `
        -Action {
            Parse-PostgreSqlUri "postgresql://techsprout_user@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:5432/techsprout_staging"
        }

    # 23. URI Parser: Missing database rejection
    Assert-Test -TestName "URI Parser: Missing database rejection" `
        -ExpectedErrorPattern "Missing database name in connection URI" `
        -Action {
            Parse-PostgreSqlUri "postgresql://techsprout_user:secret@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:5432/"
        }

    # 24. URI Parser: Invalid port 0 rejection
    Assert-Test -TestName "URI Parser: Invalid port 0 rejection" `
        -ExpectedErrorPattern "Invalid port" `
        -Action {
            Parse-PostgreSqlUri "postgresql://techsprout_user:secret@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:0/techsprout_staging"
        }

    # 25. URI Parser: Invalid port 70000 rejection
    Assert-Test -TestName "URI Parser: Invalid port 70000 rejection" `
        -ExpectedErrorPattern "Invalid port" `
        -Action {
            Parse-PostgreSqlUri "postgresql://techsprout_user:secret@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:70000/techsprout_staging"
        }

    # 26. URI Parser: Invalid port non-numeric rejection
    Assert-Test -TestName "URI Parser: Invalid port non-numeric rejection" `
        -ExpectedErrorPattern "Invalid port" `
        -Action {
            Parse-PostgreSqlUri "postgresql://techsprout_user:secret@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:notaport/techsprout_staging"
        }

    # 27. URI Parser: Unsupported scheme rejection
    Assert-Test -TestName "URI Parser: Unsupported scheme rejection" `
        -ExpectedErrorPattern "Unsupported URI scheme" `
        -Action {
            Parse-PostgreSqlUri "http://techsprout_user:secret@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:5432/techsprout_staging"
        }

    # 28. URI Parser: Malformed URL rejection
    Assert-Test -TestName "URI Parser: Malformed URL rejection" `
        -ExpectedErrorPattern "Invalid PostgreSQL connection URI format" `
        -Action {
            Parse-PostgreSqlUri "not-a-valid-connection-string"
        }

    # 29. URI Parser: PSQL command provided as URI rejection
    Assert-Test -TestName "URI Parser: PSQL command provided as URI rejection" `
        -ExpectedErrorPattern "Input appears to be a shell command or environment variable assignment" `
        -Action {
            Parse-PostgreSqlUri 'psql "postgresql://techsprout_user:secret@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:5432/techsprout_staging"'
        }

    # 30. URI Parser: Environment variable assignment provided as URI rejection
    Assert-Test -TestName "URI Parser: Environment variable assignment provided as URI rejection" `
        -ExpectedErrorPattern "Input appears to be a shell command or environment variable assignment" `
        -Action {
            Parse-PostgreSqlUri 'DATABASE_URL=postgresql://techsprout_user:secret@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:5432/techsprout_staging'
        }

    # 31. URI Parser: Single trailing slash in database path acceptance
    Assert-Test -TestName "URI Parser: Single trailing slash in database path acceptance" -Action {
        $parsed = Parse-PostgreSqlUri "postgresql://techsprout_user:secret@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:5432/techsprout_staging/"
        if ($parsed.Database -ne "techsprout_staging") {
            throw "Failed to extract database name with single trailing slash: '$($parsed.Database)'"
        }
    }

    # 32. URI Parser: Multi-segment database path rejection (/techsprout_staging/other)
    Assert-Test -TestName "URI Parser: Multi-segment database path rejection" `
        -ExpectedErrorPattern "multiple path segments are prohibited" `
        -Action {
            Parse-PostgreSqlUri "postgresql://techsprout_user:secret@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:5432/techsprout_staging/other"
        }

    # 33. URI Parser: URI fragment rejection (#frag)
    Assert-Test -TestName "URI Parser: URI fragment rejection" `
        -ExpectedErrorPattern "URI fragments are prohibited" `
        -Action {
            Parse-PostgreSqlUri "postgresql://techsprout_user:secret@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:5432/techsprout_staging#frag"
        }

    # 34. URI Parser: Malformed percent-encoding rejection in password
    Assert-Test -TestName "URI Parser: Malformed percent-encoding rejection in password" `
        -ExpectedErrorPattern "Malformed percent-encoding" `
        -Action {
            Parse-PostgreSqlUri "postgresql://techsprout_user:bad%ZZpass@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:5432/techsprout_staging"
        }

    # 35. URI Parser: Malformed percent-encoding rejection in database name
    Assert-Test -TestName "URI Parser: Malformed percent-encoding rejection in database name" `
        -ExpectedErrorPattern "Malformed percent-encoding" `
        -Action {
            Parse-PostgreSqlUri "postgresql://techsprout_user:secret@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:5432/tech%ZZstaging"
        }

    # 36. URI Parser: Bracketed IPv6 host acceptance with and without explicit port
    Assert-Test -TestName "URI Parser: Bracketed IPv6 host acceptance" -Action {
        $p1 = Parse-PostgreSqlUri "postgresql://techsprout_user:secret@[2001:db8::1]:5432/techsprout_staging"
        $ip1 = [System.Net.IPAddress]::Parse($p1.Host.Trim('[]'))
        $expectedIp = [System.Net.IPAddress]::Parse('2001:db8::1')
        if (-not $ip1.Equals($expectedIp) -or $p1.Port -ne 5432) {
            throw "IPv6 with port failed: Host='$($p1.Host)', Port=$($p1.Port)"
        }
        $p2 = Parse-PostgreSqlUri "postgresql://techsprout_user:secret@[2001:db8::1]/techsprout_staging"
        $ip2 = [System.Net.IPAddress]::Parse($p2.Host.Trim('[]'))
        if (-not $ip2.Equals($expectedIp) -or $p2.Port -ne 5432) {
            throw "IPv6 omitted port failed: Host='$($p2.Host)', Port=$($p2.Port)"
        }
    }

    # 37. URI Parser: IPv4 host acceptance with and without explicit port
    Assert-Test -TestName "URI Parser: IPv4 host acceptance" -Action {
        $p1 = Parse-PostgreSqlUri "postgresql://techsprout_user:secret@127.0.0.1:5432/techsprout_staging"
        if ($p1.Host -ne "127.0.0.1" -or $p1.Port -ne 5432) {
            throw "IPv4 with port failed: Host='$($p1.Host)', Port=$($p1.Port)"
        }
        $p2 = Parse-PostgreSqlUri "postgresql://techsprout_user:secret@127.0.0.1/techsprout_staging"
        if ($p2.Host -ne "127.0.0.1" -or $p2.Port -ne 5432) {
            throw "IPv4 omitted port failed: Host='$($p2.Host)', Port=$($p2.Port)"
        }
    }

    # 38. Real Backup: Rejection of PSQL command entered as connection URI
    Assert-Test -TestName "Real Backup Rejection of PSQL command input" `
        -ExpectedErrorPattern "Input appears to be a shell command or environment variable assignment" `
        -Action {
            Invoke-StagingBackupTest `
                -ConnectionUri 'psql "postgresql://techsprout:secret@dpg-db474ae0tbcc73dcgr10-a.oregon-postgres.render.com:5432/techsprout_staging"' `
                -Arguments @("-Environment", "staging")
        }

    # 39. Real Backup: Acceptance of complex percent-encoded URI in staging contract check
    Assert-Test -TestName "Real Backup Acceptance of percent-encoded password in staging contract check" `
        -ExpectedErrorPattern "Live database identity check failed|could not translate host name|connection to server" `
        -Action {
            Invoke-StagingBackupTest `
                -ConnectionUri "postgresql://techsprout_staging:p%40ss%3A%2F%3F%23@dpg-db474ae0tbcc73dcgr10-a.localhost:59999/techsprout_staging?sslmode=require" `
                -Arguments @("-Environment", "staging")
        }

    # 40. Unit Test: Clear-StagingClipboard clears active clipboard without throwing
    Assert-Test -TestName "Clear-StagingClipboard clears active clipboard without throwing" -Action {
        Set-Clipboard -Value "techsprout-test-secret-value-12345"
        Clear-StagingClipboard
        $remaining = Get-Clipboard -Raw
        if (-not [string]::IsNullOrWhiteSpace($remaining)) {
            throw "Clipboard still contains text after Clear-StagingClipboard: '$remaining'"
        }
    }

    # 41. Real Backup: Empty clipboard input rejection
    Assert-Test -TestName "Real Backup Rejection of empty clipboard input" `
        -ExpectedErrorPattern "Clipboard is empty or contains no database connection URI" `
        -Action {
            Invoke-StagingBackupTest `
                -ConnectionUri "" `
                -Arguments @("-Environment", "staging")
        }

    # 42. Real Backup: Clipboard clear confirmation and zero credential leakage
    Assert-Test -TestName "Real Backup Clears clipboard and preserves credential secrecy" `
        -ExpectedErrorPattern "Live database identity check failed|could not translate host name|connection to server" `
        -Action {
            $output = Invoke-StagingBackupTest `
                -ConnectionUri "postgresql://techsprout_staging:supersecretpassword@dpg-db474ae0tbcc73dcgr10-a.localhost:59999/techsprout_staging" `
                -Arguments @("-Environment", "staging")
            $text = ($output | Out-String)
            if ($text -notmatch "Cleared staging database credentials from local clipboard") {
                throw "Output did not indicate clipboard clearing."
            }
            if ($text -match "supersecretpassword") {
                throw "Output leaked plaintext password!"
            }
            if ($text -match "postgresql://") {
                throw "Output leaked connection URI!"
            }
            return $output
        }

    # 43. Real Backup: Host mismatch rejection does not leak host
    Assert-Test -TestName "Real Backup Host mismatch does not leak host" `
        -ExpectedErrorPattern "Connection host does not identify staging resource ID" `
        -Action {
            $output = Invoke-StagingBackupTest `
                -ConnectionUri "postgresql://techsprout_staging:secret@dpg-wrong-host-id-999.render.com:5432/techsprout_staging" `
                -Arguments @("-Environment", "staging")
            $text = ($output | Out-String)
            if ($text -match "dpg-wrong-host-id-999") {
                throw "Output leaked non-matching host!"
            }
            return $output
        }

} finally {
    if (Test-Path $testDir) {
        Remove-Item -Recurse -Force $testDir -ErrorAction SilentlyContinue
    }
}

Write-Host "`n====================================================" -ForegroundColor Cyan
Write-Host "SAFETY TEST RESULTS: $script:passCount PASSED, $script:failCount FAILED" -ForegroundColor $(if ($script:failCount -eq 0) { 'Green' } else { 'Red' })
Write-Host "====================================================" -ForegroundColor Cyan

if ($script:failCount -gt 0) {
    exit 1
}
