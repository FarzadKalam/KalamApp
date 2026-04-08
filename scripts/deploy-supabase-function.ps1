param(
  [Alias('Function')]
  [string[]]$Functions,
  [switch]$All,
  [switch]$List,
  [switch]$SkipRestart,
  [string]$ConfigFile = '.env.deploy'
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

  foreach ($rawLine in Get-Content -LiteralPath $Path) {
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

function Get-OptionalBoolEnv {
  param(
    [string]$Name,
    [bool]$DefaultValue = $false
  )

  $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $DefaultValue
  }

  switch ($value.Trim().ToLowerInvariant()) {
    '1' { return $true }
    'true' { return $true }
    'yes' { return $true }
    'y' { return $true }
    'on' { return $true }
    '0' { return $false }
    'false' { return $false }
    'no' { return $false }
    'n' { return $false }
    'off' { return $false }
    default { throw "Invalid boolean value for ${Name}: $value" }
  }
}

function Assert-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found in PATH: $Name"
  }
}

function Get-LocalFunctionNames {
  param([string]$FunctionsRoot)

  if (-not (Test-Path -LiteralPath $FunctionsRoot)) {
    throw "Local functions directory was not found: $FunctionsRoot"
  }

  return @(Get-ChildItem -LiteralPath $FunctionsRoot -Directory | Select-Object -ExpandProperty Name | Sort-Object)
}

function Normalize-RequestedFunctions {
  param(
    [string[]]$RequestedFunctions,
    [string[]]$AvailableFunctions,
    [switch]$DeployAll
  )

  if ($DeployAll) {
    return @($AvailableFunctions)
  }

  $normalized = @()
  foreach ($entry in ($RequestedFunctions | Where-Object { $_ -ne $null })) {
    foreach ($piece in ($entry -split ',')) {
      $name = $piece.Trim()
      if ($name) {
        $normalized += $name
      }
    }
  }

  $normalized = @($normalized | Select-Object -Unique)
  if (-not $normalized.Count) {
    throw 'No function names were provided. Use -Function taxpayer_system or -All.'
  }

  foreach ($name in $normalized) {
    if ($name -notmatch '^[A-Za-z0-9_-]+$') {
      throw "Invalid function name: $name"
    }
    if ($AvailableFunctions -notcontains $name) {
      throw "Function not found locally: $name"
    }
  }

  return $normalized
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$functionsRoot = Join-Path $repoRoot 'supabase/functions'
$localArchive = $null

Push-Location $repoRoot
try {
  $availableFunctions = Get-LocalFunctionNames -FunctionsRoot $functionsRoot

  if ($List) {
    if (-not $availableFunctions.Count) {
      Write-Host 'No local Supabase functions were found.'
      exit 0
    }

    Write-Host 'Local Supabase functions:' -ForegroundColor Yellow
    $availableFunctions | ForEach-Object { Write-Host "- $_" }
    exit 0
  }

  $selectedFunctions = Normalize-RequestedFunctions -RequestedFunctions $Functions -AvailableFunctions $availableFunctions -DeployAll:$All

  Load-EnvFile -Path (Join-Path $repoRoot $ConfigFile)

  Assert-Command -Name 'ssh'
  Assert-Command -Name 'scp'
  Assert-Command -Name 'tar'

  $deployHost = Get-RequiredEnv -Name 'DEPLOY_HOST'
  $deployPort = Get-OptionalEnv -Name 'DEPLOY_PORT' -DefaultValue '22'
  $deployUser = Get-RequiredEnv -Name 'DEPLOY_USER'
  $functionsPath = Get-RequiredEnv -Name 'DEPLOY_FUNCTIONS_PATH'
  $composeDir = Get-OptionalEnv -Name 'DEPLOY_FUNCTIONS_COMPOSE_DIR'
  $composeFile = Get-OptionalEnv -Name 'DEPLOY_FUNCTIONS_COMPOSE_FILE' -DefaultValue 'docker-compose.yml'
  $functionsService = Get-OptionalEnv -Name 'DEPLOY_FUNCTIONS_SERVICE' -DefaultValue 'functions'
  $archiveName = Get-OptionalEnv -Name 'DEPLOY_FUNCTIONS_ARCHIVE_NAME' -DefaultValue 'kalamapp-supabase-functions.tar.gz'
  $filesWithSudo = Get-OptionalBoolEnv -Name 'DEPLOY_FUNCTIONS_FILES_WITH_SUDO' -DefaultValue $false
  $restartWithSudo = Get-OptionalBoolEnv -Name 'DEPLOY_FUNCTIONS_RESTART_WITH_SUDO' -DefaultValue $false
  $shouldRestart = -not $SkipRestart
  $needsTty = $filesWithSudo -or $restartWithSudo

  $localArchive = Join-Path ([System.IO.Path]::GetTempPath()) $archiveName
  if (Test-Path -LiteralPath $localArchive) {
    Remove-Item -LiteralPath $localArchive -Force
  }

  Write-Step "Packing functions: $($selectedFunctions -join ', ')"
  & tar -czf $localArchive -C $functionsRoot @selectedFunctions
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not create function deploy archive.'
  }

  $target = '{0}@{1}' -f $deployUser, $deployHost
  $remoteArchive = "/tmp/$archiveName"

  Write-Step "Uploading archive to $target"
  & scp -P $deployPort $localArchive "$target`:$remoteArchive"
  if ($LASTEXITCODE -ne 0) {
    throw 'Upload failed.'
  }

  $remoteScript = @'
set -euo pipefail

FUNCTIONS_PATH="$1"
ARCHIVE="$2"
COMPOSE_DIR="$3"
COMPOSE_FILE="$4"
FUNCTIONS_SERVICE="$5"
FILES_WITH_SUDO="$6"
SHOULD_RESTART="$7"
RESTART_WITH_SUDO="$8"
shift 8
FUNCTION_NAMES=("$@")

if [ "${#FUNCTION_NAMES[@]}" -eq 0 ]; then
  echo "No function names were provided." >&2
  exit 1
fi

STAGING_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$STAGING_DIR" "$ARCHIVE"
}
trap cleanup EXIT

run_files_cmd() {
  if [ "$FILES_WITH_SUDO" = "1" ]; then
    sudo "$@"
  else
    "$@"
  fi
}

run_files_cmd mkdir -p "$FUNCTIONS_PATH"
tar -xzf "$ARCHIVE" -C "$STAGING_DIR"

for function_name in "${FUNCTION_NAMES[@]}"; do
  if [ ! -d "$STAGING_DIR/$function_name" ]; then
    echo "Function folder is missing in archive: $function_name" >&2
    exit 1
  fi

  run_files_cmd rm -rf "$FUNCTIONS_PATH/$function_name"
  run_files_cmd mkdir -p "$FUNCTIONS_PATH/$function_name"
  run_files_cmd cp -a "$STAGING_DIR/$function_name/." "$FUNCTIONS_PATH/$function_name/"
done

if [ "$SHOULD_RESTART" = "1" ]; then
  if [ -z "$COMPOSE_DIR" ]; then
    echo "Functions copied. Restart skipped because DEPLOY_FUNCTIONS_COMPOSE_DIR is empty."
  else
    if [ ! -d "$COMPOSE_DIR" ]; then
      echo "Compose directory was not found: $COMPOSE_DIR" >&2
      exit 1
    fi

    cd "$COMPOSE_DIR"

    if [ "$RESTART_WITH_SUDO" = "1" ]; then
      sudo docker compose -f "$COMPOSE_FILE" up -d --force-recreate "$FUNCTIONS_SERVICE"
    else
      docker compose -f "$COMPOSE_FILE" up -d --force-recreate "$FUNCTIONS_SERVICE"
    fi
  fi
fi

echo "Deployed functions: ${FUNCTION_NAMES[*]}"
'@

  $sshArgs = @(
    '-p',
    $deployPort
  )
  if ($needsTty) {
    $sshArgs += '-tt'
  }
  $sshArgs += @(
    $target,
    'bash',
    '-s',
    '--',
    $functionsPath,
    $remoteArchive,
    $composeDir,
    $composeFile,
    $functionsService,
    $(if ($filesWithSudo) { '1' } else { '0' }),
    $(if ($shouldRestart) { '1' } else { '0' }),
    $(if ($restartWithSudo) { '1' } else { '0' })
  ) + $selectedFunctions

  Write-Step 'Copying functions on server'
  $remoteScriptLf = $remoteScript -replace "`r", ''
  $remoteScriptLf | & ssh @sshArgs
  if ($LASTEXITCODE -ne 0) {
    throw 'Remote function deploy failed.'
  }

  Write-Step 'Supabase function deploy completed successfully'
}
finally {
  Pop-Location

  if ($localArchive -and (Test-Path -LiteralPath $localArchive)) {
    Remove-Item -LiteralPath $localArchive -Force -ErrorAction SilentlyContinue
  }
}
