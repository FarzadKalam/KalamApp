param(
  [switch]$SkipBuild,
  [string]$ConfigFile = ".env.deploy"
)

$ErrorActionPreference = "Stop"
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
    if (-not $line -or $line.StartsWith("#")) {
      continue
    }

    $separatorIndex = $line.IndexOf("=")
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

    [Environment]::SetEnvironmentVariable($name, $value, "Process")
  }
}

function Get-RequiredEnv {
  param([string]$Name)

  $value = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Missing required setting: $Name"
  }

  return $value.Trim()
}

function Get-OptionalEnv {
  param(
    [string]$Name,
    [string]$DefaultValue = ""
  )

  $value = [Environment]::GetEnvironmentVariable($Name, "Process")
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

$repoRoot = Split-Path -Parent $PSScriptRoot
$localArchive = $null

Push-Location $repoRoot
try {
  Load-EnvFile -Path (Join-Path $repoRoot $ConfigFile)

  Assert-Command -Name "ssh"
  Assert-Command -Name "scp"
  Assert-Command -Name "tar"
  Assert-Command -Name "npm"

  $deployHost = Get-RequiredEnv -Name "DEPLOY_HOST"
  $deployPort = Get-OptionalEnv -Name "DEPLOY_PORT" -DefaultValue "22"
  $deployUser = Get-RequiredEnv -Name "DEPLOY_USER"
  $deployPath = Get-RequiredEnv -Name "DEPLOY_PATH"
  $keepReleases = Get-OptionalEnv -Name "DEPLOY_KEEP_RELEASES" -DefaultValue "5"
  $buildCommand = Get-OptionalEnv -Name "DEPLOY_BUILD_COMMAND" -DefaultValue "npm run build"
  $archiveName = Get-OptionalEnv -Name "DEPLOY_ARCHIVE_NAME" -DefaultValue "kalamapp-dist.tar.gz"

  if (-not $SkipBuild) {
    Write-Step "Building production bundle"
    & $env:ComSpec /d /s /c $buildCommand
    if ($LASTEXITCODE -ne 0) {
      throw "Build command failed: $buildCommand"
    }
  }

  $distPath = Join-Path $repoRoot "dist"
  if (-not (Test-Path -LiteralPath $distPath)) {
    throw "dist folder does not exist. Run build first or remove -SkipBuild."
  }

  $localArchive = Join-Path ([System.IO.Path]::GetTempPath()) $archiveName
  if (Test-Path -LiteralPath $localArchive) {
    Remove-Item -LiteralPath $localArchive -Force
  }

  Write-Step "Packing dist into $localArchive"
  & tar -czf $localArchive -C $distPath .
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create deploy archive."
  }

  $target = "{0}@{1}" -f $deployUser, $deployHost
  $remoteArchive = "/tmp/$archiveName"

  Write-Step "Uploading archive to $target"
  & scp -P $deployPort $localArchive "$target`:$remoteArchive"
  if ($LASTEXITCODE -ne 0) {
    throw "Upload failed."
  }

  $remoteScript = @'
set -euo pipefail

DEPLOY_PATH="$1"
ARCHIVE="$2"
KEEP_RELEASES="$3"
TS="$(date +%Y%m%d%H%M%S)"
RELEASES_DIR="$DEPLOY_PATH/releases"
RELEASE_DIR="$RELEASES_DIR/$TS"

mkdir -p "$RELEASES_DIR"
mkdir -p "$RELEASE_DIR"

tar -xzf "$ARCHIVE" -C "$RELEASE_DIR"
ln -sfn "$RELEASE_DIR" "$DEPLOY_PATH/current"

if [ -d "$RELEASES_DIR" ]; then
  ls -1dt "$RELEASES_DIR"/* 2>/dev/null | tail -n +"$((KEEP_RELEASES + 1))" | xargs -r rm -rf
fi

if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl reload nginx || true
fi

rm -f "$ARCHIVE"
echo "Deployed $RELEASE_DIR"
'@

  Write-Step "Activating release on server"
  $remoteScript | & ssh -p $deployPort $target "bash -s -- '$deployPath' '$remoteArchive' '$keepReleases'"
  if ($LASTEXITCODE -ne 0) {
    throw "Remote activation failed."
  }

  Write-Step "Deploy completed successfully"
}
finally {
  Pop-Location

  if ($localArchive -and (Test-Path -LiteralPath $localArchive)) {
    Remove-Item -LiteralPath $localArchive -Force -ErrorAction SilentlyContinue
  }
}
