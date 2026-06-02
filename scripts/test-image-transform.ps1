param(
  [Parameter(Mandatory = $true)]
  [string]$Url,

  [string]$Preset = "printHero"
)

$ErrorActionPreference = "Stop"

function Get-PresetConfig {
  param([string]$Name)

  switch ($Name) {
    "avatar" { return @{ width = 120; quality = 65; resize = "cover" } }
    "thumb" { return @{ width = 260; quality = 68; resize = "cover" } }
    "card" { return @{ width = 520; quality = 72; resize = "cover" } }
    "hero" { return @{ width = 920; quality = 76; resize = "cover" } }
    "gallery" { return @{ width = 760; quality = 74; resize = "contain" } }
    "printLogo" { return @{ width = 240; quality = 72; resize = "contain" } }
    "printMap" { return @{ width = 720; quality = 64; resize = "cover" } }
    default { return @{ width = 1400; quality = 68; resize = "cover" } }
  }
}

function Convert-ToTransformUrl {
  param(
    [string]$RawUrl,
    [string]$PresetName
  )

  $config = Get-PresetConfig -Name $PresetName
  $uri = [System.Uri]::new($RawUrl)
  $builder = [System.UriBuilder]::new($uri)
  $builder.Path = $builder.Path.Replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')

  $query = [string]$builder.Query
  if ($query.StartsWith('?')) {
    $query = $query.Substring(1)
  }

  $parts = @()
  if ($query) {
    $parts += $query
  }
  if ($query -notmatch '(^|&)width=') { $parts += "width=$($config.width)" }
  if ($query -notmatch '(^|&)quality=') { $parts += "quality=$($config.quality)" }
  if ($query -notmatch '(^|&)resize=') { $parts += "resize=$($config.resize)" }
  $builder.Query = ($parts -join '&')
  return $builder.Uri.AbsoluteUri
}

function Test-Url {
  param([string]$TargetUrl)

  try {
    $response = Invoke-WebRequest -Uri $TargetUrl -Method Get -MaximumRedirection 5 -TimeoutSec 30
    [pscustomobject]@{
      Url = $TargetUrl
      Success = $true
      StatusCode = [int]$response.StatusCode
      ContentType = [string]$response.Headers["Content-Type"]
      ContentLength = [string]$response.Headers["Content-Length"]
    }
  } catch {
    $statusCode = ""
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $statusCode = [int]$_.Exception.Response.StatusCode
    }
    [pscustomobject]@{
      Url = $TargetUrl
      Success = $false
      StatusCode = $statusCode
      ContentType = ""
      ContentLength = ""
      Error = $_.Exception.Message
    }
  }
}

if ($Url -notmatch '/storage/v1/object/public/' -and $Url -notmatch '/storage/v1/render/image/public/') {
  throw "Input URL is not a Supabase storage URL."
}

$transformUrl = if ($Url -match '/storage/v1/render/image/public/') { $Url } else { Convert-ToTransformUrl -RawUrl $Url -PresetName $Preset }

$originalResult = Test-Url -TargetUrl $Url
$transformResult = Test-Url -TargetUrl $transformUrl

Write-Host ""
Write-Host "Original:" -ForegroundColor Cyan
$originalResult | Format-List
Write-Host ""
Write-Host "Transformed:" -ForegroundColor Yellow
$transformResult | Format-List
Write-Host ""

if ($transformResult.Success) {
  Write-Host "Transform route OK" -ForegroundColor Green
  Write-Host "If this transformed URL also renders correctly in the browser, enable VITE_ENABLE_PRINT_IMAGE_TRANSFORM=true." -ForegroundColor Green
} else {
  Write-Host "Transform route FAILED" -ForegroundColor Red
  Write-Host "Do not enable print image transforms until this route returns a valid image." -ForegroundColor Red
}
