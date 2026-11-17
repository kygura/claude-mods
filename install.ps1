# Install mods on the Windows side, where Claude Desktop reads %USERPROFILE%\.claude,
# and merge each mod's keybindings.json into %USERPROFILE%\.claude\keybindings.json.
# A WSL install only reaches the Linux home, so Claude Desktop never sees it.
#
# Usage (PowerShell):  powershell -ExecutionPolicy Bypass -File install.ps1 [mod ...]
# Usage (from WSL):    ./install.sh --windows [mod ...]
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Mods)
$ErrorActionPreference = 'Stop'

$Root = $PSScriptRoot
$Source = if ($env:CLAUDE_MODS_SOURCE) { $env:CLAUDE_MODS_SOURCE } else { 'kygura/claude-mods' }
$Market = 'claude-mods'
$ClaudeDir = Join-Path $env:USERPROFILE '.claude'

if (-not $Mods) { $Mods = Get-ChildItem (Join-Path $Root 'mods') -Directory | ForEach-Object Name }
foreach ($m in $Mods) {
    if (-not (Test-Path (Join-Path $Root "mods\$m") -PathType Container)) { throw "unknown mod: $m" }
}

function Read-Json($Path, $Default) {
    if (Test-Path $Path) { Get-Content $Path -Raw -Encoding UTF8 | ConvertFrom-Json } else { $Default }
}

function Write-Json($Obj, $Path) {
    New-Item -ItemType Directory -Force (Split-Path $Path) | Out-Null
    $tmp = "$Path.tmp"
    [IO.File]::WriteAllText($tmp, ($Obj | ConvertTo-Json -Depth 20) + "`n", (New-Object Text.UTF8Encoding $false))
    Move-Item -Force $tmp $Path
}

function Set-Prop($Obj, $Name, $Value) {
    if ($Obj.PSObject.Properties[$Name]) { $Obj.$Name = $Value }
    else { $Obj | Add-Member -NotePropertyName $Name -NotePropertyValue $Value }
}

# Same rules as scripts/merge_keybindings.py: add missing keys, never overwrite one you bound.
function Merge-Keybindings($ModFile) {
    $target = Join-Path $ClaudeDir 'keybindings.json'
    $user = Read-Json $target ([pscustomobject]@{
        '$schema' = 'https://www.schemastore.org/claude-code-keybindings.json'
        '$docs'   = 'https://code.claude.com/docs/en/keybindings'
    })
    if (-not $user.PSObject.Properties['bindings']) { Set-Prop $user 'bindings' @() }
    $mod = Read-Json $ModFile $null
    foreach ($mb in $mod.bindings) {
        $block = @($user.bindings) | Where-Object { $_.context -eq $mb.context } | Select-Object -First 1
        if (-not $block) {
            $block = [pscustomobject]@{ context = $mb.context; bindings = [pscustomobject]@{} }
            $user.bindings = @($user.bindings) + $block
        }
        foreach ($p in $mb.bindings.PSObject.Properties) {
            $cur = $block.bindings.PSObject.Properties[$p.Name]
            if ($cur -and $cur.Value -ne $p.Value) {
                Write-Warning "kept your binding, skipped: $($mb.context)/$($p.Name) (already $($cur.Value))"
                continue
            }
            Set-Prop $block.bindings $p.Name $p.Value
        }
    }
    Write-Json $user $target
    Write-Host "merged keybindings into $target"
}

if (Get-Command claude -ErrorAction SilentlyContinue) {
    $list = (& claude plugin marketplace list 2>$null) | Out-String
    if ($list -match [regex]::Escape($Market)) { & claude plugin marketplace update $Market }
    else { & claude plugin marketplace add $Source }
    if ($LASTEXITCODE) { throw "could not add marketplace $Source" }
    foreach ($m in $Mods) {
        & claude plugin install "$m@$Market"
        if ($LASTEXITCODE) { throw "install failed: $m" }
    }
} else {
    # No Windows claude CLI (Desktop only): declare the marketplace and enable the
    # mods in settings.json. Claude installs them the next time it starts.
    $settingsPath = Join-Path $ClaudeDir 'settings.json'
    $s = Read-Json $settingsPath ([pscustomobject]@{})
    $src = if (Test-Path $Source) { [pscustomobject]@{ source = 'directory'; path = (Resolve-Path $Source).Path } }
           else { [pscustomobject]@{ source = 'github'; repo = $Source } }
    if (-not $s.PSObject.Properties['extraKnownMarketplaces']) { Set-Prop $s 'extraKnownMarketplaces' ([pscustomobject]@{}) }
    Set-Prop $s.extraKnownMarketplaces $Market ([pscustomobject]@{ source = $src })
    if (-not $s.PSObject.Properties['enabledPlugins']) { Set-Prop $s 'enabledPlugins' ([pscustomobject]@{}) }
    foreach ($m in $Mods) { Set-Prop $s.enabledPlugins "$m@$Market" $true }
    Write-Json $s $settingsPath
    Write-Host "claude CLI not found on Windows; enabled the mods in $settingsPath instead"
}

foreach ($m in $Mods) {
    $kb = Join-Path $Root "mods\$m\keybindings.json"
    if (Test-Path $kb) { Merge-Keybindings $kb }
}
Write-Host 'Done. Restart Claude Desktop (or run /reload-plugins in open sessions).'
