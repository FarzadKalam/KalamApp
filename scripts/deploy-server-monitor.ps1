param(
  [switch]$SkipRemoteCheck,
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

function Resolve-SshKeyPath {
  param(
    [string]$ConfiguredPath,
    [string]$RepoRoot
  )

  if ([string]::IsNullOrWhiteSpace($ConfiguredPath)) {
    return ''
  }

  $candidate = $ConfiguredPath.Trim()
  if (-not [System.IO.Path]::IsPathRooted($candidate)) {
    $candidate = Join-Path $RepoRoot $candidate
  }

  $resolved = [System.IO.Path]::GetFullPath($candidate)
  if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
    throw "DEPLOY_SSH_KEY_PATH was not found: $resolved"
  }

  return $resolved
}

function Assert-RemoteAbsolutePath {
  param(
    [string]$Name,
    [string]$Value
  )

  if ($Value -notmatch '^/[A-Za-z0-9._/-]+$') {
    throw "Invalid $Name. Use an absolute Linux path containing only letters, numbers, dot, underscore, slash, or dash."
  }
}

function ConvertTo-RemoteArgument {
  param([string]$Value)

  return [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Value))
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$target = $null
$sshArgs = $null
$uploadedScript = $null

Push-Location $repoRoot
try {
  Load-EnvFile -Path (Join-Path $repoRoot $ConfigFile)

  Assert-Command -Name 'ssh'
  Assert-Command -Name 'scp'

  $deployHost = Get-RequiredEnv -Name 'DEPLOY_HOST'
  $deployPort = Get-OptionalEnv -Name 'DEPLOY_PORT' -DefaultValue '22'
  $deployUser = Get-OptionalEnv -Name 'MONITOR_DEPLOY_SSH_USER' -DefaultValue (Get-RequiredEnv -Name 'DEPLOY_USER')
  $sshKeyPath = Resolve-SshKeyPath -ConfiguredPath (Get-OptionalEnv -Name 'DEPLOY_SSH_KEY_PATH') -RepoRoot $repoRoot
  # نصب watchdog و cron در مسیرهای root-owned انجام می‌شود. کاربر غیر-root
  # بدون sudo هرگز نمی‌تواند این دیپلوی را کامل کند؛ حتی اگر متغیر محیطی قدیمی
  # مقدار false داشته باشد، آن را به false برنمی‌گردانیم.
  $configuredUseSudo = Get-OptionalBoolEnv -Name 'MONITOR_DEPLOY_USE_SUDO' -DefaultValue ($deployUser -ne 'root')
  $useSudo = $configuredUseSudo -or ($deployUser -ne 'root')
  $remoteScriptPath = Get-OptionalEnv -Name 'MONITOR_DEPLOY_REMOTE_SCRIPT' -DefaultValue '/usr/local/sbin/kalamapp-health-watchdog'
  $remoteConfigPath = Get-OptionalEnv -Name 'MONITOR_DEPLOY_REMOTE_CONFIG' -DefaultValue '/etc/kalamapp-monitor.env'
  $remoteCronPath = Get-OptionalEnv -Name 'MONITOR_DEPLOY_CRON_FILE' -DefaultValue '/etc/cron.d/kalamapp-health-watchdog'
  $cronSchedule = Get-OptionalEnv -Name 'MONITOR_DEPLOY_CRON_SCHEDULE' -DefaultValue '* * * * *'
  $localScriptPath = Join-Path $repoRoot 'scripts/server-health-watchdog.sh'

  if (-not (Test-Path -LiteralPath $localScriptPath -PathType Leaf)) {
    throw "Local watchdog script was not found: $localScriptPath"
  }
  Assert-RemoteAbsolutePath -Name 'MONITOR_DEPLOY_REMOTE_SCRIPT' -Value $remoteScriptPath
  Assert-RemoteAbsolutePath -Name 'MONITOR_DEPLOY_REMOTE_CONFIG' -Value $remoteConfigPath
  Assert-RemoteAbsolutePath -Name 'MONITOR_DEPLOY_CRON_FILE' -Value $remoteCronPath
  if ($cronSchedule -notmatch '^[0-9*/, -]+$') {
    throw 'MONITOR_DEPLOY_CRON_SCHEDULE may only contain cron numbers, spaces, commas, slashes, and dashes.'
  }

  $target = '{0}@{1}' -f $deployUser, $deployHost
  $identityArgs = @()
  if (-not [string]::IsNullOrWhiteSpace($sshKeyPath)) {
    $identityArgs = @('-i', $sshKeyPath)
  }
  # انتقال یا اجرای SSH نباید اجرای انتشار را برای مدت نامحدود معطل کند.
  $networkTimeoutArgs = @(
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=20',
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=2'
  )
  $sshArgs = @('-p', $deployPort) + $identityArgs + $networkTimeoutArgs
  $scpArgs = @('-P', $deployPort) + $identityArgs + $networkTimeoutArgs
  if ($useSudo) {
    $sshArgs += '-tt'
  } else {
    $sshArgs += '-T'
  }
  $uploadedScript = '/tmp/kalamapp-health-watchdog.deploy.sh'

  Write-Step ("Remote privilege mode: " + $(if ($useSudo) { 'sudo' } else { 'root' }))
  Write-Step "Uploading watchdog to $target"
  & scp @scpArgs $localScriptPath "$target`:$uploadedScript"
  if ($LASTEXITCODE -ne 0) {
    throw 'Watchdog upload failed.'
  }

  $remoteScript = @'
set -Eeuo pipefail

decode_argument() {
  printf '%s' "$1" | base64 --decode
}

UPLOADED_SCRIPT="$(decode_argument "$1")"
REMOTE_SCRIPT="$(decode_argument "$2")"
REMOTE_CONFIG="$(decode_argument "$3")"
REMOTE_CRON="$(decode_argument "$4")"
CRON_SCHEDULE="$(decode_argument "$5")"
USE_SUDO="$(decode_argument "$6")"
SKIP_REMOTE_CHECK="$(decode_argument "$7")"

run_privileged() {
  if [ "$USE_SUDO" = '1' ]; then
    sudo "$@"
  else
    "$@"
  fi
}

cleanup() {
  rm -f "$UPLOADED_SCRIPT"
}
trap cleanup EXIT

if [ ! -f "$UPLOADED_SCRIPT" ]; then
  echo "Uploaded watchdog script is missing: $UPLOADED_SCRIPT" >&2
  exit 1
fi

echo "Installing server monitor with sudo=${USE_SUDO}"
run_privileged install -D -m 700 "$UPLOADED_SCRIPT" "$REMOTE_SCRIPT"

CRON_STAGING="$(mktemp)"
cleanup() {
  rm -f "$UPLOADED_SCRIPT" "$CRON_STAGING"
}

{
  echo '# Managed by Kalamapp deploy-server-monitor.ps1'
  printf '%s root %s >/dev/null 2>&1\n' "$CRON_SCHEDULE" "$REMOTE_SCRIPT"
} > "$CRON_STAGING"
run_privileged install -D -m 644 "$CRON_STAGING" "$REMOTE_CRON"

# نسخه‌های قدیمی نصب، همان watchdog را در crontab کاربر root هم نگه می‌داشتند.
# فقط همان خط دقیقِ قدیمی را حذف می‌کنیم تا زمان‌بندی‌های دیگر root دست‌نخورده بمانند.
ROOT_CRONTAB_STAGING="$(mktemp)"
ROOT_CRONTAB_NORMALIZED="$(mktemp)"
ROOT_CRONTAB_FILTERED="$(mktemp)"
cleanup() {
  rm -f "$UPLOADED_SCRIPT" "$CRON_STAGING" "$ROOT_CRONTAB_STAGING" "$ROOT_CRONTAB_NORMALIZED" "$ROOT_CRONTAB_FILTERED"
}
if run_privileged crontab -l > "$ROOT_CRONTAB_STAGING" 2>/dev/null; then
  # crontabهای قدیمی ممکن است با انتهای خط Windows باقی مانده باشند.
  sed 's/\r$//' "$ROOT_CRONTAB_STAGING" > "$ROOT_CRONTAB_NORMALIZED"
  grep -Fvx "* * * * * $REMOTE_SCRIPT >/dev/null 2>&1" "$ROOT_CRONTAB_NORMALIZED" > "$ROOT_CRONTAB_FILTERED" || true
  if ! cmp -s "$ROOT_CRONTAB_NORMALIZED" "$ROOT_CRONTAB_FILTERED"; then
    run_privileged crontab "$ROOT_CRONTAB_FILTERED"
    echo 'Removed the legacy duplicate root crontab entry for the watchdog'
  fi
fi

run_privileged bash -n "$REMOTE_SCRIPT"

if [ ! -r "$REMOTE_CONFIG" ]; then
  echo "Watchdog installed, but its secret config is missing: $REMOTE_CONFIG" >&2
  echo 'Create it once from ops/monitor.env.example; deploy never overwrites this file.' >&2
  exit 2
fi

if [ "$SKIP_REMOTE_CHECK" != '1' ]; then
  run_privileged "$REMOTE_SCRIPT"
fi

echo "Watchdog deployed: $REMOTE_SCRIPT"
echo "Cron deployed: $REMOTE_CRON"
'@

  $remoteArguments = @(
    $target,
    'bash',
    '--noprofile',
    '--norc',
    '-s',
    '--',
    (ConvertTo-RemoteArgument -Value $uploadedScript),
    (ConvertTo-RemoteArgument -Value $remoteScriptPath),
    (ConvertTo-RemoteArgument -Value $remoteConfigPath),
    (ConvertTo-RemoteArgument -Value $remoteCronPath),
    (ConvertTo-RemoteArgument -Value $cronSchedule),
    (ConvertTo-RemoteArgument -Value $(if ($useSudo) { '1' } else { '0' })),
    (ConvertTo-RemoteArgument -Value $(if ($SkipRemoteCheck) { '1' } else { '0' }))
  )
  Write-Step 'Installing watchdog and its dedicated cron entry on server'
  ($remoteScript -replace "`r", '') | & ssh @sshArgs @remoteArguments
  if ($LASTEXITCODE -ne 0) {
    throw 'Remote watchdog deployment failed.'
  }

  Write-Step 'Server monitoring deploy completed successfully'
}
finally {
  Pop-Location
}
