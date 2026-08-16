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

function Test-GzipArchive {
  param([string]$ArchivePath)

  & tar -tzf $ArchivePath *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Deploy archive is invalid before upload: $ArchivePath"
  }
}

function Get-RemoteArchiveSha256 {
  param(
    [string[]]$SshArgs,
    [string]$Target,
    [string]$RemotePath
  )

  $output = @(& ssh @SshArgs $Target "sha256sum -- '$RemotePath'")
  if ($LASTEXITCODE -ne 0) {
    return ""
  }

  $match = [regex]::Match(($output -join "`n").Trim(), '^[A-Fa-f0-9]{64}(?=\s)')
  if (-not $match.Success) {
    return ""
  }

  return $match.Value.ToLowerInvariant()
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

function New-SshSessionOptions {
  param(
    [string]$DeployPort,
    [string]$DeployHost,
    [string]$RepoRoot,
    [string]$SshKeyPath = ""
  )

  $controlDir = Join-Path $RepoRoot '.ssh-control'
  New-Item -ItemType Directory -Path $controlDir -Force | Out-Null
  $controlPath = [System.IO.Path]::GetFullPath((Join-Path $controlDir ("kalamapp-ssh-{0}-{1}" -f $DeployHost, $DeployPort)))
  $identityArgs = @()
  if (-not [string]::IsNullOrWhiteSpace($SshKeyPath)) {
    $identityArgs = @('-i', $SshKeyPath)
  }
  return [pscustomobject]@{
    SshArgs = @(
      '-p', $DeployPort,
      '-o', 'ControlMaster=auto',
      '-o', 'ControlPersist=600',
      '-o', "ControlPath=$controlPath"
    ) + $identityArgs
    ScpArgs = @(
      '-P', $DeployPort,
      '-o', 'ControlMaster=auto',
      '-o', 'ControlPersist=600',
      '-o', "ControlPath=$controlPath"
    ) + $identityArgs
  }
}

function Resolve-SshKeyPath {
  param(
    [string]$ConfiguredPath,
    [string]$RepoRoot
  )

  if ([string]::IsNullOrWhiteSpace($ConfiguredPath)) {
    return ""
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

$repoRoot = Split-Path -Parent $PSScriptRoot
$localArchive = $null
$sshCommonArgs = $null
$target = $null
$sharedSessionOpened = $false

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
  $sshKeyPath = Resolve-SshKeyPath -ConfiguredPath (Get-OptionalEnv -Name 'DEPLOY_SSH_KEY_PATH') -RepoRoot $repoRoot
  $keepReleases = Get-OptionalEnv -Name "DEPLOY_KEEP_RELEASES" -DefaultValue "5"
  $buildCommand = Get-OptionalEnv -Name "DEPLOY_BUILD_COMMAND" -DefaultValue "npm run build"
  $archiveName = Get-OptionalEnv -Name "DEPLOY_ARCHIVE_NAME" -DefaultValue "kalamapp-dist.tar.gz"
  $useSharedSsh = ConvertTo-Bool -Value (Get-OptionalEnv -Name 'DEPLOY_USE_SHARED_SSH') -DefaultValue $false

  if ($archiveName -notmatch '^[A-Za-z0-9._-]+\.tar\.gz$') {
    throw "DEPLOY_ARCHIVE_NAME must be a simple .tar.gz file name."
  }

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

  $archiveStem = $archiveName.Substring(0, $archiveName.Length - '.tar.gz'.Length)
  $archiveToken = "{0}-{1}" -f (Get-Date -Format 'yyyyMMddHHmmssfff'), ([guid]::NewGuid().ToString('N').Substring(0, 8))
  $releaseArchiveName = "$archiveStem-$archiveToken.tar.gz"
  $localArchive = Join-Path ([System.IO.Path]::GetTempPath()) $releaseArchiveName

  Write-Step "Packing dist into $localArchive"
  & tar -czf $localArchive -C $distPath .
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create deploy archive."
  }
  Test-GzipArchive -ArchivePath $localArchive
  $localArchiveHash = (Get-FileHash -LiteralPath $localArchive -Algorithm SHA256).Hash.ToLowerInvariant()

  $target = "{0}@{1}" -f $deployUser, $deployHost
  $remoteArchive = "/tmp/$releaseArchiveName"
  $identityArgs = @()
  if (-not [string]::IsNullOrWhiteSpace($sshKeyPath)) {
    $identityArgs = @('-i', $sshKeyPath)
  }
  $sshCommonArgs = @('-p', $deployPort) + $identityArgs
  $scpCommonArgs = @('-P', $deployPort) + $identityArgs
  if ($useSharedSsh) {
    $sessionOptions = New-SshSessionOptions -DeployPort $deployPort -DeployHost $deployHost -RepoRoot $repoRoot -SshKeyPath $sshKeyPath
    $sshCommonArgs = $sessionOptions.SshArgs
    $scpCommonArgs = $sessionOptions.ScpArgs
  }

  if ($useSharedSsh) {
    Write-Step "Opening shared SSH session to $target"
    & ssh @sshCommonArgs -Nf $target
    if ($LASTEXITCODE -eq 0) {
      $sharedSessionOpened = $true
    } else {
      Write-Warning 'Shared SSH session is not available on this client. Falling back to direct ssh/scp calls.'
      $sshCommonArgs = @('-p', $deployPort) + $identityArgs
      $scpCommonArgs = @('-P', $deployPort) + $identityArgs
    }
  }

  $archiveUploaded = $false
  for ($attempt = 1; $attempt -le 2; $attempt++) {
    Write-Step "Uploading archive to $target (attempt $attempt/2)"
    & scp @scpCommonArgs $localArchive "$target`:$remoteArchive"
    if ($LASTEXITCODE -ne 0) {
      if ($attempt -eq 2) {
        throw "Upload failed."
      }
      Write-Warning "Archive upload failed; retrying with a fresh remote file."
      continue
    }

    $remoteArchiveHash = Get-RemoteArchiveSha256 -SshArgs $sshCommonArgs -Target $target -RemotePath $remoteArchive
    if ($remoteArchiveHash -eq $localArchiveHash) {
      $archiveUploaded = $true
      break
    }

    if ($attempt -eq 2) {
      throw "Uploaded archive checksum does not match the local archive."
    }
    Write-Warning "Uploaded archive checksum mismatch; retrying before activation."
    & ssh @sshCommonArgs $target "rm -f -- '$remoteArchive'" 2>$null
  }
  if (-not $archiveUploaded) {
    throw "Upload verification failed."
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
  $remoteScriptLf = $remoteScript -replace "`r", ""
  $remoteScriptLf | & ssh @sshCommonArgs $target "bash -s -- '$deployPath' '$remoteArchive' '$keepReleases'"
  if ($LASTEXITCODE -ne 0) {
    throw "Remote activation failed."
  }

  Write-Step "Deploy completed successfully"
}
finally {
  if ($sharedSessionOpened -and $sshCommonArgs -and $target) {
    & ssh @sshCommonArgs -O exit $target 2>$null | Out-Null
  }

  Pop-Location

  if ($localArchive -and (Test-Path -LiteralPath $localArchive)) {
    Remove-Item -LiteralPath $localArchive -Force -ErrorAction SilentlyContinue
  }
}
