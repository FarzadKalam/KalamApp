param(
  [string]$ConfigFile = '.env.deploy',
  [string]$Pattern = 'database_v1_phase*.sql',
  [string[]]$SqlFiles,
  [int]$BaselinePhase = -1,
  [string]$BaselineFile,
  [switch]$LatestOnly,
  [switch]$ListPending,
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

function Get-RequiredEnv {
  param([string]$Name)

  $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Missing required setting: $Name"
  }

  return $value.Trim()
}

function Get-OptionalEnv {
  param(
    [string]$Name,
    [string]$DefaultValue = ''
  )

  $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $DefaultValue
  }

  return $value.Trim()
}

function Assert-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found in PATH: $Name"
  }
}

function ConvertTo-Bool {
  param(
    [string]$Value,
    [bool]$DefaultValue = $false
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $DefaultValue
  }

  switch ($Value.Trim().ToLowerInvariant()) {
    '1' { return $true }
    'true' { return $true }
    'yes' { return $true }
    'on' { return $true }
    '0' { return $false }
    'false' { return $false }
    'no' { return $false }
    'off' { return $false }
    default { return $DefaultValue }
  }
}

function Should-UseSharedSsh {
  param(
    [string]$ExplicitValue,
    [bool]$DefaultValue = $false
  )

  return ConvertTo-Bool -Value $ExplicitValue -DefaultValue $DefaultValue
}

function Quote-Single {
  param([string]$Value)
  return "'" + ($Value -replace "'", "''") + "'"
}

function Quote-ForShell {
  param([string]$Value)
  return "'" + $Value.Replace("'", "'""'""'") + "'"
}

function Validate-SqlIdentifierPath {
  param([string]$Value)

  if ($Value -notmatch '^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$') {
    throw "Invalid SQL identifier path: $Value"
  }

  return $Value
}

function Resolve-MigrationFiles {
  param(
    [string]$RepoRoot,
    [string]$SqlPattern,
    [string[]]$ExplicitFiles
  )

  $items = @()
  if ($ExplicitFiles -and $ExplicitFiles.Count -gt 0) {
    foreach ($item in $ExplicitFiles) {
      $resolvedPath = $item
      if (-not [System.IO.Path]::IsPathRooted($resolvedPath)) {
        $resolvedPath = Join-Path $RepoRoot $resolvedPath
      }

      $resolvedPath = [System.IO.Path]::GetFullPath($resolvedPath)
      if (-not (Test-Path -LiteralPath $resolvedPath)) {
        throw "SQL file not found: $resolvedPath"
      }

      $items += Get-Item -LiteralPath $resolvedPath
    }
  } else {
    $items = Get-ChildItem -LiteralPath $RepoRoot -File -Filter $SqlPattern | Sort-Object Name
  }

  return $items |
    Sort-Object @{
      Expression = {
        $match = [regex]::Match($_.Name, 'phase(\d+)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        if ($match.Success) { [int]$match.Groups[1].Value } else { [int]::MaxValue }
      }
    }, @{
      Expression = { $_.Name.ToLowerInvariant() }
    } |
    ForEach-Object {
      $hash = Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256
      [pscustomobject]@{
        Name = $_.Name
        FullName = $_.FullName
        Hash = $hash.Hash.ToLowerInvariant()
      }
    }
}

function Get-MigrationPhase {
  param([string]$Name)

  $match = [regex]::Match($Name, 'phase(\d+)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($match.Success) {
    return [int]$match.Groups[1].Value
  }

  return [int]::MaxValue
}

function Build-RemotePsqlCommand {
  param(
    [string]$DockerPrefix,
    [string]$DbContainer,
    [string]$DbUser,
    [string]$DbName,
    [string]$Sql
  )

  return (
    $DockerPrefix,
    'exec',
    '-i',
    (Quote-ForShell -Value $DbContainer),
    'psql',
    '-U',
    (Quote-ForShell -Value $DbUser),
    '-d',
    (Quote-ForShell -Value $DbName),
    '-v',
    'ON_ERROR_STOP=1',
    '-At',
    '-c',
    (Quote-ForShell -Value $Sql)
  ) -join ' '
}

function Build-RemotePsqlFileCommand {
  param(
    [string]$DockerPrefix,
    [string]$DbContainer,
    [string]$DbUser,
    [string]$DbName,
    [string]$RemoteFilePath
  )

  return (
    $DockerPrefix,
    'exec',
    '-i',
    (Quote-ForShell -Value $DbContainer),
    'psql',
    '-U',
    (Quote-ForShell -Value $DbUser),
    '-d',
    (Quote-ForShell -Value $DbName),
    '-v',
    'ON_ERROR_STOP=1',
    '<',
    (Quote-ForShell -Value $RemoteFilePath)
  ) -join ' '
}

function New-SshSessionOptions {
  param(
    [string]$DeployPort,
    [string]$DeployHost,
    [string]$RepoRoot
  )

  $controlDir = Join-Path $RepoRoot '.ssh-control'
  New-Item -ItemType Directory -Path $controlDir -Force | Out-Null
  $controlPath = [System.IO.Path]::GetFullPath((Join-Path $controlDir ("kalamapp-ssh-{0}-{1}" -f $DeployHost, $DeployPort)))
  return [pscustomobject]@{
    SshArgs = @(
      '-p', $DeployPort,
      '-o', 'ControlMaster=auto',
      '-o', 'ControlPersist=600',
      '-o', "ControlPath=$controlPath"
    )
    ScpArgs = @(
      '-P', $DeployPort,
      '-o', 'ControlMaster=auto',
      '-o', 'ControlPersist=600',
      '-o', "ControlPath=$controlPath"
    )
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$tempUploadDir = $null
$sshCommonArgs = $null
$scpCommonArgs = $null
$target = $null
$sharedSessionOpened = $false
$remoteDir = $null
$deployPort = '22'

Push-Location $repoRoot
try {
  Load-EnvFile -Path (Join-Path $repoRoot $ConfigFile)

  Assert-Command -Name 'ssh'
  Assert-Command -Name 'scp'

  $deployHost = Get-RequiredEnv -Name 'DEPLOY_HOST'
  $deployPort = Get-OptionalEnv -Name 'DEPLOY_PORT' -DefaultValue '22'
  $deployUser = Get-OptionalEnv -Name 'DB_MIGRATE_SSH_USER' -DefaultValue (Get-RequiredEnv -Name 'DEPLOY_USER')
  $remoteBaseDir = Get-OptionalEnv -Name 'DB_MIGRATE_REMOTE_DIR' -DefaultValue '/tmp/kalamapp-db-migrations'
  $dbContainer = Get-OptionalEnv -Name 'DB_MIGRATE_CONTAINER' -DefaultValue 'supabase-db'
  $dbName = Get-OptionalEnv -Name 'DB_MIGRATE_DATABASE' -DefaultValue 'postgres'
  $dbUser = Get-OptionalEnv -Name 'DB_MIGRATE_DB_USER' -DefaultValue 'supabase_admin'
  $historyTable = Validate-SqlIdentifierPath (Get-OptionalEnv -Name 'DB_MIGRATE_HISTORY_TABLE' -DefaultValue 'public.app_schema_migrations')
  $useSudo = ConvertTo-Bool -Value (Get-OptionalEnv -Name 'DB_MIGRATE_USE_SUDO' -DefaultValue 'false')
  $useSharedSsh = Should-UseSharedSsh -ExplicitValue (Get-OptionalEnv -Name 'DEPLOY_USE_SHARED_SSH') -DefaultValue $false
  if ($BaselinePhase -lt 0) {
    $baselinePhaseFromEnv = Get-OptionalEnv -Name 'DB_MIGRATE_BASELINE_PHASE'
    if (-not [string]::IsNullOrWhiteSpace($baselinePhaseFromEnv)) {
      $parsedBaselinePhase = 0
      if (-not [int]::TryParse($baselinePhaseFromEnv, [ref]$parsedBaselinePhase)) {
        throw "Invalid DB_MIGRATE_BASELINE_PHASE value: $baselinePhaseFromEnv"
      }
      $BaselinePhase = $parsedBaselinePhase
    }
  }
  if ([string]::IsNullOrWhiteSpace($BaselineFile)) {
    $BaselineFile = Get-OptionalEnv -Name 'DB_MIGRATE_BASELINE_FILE'
  }
  $target = "{0}@{1}" -f $deployUser, $deployHost
  $dockerPrefix = if ($useSudo) { 'sudo docker' } else { 'docker' }
  $sshCommonArgs = @('-p', $deployPort)
  $scpCommonArgs = @('-P', $deployPort)
  if ($useSharedSsh) {
    $sessionOptions = New-SshSessionOptions -DeployPort $deployPort -DeployHost $deployHost -RepoRoot $repoRoot
    $sshCommonArgs = $sessionOptions.SshArgs
    $scpCommonArgs = $sessionOptions.ScpArgs
  }

  $migrationFiles = Resolve-MigrationFiles -RepoRoot $repoRoot -SqlPattern $Pattern -ExplicitFiles $SqlFiles
  if (-not $migrationFiles -or $migrationFiles.Count -eq 0) {
    throw "No migration files found for pattern: $Pattern"
  }

  if ($DryRun) {
    $previewFiles = $migrationFiles
    if ($LatestOnly -and $previewFiles.Count -gt 1) {
      $previewFiles = @($previewFiles[-1])
    }

    Write-Host 'Dry run only. Local migration candidates:' -ForegroundColor Yellow
    Write-Host "Target: $target"
    Write-Host "Remote base dir: $remoteBaseDir"
    Write-Host "Container: $dbContainer"
    Write-Host "Database: $dbName"
    Write-Host "User: $dbUser"
    Write-Host ('Files: ' + ($previewFiles.Name -join ', '))
    exit 0
  }

  if ($useSharedSsh) {
    Write-Step "Opening shared SSH session to $target"
    & ssh @sshCommonArgs -Nf $target
    if ($LASTEXITCODE -eq 0) {
      $sharedSessionOpened = $true
    } else {
      Write-Warning 'Shared SSH session is not available on this client. Falling back to direct ssh/scp calls.'
      $sshCommonArgs = @('-p', $deployPort)
      $scpCommonArgs = @('-P', $deployPort)
    }
  }

  $ensureHistorySql = @"
create table if not exists $historyTable (
  filename text primary key,
  file_hash text,
  applied_at timestamptz not null default now(),
  applied_by text not null default current_user
);
"@
  $ensureHistorySqlInline = $ensureHistorySql -replace "`r", ' ' -replace "`n", ' '
  $ensureHistoryCommand = Build-RemotePsqlCommand -DockerPrefix $dockerPrefix -DbContainer $dbContainer -DbUser $dbUser -DbName $dbName -Sql $ensureHistorySqlInline

  Write-Step "Preparing remote migration history table on $target"
  & ssh @sshCommonArgs $target $ensureHistoryCommand
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not prepare remote migration history table.'
  }

  $appliedQuery = "select filename from $historyTable order by filename;"
  $appliedCommand = Build-RemotePsqlCommand -DockerPrefix $dockerPrefix -DbContainer $dbContainer -DbUser $dbUser -DbName $dbName -Sql $appliedQuery
  $appliedNamesRaw = & ssh @sshCommonArgs $target $appliedCommand
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not read applied migration history.'
  }

  $appliedNames = @{}
  foreach ($line in ($appliedNamesRaw | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })) {
    $appliedNames[$line.Trim()] = $true
  }

  if ($appliedNames.Count -eq 0 -and ($BaselinePhase -ge 0 -or -not [string]::IsNullOrWhiteSpace($BaselineFile))) {
    $baselineFiles = @()

    if ($BaselinePhase -ge 0) {
      $baselineFiles = @($migrationFiles | Where-Object { (Get-MigrationPhase -Name $_.Name) -le $BaselinePhase })
    } elseif (-not [string]::IsNullOrWhiteSpace($BaselineFile)) {
      $baselineIndex = -1
      for ($i = 0; $i -lt $migrationFiles.Count; $i++) {
        if ($migrationFiles[$i].Name -eq $BaselineFile) {
          $baselineIndex = $i
          break
        }
      }

      if ($baselineIndex -lt 0) {
        throw "Baseline file not found in migration set: $BaselineFile"
      }

      $baselineFiles = @($migrationFiles[0..$baselineIndex])
    }

    if ($baselineFiles.Count -gt 0) {
      Write-Step ("Using baseline migration set:`n - " + ($baselineFiles.Name -join "`n - "))

      if (-not $ListPending) {
        $rows = foreach ($file in $baselineFiles) {
          "('{0}', '{1}')" -f (($file.Name -replace "'", "''")), (($file.Hash -replace "'", "''"))
        }
        $baselineSql = @"
insert into $historyTable (filename, file_hash)
values
  $($rows -join ",`n  ")
on conflict (filename) do update
set file_hash = excluded.file_hash,
    applied_at = now(),
    applied_by = current_user;
"@
        $baselineSqlInline = $baselineSql -replace "`r", ' ' -replace "`n", ' '
        $baselineCommand = Build-RemotePsqlCommand -DockerPrefix $dockerPrefix -DbContainer $dbContainer -DbUser $dbUser -DbName $dbName -Sql $baselineSqlInline

        Write-Step 'Bootstrapping migration history table on server'
        & ssh @sshCommonArgs $target $baselineCommand
        if ($LASTEXITCODE -ne 0) {
          throw 'Could not bootstrap migration history.'
        }
      }

      foreach ($file in $baselineFiles) {
        $appliedNames[$file.Name] = $true
      }
    }
  }

  $pendingFiles = @($migrationFiles | Where-Object { -not $appliedNames.ContainsKey($_.Name) })
  if ($LatestOnly -and $pendingFiles.Count -gt 1) {
    $pendingFiles = @($pendingFiles[-1])
  }

  if ($pendingFiles.Count -eq 0) {
    Write-Step 'No pending migrations found'
    exit 0
  }

  Write-Step ("Pending migrations:`n - " + ($pendingFiles.Name -join "`n - "))
  if ($ListPending) {
    exit 0
  }

  $remoteBatchId = [Guid]::NewGuid().ToString('N')
  $remoteDir = ($remoteBaseDir.TrimEnd('/')) + "/$remoteBatchId"

  Write-Step "Creating local staging directory for upload"
  $tempUploadDir = Join-Path ([System.IO.Path]::GetTempPath()) ("kalamapp-db-migrations-" + $remoteBatchId)
  New-Item -ItemType Directory -Path $tempUploadDir -Force | Out-Null

  foreach ($file in $pendingFiles) {
    Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $tempUploadDir $file.Name) -Force
  }

  Write-Step "Creating remote staging directory $remoteDir"
  & ssh @sshCommonArgs $target "mkdir -p '$remoteDir'"
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not create remote staging directory.'
  }

  Write-Step "Uploading pending migrations to $target"
  & scp @scpCommonArgs (Join-Path $tempUploadDir '*.sql') "$target`:$remoteDir/"
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not upload migration files.'
  }

  Write-Step 'Executing pending migrations on server'
  foreach ($file in $pendingFiles) {
    $remoteFilePath = "$remoteDir/$($file.Name)"
    Write-Host "==> Applying $($file.Name)"

    $applyCommand = Build-RemotePsqlFileCommand -DockerPrefix $dockerPrefix -DbContainer $dbContainer -DbUser $dbUser -DbName $dbName -RemoteFilePath $remoteFilePath
    & ssh @sshCommonArgs $target $applyCommand
    if ($LASTEXITCODE -ne 0) {
      throw "Remote migration apply failed: $($file.Name)"
    }

    $historySqlInline = (
      "insert into $historyTable (filename, file_hash) " +
      "values (`$history_filename$" + $file.Name + "`$history_filename$, `$history_hash$" + $file.Hash + "`$history_hash$) " +
      "on conflict (filename) do update " +
      "set file_hash = excluded.file_hash, applied_at = now(), applied_by = current_user;"
    )
    $historyCommand = Build-RemotePsqlCommand -DockerPrefix $dockerPrefix -DbContainer $dbContainer -DbUser $dbUser -DbName $dbName -Sql $historySqlInline
    & ssh @sshCommonArgs $target $historyCommand
    if ($LASTEXITCODE -ne 0) {
      throw "Remote migration history update failed: $($file.Name)"
    }
  }

  Write-Step 'Remote migrations completed successfully'
}
finally {
  if ($sharedSessionOpened -and $sshCommonArgs -and $target) {
    & ssh @sshCommonArgs -O exit $target 2>$null | Out-Null
  }

  Pop-Location

  if ($tempUploadDir -and (Test-Path -LiteralPath $tempUploadDir)) {
    Remove-Item -LiteralPath $tempUploadDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
