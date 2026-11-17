# Install mods from this marketplace on Windows and merge each mod's
# keybindings.json into %USERPROFILE%\.claude\keybindings.json.
# This is the Windows side: Claude Desktop reads %USERPROFILE%\.claude, not WSL's ~/.claude.
#
# Usage (PowerShell, from a clone):   .\install.ps1 [mod ...]   (no args: every mod)
# Usage (no clone):                   irm https://raw.githubusercontent.com/kygura/claude-mods/main/install.ps1 | iex
# Usage (from a WSL clone):           ./install.sh --windows [mod ...]
# Works on Windows PowerShell 5.1 and PowerShell 7.
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Mods)

$ErrorActionPreference = 'Stop'
$Source = if ($env:CLAUDE_MODS_SOURCE) { $env:CLAUDE_MODS_SOURCE } else { 'kygura/claude-mods' }
$Market = 'claude-mods'
$Raw = "https://raw.githubusercontent.com/$Source/main"
$Root = if ($PSScriptRoot -and (Test-Path (Join-Path $PSScriptRoot 'mods'))) { $PSScriptRoot } else { $null }
$ClaudeDir = Join-Path $env:USERPROFILE '.claude'

# Reads a repo file from the clone, or from GitHub when run with irm | iex.
function Read-RepoJson([string]$rel) {
  if ($Root) {
    $path = Join-Path $Root $rel
    if (Test-Path $path) { return Get-Content -Raw -Encoding UTF8 $path | ConvertFrom-Json }
    return $null
  }
  try { return Invoke-RestMethod "$Raw/$($rel -replace '\\', '/')" } catch { return $null }
}

function Read-UserJson([string]$path, $default) {
  if (Test-Path $path) { return Get-Content -Raw -Encoding UTF8 $path | ConvertFrom-Json }
  return $default
}

# UTF-8 without a BOM (Set-Content -Encoding UTF8 adds one on PowerShell 5.1).
function Write-UserJson($obj, [string]$path) {
  New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
  $json = ($obj | ConvertTo-Json -Depth 20) + "`n"
  [IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
}

function Set-Prop($obj, [string]$name, $value) {
  if ($obj.PSObject.Properties[$name]) { $obj.$name = $value }
  else { $obj | Add-Member -NotePropertyName $name -NotePropertyValue $value }
}

# Adds missing bindings per context; never overwrites a key the user already bound.
function Merge-Keybindings($mod) {
  $target = Join-Path $ClaudeDir 'keybindings.json'
  $user = Read-UserJson $target ([pscustomobject]@{
    '$schema' = 'https://www.schemastore.org/claude-code-keybindings.json'
    '$docs'   = 'https://code.claude.com/docs/en/keybindings'
  })
  if (-not $user.PSObject.Properties['bindings']) { Set-Prop $user 'bindings' @() }
  $blocks = [System.Collections.ArrayList]@($user.bindings)
  foreach ($modBlock in $mod.bindings) {
    $block = $blocks | Where-Object { $_.context -eq $modBlock.context } | Select-Object -First 1
    if (-not $block) {
      $block = [pscustomobject]@{ context = $modBlock.context; bindings = [pscustomobject]@{} }
      [void]$blocks.Add($block)
    }
    foreach ($p in $modBlock.bindings.PSObject.Properties) {
      $current = $block.bindings.PSObject.Properties[$p.Name]
      if ($current -and $current.Value -ne $p.Value) {
        Write-Warning "kept your binding, skipped: $($modBlock.context)/$($p.Name) (already $($current.Value))"
      } elseif (-not $current) {
        Set-Prop $block.bindings $p.Name $p.Value
      }
    }
  }
  $user.bindings = $blocks.ToArray()
  Write-UserJson $user $target
  Write-Host "merged keybindings into $target"
}

$known = (Read-RepoJson '.claude-plugin\marketplace.json').plugins.name
if (-not $known) { Write-Error "could not read the mod list from $Source" }
if (-not $Mods) { $Mods = $known }
foreach ($mod in $Mods) { if ($known -notcontains $mod) { Write-Error "unknown mod: $mod" } }

if (Get-Command claude -ErrorAction SilentlyContinue) {
  if ((claude plugin marketplace list 2>$null | Out-String) -match [regex]::Escape($Market)) {
    claude plugin marketplace update $Market
  } else {
    claude plugin marketplace add $Source
  }
  if ($LASTEXITCODE) { Write-Error "could not add or update the $Market marketplace" }
  foreach ($mod in $Mods) {
    claude plugin install "$mod@$Market"
    if ($LASTEXITCODE) { Write-Error "install failed: $mod" }
  }
} else {
  # Desktop only, no Windows claude CLI: declare the marketplace and enable the
  # mods in settings.json. Claude installs them the next time it starts.
  $settingsPath = Join-Path $ClaudeDir 'settings.json'
  $s = Read-UserJson $settingsPath ([pscustomobject]@{})
  $src = if (Test-Path $Source) { [pscustomobject]@{ source = 'directory'; path = (Resolve-Path $Source).Path } }
         else { [pscustomobject]@{ source = 'github'; repo = $Source } }
  if (-not $s.PSObject.Properties['extraKnownMarketplaces']) { Set-Prop $s 'extraKnownMarketplaces' ([pscustomobject]@{}) }
  if (-not $s.extraKnownMarketplaces.PSObject.Properties[$Market]) {
    Set-Prop $s.extraKnownMarketplaces $Market ([pscustomobject]@{ source = $src })
  }
  if (-not $s.PSObject.Properties['enabledPlugins']) { Set-Prop $s 'enabledPlugins' ([pscustomobject]@{}) }
  foreach ($mod in $Mods) { Set-Prop $s.enabledPlugins "$mod@$Market" $true }
  Write-UserJson $s $settingsPath
  Write-Host "claude is not on PATH in Windows; enabled the mods in $settingsPath instead"
}

foreach ($mod in $Mods) {
  $keys = Read-RepoJson "mods\$mod\keybindings.json"
  if ($keys) { Merge-Keybindings $keys }
}
Write-Host "Done. Restart Claude Desktop, or run /reload-plugins in open sessions."
