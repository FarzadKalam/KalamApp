param(
  [string]$SqlFile,
  [string]$Sql,
  [string]$ConfigFile = '.env.db',
  [string]$ConnectionString,
  [switch]$SingleTransaction,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step {
  param([string]$Message)
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Load-EnvFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  foreach ($rawLine in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith('#')) {
      continue
    }

    $separatorIndex = $line.IndexOf('=')
    if ($separatorIndex -lt 1) {
      continue
    }

    $name = $line.Substring(0, $separatorIndex).Trim()
    $value = $line.Substring($separatorIndex + 1)

    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

function Assert-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found in PATH: $Name"
  }
}

function Resolve-PsqlCommand {
  $direct = Get-Command 'psql' -ErrorAction SilentlyContinue
  if ($direct) {
    return $direct.Source
  }

  $roots = @(
    'C:\Program Files\PostgreSQL',
    'C:\Program Files (x86)\PostgreSQL',
    'D:\Program Files\PostgreSQL',
    'D:\Program Files (x86)\PostgreSQL'
  ) | Where-Object { Test-Path $_ }

  $candidates = foreach ($root in $roots) {
    Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending |
      ForEach-Object {
        $psqlPath = Join-Path $_.FullName 'bin\psql.exe'
        if (Test-Path -LiteralPath $psqlPath) {
          $psqlPath
        }
      }
  }

  $resolved = $candidates | Select-Object -First 1
  if (-not [string]::IsNullOrWhiteSpace($resolved)) {
    return $resolved
  }

  throw 'Required command not found in PATH: psql'
}

function Resolve-ConnectionString {
  param([string]$ExplicitValue)

  if (-not [string]::IsNullOrWhiteSpace($ExplicitValue)) {
    return $ExplicitValue.Trim()
  }

  $candidates = @(
    'DATABASE_URL',
    'SUPABASE_DB_URL',
    'POSTGRES_URL',
    'PGURI'
  )

  foreach ($name in $candidates) {
    $value = [Environment]::GetEnvironmentVariable($name, 'Process')
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value.Trim()
    }
  }

  $pgHost = [Environment]::GetEnvironmentVariable('POSTGRES_HOST', 'Process')
  $pgPort = [Environment]::GetEnvironmentVariable('POSTGRES_PORT', 'Process')
  $pgDb = [Environment]::GetEnvironmentVariable('POSTGRES_DB', 'Process')
  $pgPassword = [Environment]::GetEnvironmentVariable('POSTGRES_PASSWORD', 'Process')
  $pgUser = [Environment]::GetEnvironmentVariable('POSTGRES_USER', 'Process')
  if ([string]::IsNullOrWhiteSpace($pgUser)) {
    $pgUser = 'postgres'
  }

  if (
    -not [string]::IsNullOrWhiteSpace($pgHost) -and
    -not [string]::IsNullOrWhiteSpace($pgPort) -and
    -not [string]::IsNullOrWhiteSpace($pgDb) -and
    -not [string]::IsNullOrWhiteSpace($pgPassword)
  ) {
    $escapedUser = [Uri]::EscapeDataString($pgUser.Trim())
    $escapedPassword = [Uri]::EscapeDataString($pgPassword.Trim())
    return "postgresql://${escapedUser}:${escapedPassword}@${($pgHost.Trim())}:${($pgPort.Trim())}/${($pgDb.Trim())}"
  }

  throw "Database connection string not found. Set -ConnectionString or one of: $($candidates -join ', ') or define POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_PASSWORD, and optionally POSTGRES_USER."
}

function Resolve-SqlInput {
  param(
    [string]$SqlFilePath,
    [string]$InlineSql,
    [string]$RepoRoot
  )

  $hasFile = -not [string]::IsNullOrWhiteSpace($SqlFilePath)
  $hasInline = -not [string]::IsNullOrWhiteSpace($InlineSql)

  if ($hasFile -and $hasInline) {
    throw 'Specify either -SqlFile or -Sql, not both.'
  }

  if (-not $hasFile -and -not $hasInline) {
    throw 'You must provide -SqlFile or -Sql.'
  }

  if ($hasInline) {
    return @{
      Mode = 'inline'
      Value = $InlineSql
      Display = '[inline sql]'
    }
  }

  $resolvedPath = $SqlFilePath
  if (-not [System.IO.Path]::IsPathRooted($resolvedPath)) {
    $resolvedPath = Join-Path $RepoRoot $resolvedPath
  }

  $resolvedPath = [System.IO.Path]::GetFullPath($resolvedPath)
  if (-not (Test-Path -LiteralPath $resolvedPath)) {
    throw "SQL file not found: $resolvedPath"
  }

  return @{
    Mode = 'file'
    Value = $resolvedPath
    Display = $resolvedPath
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot

Push-Location $repoRoot
try {
  Load-EnvFile -Path (Join-Path $repoRoot $ConfigFile)

  $resolvedConnectionString = Resolve-ConnectionString -ExplicitValue $ConnectionString
  $sqlInput = Resolve-SqlInput -SqlFilePath $SqlFile -InlineSql $Sql -RepoRoot $repoRoot

  $maskedConnection = $resolvedConnectionString -replace '://([^:@/]+):([^@/]+)@', '://$1:***@'
  Write-Step "Database target: $maskedConnection"
  Write-Step "SQL source: $($sqlInput.Display)"

  $psqlArgs = @(
    $resolvedConnectionString,
    '-v', 'ON_ERROR_STOP=1',
    '--echo-errors'
  )

  if ($SingleTransaction) {
    $psqlArgs += '-1'
  }

  if ($sqlInput.Mode -eq 'file') {
    $psqlArgs += @('-f', $sqlInput.Value)
  } else {
    $psqlArgs += @('-c', $sqlInput.Value)
  }

  if ($DryRun) {
    Write-Host 'Dry run only. Command preview:' -ForegroundColor Yellow
    Write-Host ('psql ' + ($psqlArgs | ForEach-Object {
      if ($_ -match '\s') { '"' + $_ + '"' } else { $_ }
    }) -join ' ')
    exit 0
  }

  $psqlCommand = Resolve-PsqlCommand

  $env:PGCLIENTENCODING = 'UTF8'
  Write-Step 'Executing SQL'
  & $psqlCommand @psqlArgs
  if ($LASTEXITCODE -ne 0) {
    throw "psql exited with code $LASTEXITCODE"
  }

  Write-Step 'SQL execution completed successfully'
}
finally {
  Pop-Location
}
