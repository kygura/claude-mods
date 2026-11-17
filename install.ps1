# Install mods from this marketplace on Windows and merge each mod's
# keybindings.json into %USERPROFILE%\.claude\keybindings.json.
# This is the Windows side: the desktop app reads %USERPROFILE%\.claude, not WSL's ~/.claude.
#
# Usage (PowerShell, from a clone):   .\install.ps1 [mod ...]   (no args: every mod)
# Usage (no clone):                   irm https://raw.githubusercontent.com/kygura/claude-mods/main/install.ps1 | iex
# Works on Windows PowerShell 5.1 and PowerShell 7.
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Mods)

$ErrorActionPreference = 'Stop'
$Source = if ($env:CLAUDE_MODS_SOURCE) { $env:CLAUDE_MODS_SOURCE } else { 'kygura/claude-mods' }
$Market = 'claude-mods'
$Raw = "https://raw.githubusercontent.com/$Source/main"
$Root = if ($PSScriptRoot -and (Test-Path (Join-Path $PSScriptRoot 'mods'))) { $PSScriptRoot } else { $null }

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Write-Error "claude is not on PATH in Windows. Install it with: irm https://claude.ai/install.ps1 | iex"
}

function Read-Json([string]$rel) {
  if ($Root) { return Get-Content -Raw (Join-Path $Root $rel) | ConvertFrom-Json }
  try { return Invoke-RestMethod "$Raw/$($rel -replace '\\', '/')" } catch { return $null }
}

# Adds missing bindings per context; never overwrites a key the user already bound.
function Merge-Keybindings($mod) {
  $dir = Join-Path $env:USERPROFILE '.claude'
  $target = Join-Path $dir 'keybindings.json'
  New-Item -ItemType Directory -Force $dir | Out-Null
  if (Test-Path $target) {
    $user = Get-Content -Raw $target | ConvertFrom-Json
  } else {
    $user = [pscustomobject]@{
      '$schema' = 'https://www.schemastore.org/claude-code-keybindings.json'
      '$docs'   = 'https://code.claude.com/docs/en/keybindings'
    }
  }
  if (-not $user.PSObject.Properties['bindings']) {
    $user | Add-Member -NotePropertyName bindings -NotePropertyValue @()
  }
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
        $block.bindings | Add-Member -NotePropertyName $p.Name -NotePropertyValue $p.Value
      }
    }
  }
  $user.bindings = $blocks.ToArray()
  # UTF-8 without a BOM (Set-Content -Encoding UTF8 adds one on PowerShell 5.1).
  $json = ($user | ConvertTo-Json -Depth 10) + "`n"
  [IO.File]::WriteAllText($target, $json, (New-Object System.Text.UTF8Encoding $false))
  Write-Host "merged keybindings into $target"
}

if ((claude plugin marketplace list 2>$null | Out-String) -match $Market) {
  claude plugin marketplace update $Market
} else {
  claude plugin marketplace add $Source
}
if ($LASTEXITCODE) { Write-Error "could not add or update the $Market marketplace" }

$known = (Read-Json '.claude-plugin\marketplace.json').plugins.name
if (-not $Mods) { $Mods = $known }

foreach ($mod in $Mods) {
  if ($known -notcontains $mod) { Write-Error "unknown mod: $mod" }
  claude plugin install "$mod@$Market"
  if ($LASTEXITCODE) { Write-Error "install failed: $mod" }
  $keys = Read-Json "mods\$mod\keybindings.json"
  if ($keys) { Merge-Keybindings $keys }
}
Write-Host "Done. Restart the desktop app, or run /reload-plugins in open sessions."
