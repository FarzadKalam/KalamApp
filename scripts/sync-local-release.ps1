# Called after frontend activation. Never leave a previous local release marked current.
param([string]$ConfigFile = '.env.deploy')
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
foreach ($line in Get-Content -LiteralPath (Join-Path $repo $ConfigFile) -Encoding UTF8) {
  if ($line -match '^([A-Z_]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2].Trim().Trim('"').Trim("'"), 'Process')
  }
}
$release = Get-Content -LiteralPath (Join-Path $repo 'dist/central-release.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($release.version -notmatch '^\d+(\.\d+)+$' -or $release.commit_sha -notmatch '^[a-f0-9]{40}$') { throw 'Invalid release provenance.' }
$dbContainer = if ($env:DB_MIGRATE_CONTAINER) { $env:DB_MIGRATE_CONTAINER } else { 'supabase-db' }
$dbUser = if ($env:DB_MIGRATE_DB_USER) { $env:DB_MIGRATE_DB_USER } else { 'supabase_admin' }
$dbName = if ($env:DB_MIGRATE_DATABASE) { $env:DB_MIGRATE_DATABASE } else { 'postgres' }
foreach ($value in @($dbContainer,$dbUser,$dbName)) { if ($value -notmatch '^[a-zA-Z0-9_-]+$') { throw 'Invalid database deployment setting.' } }
$docker = if ($env:DB_MIGRATE_USE_SUDO -in @('true','1')) { 'sudo docker' } else { 'docker' }
$sql = "do `$`$ begin if to_regclass('public.saas_local_releases') is not null then update public.saas_local_releases set is_current_central=false where is_current_central and (version<>'$($release.version)' or commit_sha<>'$($release.commit_sha)'); end if; end `$`$;"
$sshUser = if ($env:DB_MIGRATE_SSH_USER) { $env:DB_MIGRATE_SSH_USER } else { $env:DEPLOY_USER }
$port = if ($env:DEPLOY_PORT) { $env:DEPLOY_PORT } else { '22' }
$key = $env:DEPLOY_SSH_KEY_PATH
if ($key -and -not [IO.Path]::IsPathRooted($key)) { $key = Join-Path $repo $key }
$sshArgs = @('-p',$port,'-o','BatchMode=yes')
if ($key) { $sshArgs += @('-i',$key) }
$sql | & ssh @sshArgs "$sshUser@$env:DEPLOY_HOST" "$docker exec -i $dbContainer psql -X -U $dbUser -d $dbName -v ON_ERROR_STOP=1 -q"
if ($LASTEXITCODE -ne 0) { throw 'Could not synchronize current local release after frontend deployment.' }
Write-Host 'Local release selection synchronized with the deployed central version.'
