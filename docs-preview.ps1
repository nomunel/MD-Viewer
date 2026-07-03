param(
  [int]$Port = 4173,
  [string]$ServerToken = "",
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$AppRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Token = if ([string]::IsNullOrWhiteSpace($ServerToken)) { [guid]::NewGuid().ToString("N") } else { $ServerToken }
$PreviewFile = "Preview.html"

function New-JsonBytes($Value) {
  return [System.Text.Encoding]::UTF8.GetBytes(($Value | ConvertTo-Json -Depth 8 -Compress))
}

function Send-Bytes($Context, [byte[]]$Bytes, [string]$ContentType, [int]$StatusCode = 200) {
  $response = $Context.Response
  if ($response.RawStream) {
    $reason = switch ($StatusCode) {
      200 { "OK" }
      204 { "No Content" }
      400 { "Bad Request" }
      403 { "Forbidden" }
      404 { "Not Found" }
      500 { "Internal Server Error" }
      default { "OK" }
    }
    $headers = "HTTP/1.1 $StatusCode $reason`r`n" +
      "Content-Type: $ContentType`r`n" +
      "Content-Length: $($Bytes.Length)`r`n" +
      "Cache-Control: no-store`r`n" +
      "Connection: close`r`n" +
      "`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
    $response.RawStream.Write($headerBytes, 0, $headerBytes.Length)
    $response.RawStream.Write($Bytes, 0, $Bytes.Length)
    $response.RawStream.Flush()
    $response.RawStream.Close()
    return
  }

  $response.StatusCode = $StatusCode
  $response.ContentType = $ContentType
  $response.ContentLength64 = $Bytes.Length
  $response.Headers["Cache-Control"] = "no-store"
  $response.OutputStream.Write($Bytes, 0, $Bytes.Length)
  $response.OutputStream.Close()
}

function Send-Json($Context, $Value, [int]$StatusCode = 200) {
  Send-Bytes $Context (New-JsonBytes $Value) "application/json; charset=utf-8" $StatusCode
}

function Send-Text($Context, [string]$Text, [string]$ContentType = "text/plain; charset=utf-8", [int]$StatusCode = 200) {
  Send-Bytes $Context ([System.Text.Encoding]::UTF8.GetBytes($Text)) $ContentType $StatusCode
}

function Send-ErrorJson($Context, [int]$StatusCode, [string]$Message) {
  Send-Json $Context @{ error = $Message } $StatusCode
}

function Test-SubPath([string]$BasePath, [string]$TargetPath) {
  $base = [System.IO.Path]::GetFullPath($BasePath).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
  $target = [System.IO.Path]::GetFullPath($TargetPath)
  return $target.StartsWith($base, [System.StringComparison]::OrdinalIgnoreCase)
}

function Resolve-DocumentRoot([string]$PathValue) {
  if ([string]::IsNullOrWhiteSpace($PathValue)) {
    throw "Document root path is empty."
  }
  $trimmed = $PathValue.Trim().Trim('"', "'")
  $full = [System.IO.Path]::GetFullPath($trimmed)
  if (-not [System.IO.Directory]::Exists($full)) {
    throw "Document root does not exist: $full"
  }
  return $full
}

function Resolve-DocumentFile([string]$RootPath, [string]$RelativePath) {
  $root = Resolve-DocumentRoot $RootPath
  $relative = [string]$RelativePath
  $relative = $relative.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
  $full = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, $relative))
  if (-not (Test-SubPath $root $full)) {
    throw "Path is outside the document root."
  }
  if (-not [System.IO.File]::Exists($full)) {
    throw "File does not exist: $RelativePath"
  }
  return $full
}

function Join-RelativePath([string]$Base, [string]$Name) {
  if ([string]::IsNullOrWhiteSpace($Base)) {
    return $Name
  }
  return "$Base/$Name"
}

function Get-MarkdownPaths([string]$DirectoryPath, [string]$Base = "") {
  $items = Get-ChildItem -LiteralPath $DirectoryPath -Force -ErrorAction Stop
  foreach ($item in $items) {
    if ($item.Name.StartsWith(".")) {
      continue
    }
    $relative = Join-RelativePath $Base $item.Name
    if ($item.PSIsContainer) {
      Get-MarkdownPaths $item.FullName $relative
    } elseif ($item.Extension -ieq ".md" -and $item.Name -ne $PreviewFile) {
      $relative.Replace('\', '/')
    }
  }
}

function Get-ContentType([string]$Path) {
  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8"; break }
    ".css" { "text/css; charset=utf-8"; break }
    ".js" { "text/javascript; charset=utf-8"; break }
    ".json" { "application/json; charset=utf-8"; break }
    ".svg" { "image/svg+xml"; break }
    ".png" { "image/png"; break }
    ".jpg" { "image/jpeg"; break }
    ".jpeg" { "image/jpeg"; break }
    ".gif" { "image/gif"; break }
    ".webp" { "image/webp"; break }
    ".md" { "text/markdown; charset=utf-8"; break }
    default { "application/octet-stream" }
  }
}

function Select-DocumentFolder() {
  if ([System.Threading.Thread]::CurrentThread.GetApartmentState() -ne [System.Threading.ApartmentState]::STA) {
    throw "Folder picker requires STA. Start the viewer with docs-preview.cmd."
  }

  Add-Type -AssemblyName System.Windows.Forms
  $owner = New-Object System.Windows.Forms.Form
  $owner.Text = "Markdown Viewer"
  $owner.Width = 1
  $owner.Height = 1
  $owner.StartPosition = "CenterScreen"
  $owner.ShowInTaskbar = $false
  $owner.TopMost = $true
  $owner.Opacity = 0

  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "Select a Markdown document root folder"
  $dialog.ShowNewFolderButton = $false
  try {
    $owner.Show()
    $owner.Activate()
    if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
      return $dialog.SelectedPath
    }
    return ""
  } finally {
    $dialog.Dispose()
    $owner.Close()
    $owner.Dispose()
  }
}

function Test-ApiToken($Request) {
  $provided = $Request.QueryString["serverToken"]
  if ([string]::IsNullOrWhiteSpace($provided)) {
    $provided = $Request.Headers["X-Docs-Token"]
  }
  return $provided -eq $Token
}

function ConvertTo-QueryMap([string]$Query) {
  $map = @{}
  $trimmed = ([string]$Query).TrimStart("?")
  if ([string]::IsNullOrWhiteSpace($trimmed)) {
    return $map
  }
  foreach ($pair in $trimmed.Split("&")) {
    if ([string]::IsNullOrWhiteSpace($pair)) {
      continue
    }
    $parts = $pair.Split("=", 2)
    $key = [System.Uri]::UnescapeDataString($parts[0].Replace("+", " "))
    $value = ""
    if ($parts.Count -gt 1) {
      $value = [System.Uri]::UnescapeDataString($parts[1].Replace("+", " "))
    }
    $map[$key] = $value
  }
  return $map
}

function Read-HttpRequest($Client, [int]$Port) {
  $stream = $Client.GetStream()
  $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
  $requestLine = $reader.ReadLine()
  if ([string]::IsNullOrWhiteSpace($requestLine)) {
    throw "Empty HTTP request."
  }

  $requestParts = $requestLine.Split(" ")
  if ($requestParts.Count -lt 2) {
    throw "Invalid HTTP request."
  }

  $headers = @{}
  while ($true) {
    $line = $reader.ReadLine()
    if ($null -eq $line -or $line -eq "") {
      break
    }
    $separator = $line.IndexOf(":")
    if ($separator -gt 0) {
      $headers[$line.Substring(0, $separator)] = $line.Substring($separator + 1).Trim()
    }
  }

  $target = $requestParts[1]
  $uri = [System.Uri]::new("http://127.0.0.1:$Port$target")
  return [pscustomobject]@{
    Request = [pscustomobject]@{
      Url = $uri
      QueryString = ConvertTo-QueryMap $uri.Query
      Headers = $headers
    }
    Response = [pscustomobject]@{
      RawStream = $stream
    }
  }
}

function Handle-ApiRequest($Context) {
  $request = $Context.Request
  if (-not (Test-ApiToken $request)) {
    Send-ErrorJson $Context 403 "Invalid server token."
    return
  }

  $endpoint = $request.Url.AbsolutePath.TrimStart("/")
  switch ($endpoint) {
    "api/status" {
      Send-Json $Context @{ ok = $true }
      return
    }
    "api/pick-folder" {
      $path = Select-DocumentFolder
      Send-Json $Context @{ path = $path }
      return
    }
    "api/index" {
      $root = Resolve-DocumentRoot $request.QueryString["root"]
      $paths = @(Get-MarkdownPaths $root | Sort-Object)
      Send-Json $Context @{
        rootPath = $root
        folderName = Split-Path -Leaf $root
        paths = $paths
      }
      return
    }
    "api/file" {
      $file = Resolve-DocumentFile $request.QueryString["root"] $request.QueryString["path"]
      Send-Text $Context ([System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)) "text/plain; charset=utf-8"
      return
    }
    "api/asset" {
      $file = Resolve-DocumentFile $request.QueryString["root"] $request.QueryString["path"]
      Send-Bytes $Context ([System.IO.File]::ReadAllBytes($file)) (Get-ContentType $file)
      return
    }
    default {
      Send-ErrorJson $Context 404 "Unknown API endpoint."
      return
    }
  }
}

function Handle-StaticRequest($Context) {
  $requestPath = [System.Uri]::UnescapeDataString($Context.Request.Url.AbsolutePath.TrimStart("/"))
  if ([string]::IsNullOrWhiteSpace($requestPath)) {
    $requestPath = "viewer.html"
  }
  if ($requestPath -eq "favicon.ico") {
    Send-Bytes $Context ([byte[]]@()) "image/x-icon" 204
    return
  }

  $localRelative = $requestPath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
  $fullPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($AppRoot, $localRelative))
  if (-not (Test-SubPath $AppRoot $fullPath)) {
    Send-Text $Context "Forbidden" "text/plain; charset=utf-8" 403
    return
  }
  if (-not [System.IO.File]::Exists($fullPath)) {
    Send-Text $Context "Not found" "text/plain; charset=utf-8" 404
    return
  }

  Send-Bytes $Context ([System.IO.File]::ReadAllBytes($fullPath)) (Get-ContentType $fullPath)
}

$Listener = $null
$StartedPort = $null
for ($offset = 0; $offset -lt 20; $offset++) {
  $candidatePort = $Port + $offset
  $candidate = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $candidatePort)
  try {
    $candidate.Start()
    $Listener = $candidate
    $StartedPort = $candidatePort
    break
  } catch {
    $candidate.Stop()
  }
}

if (-not $Listener) {
  throw "Could not start local server. Try another port with -Port."
}

$ViewerUrl = "http://127.0.0.1:$StartedPort/viewer.html?serverToken=$Token"
Write-Host "Markdown Viewer server is running:"
Write-Host "  $ViewerUrl"
Write-Host "Press Ctrl+C to stop."

if (-not $NoBrowser) {
  Start-Process $ViewerUrl
}

try {
  while ($true) {
    $client = $Listener.AcceptTcpClient()
    try {
      $context = Read-HttpRequest $client $StartedPort
      if ($context.Request.Url.AbsolutePath.StartsWith("/api/")) {
        Handle-ApiRequest $context
      } else {
        Handle-StaticRequest $context
      }
    } catch {
      try {
        if ($context) {
          Send-ErrorJson $context 500 ($_.Exception.Message)
        }
      } catch {
        # Ignore response failures after the client disconnects.
      }
    } finally {
      if ($client) {
        $client.Close()
      }
    }
  }
} finally {
  if ($Listener) {
    $Listener.Stop()
  }
}
