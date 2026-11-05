#!/usr/bin/env bash
# Install mods from this marketplace and merge each mod's keybindings.json
# into ~/.claude/keybindings.json.
# Usage: ./install.sh [mod ...]   (no args: every mod in mods/)
#        ./install.sh --pi [mod ...]        pi ports in ports/pi/
#        ./install.sh --opencode [mod ...]  opencode ports in ports/opencode/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
SOURCE="${CLAUDE_MODS_SOURCE:-kygura/claude-mods}"   # or a local path for testing
MARKET=claude-mods

# pi loads extensions through jiti, which keeps symlinked paths, so the ports'
# relative imports of mods/ only resolve from their real location: register them
# with `pi install <path>` (no copy, idempotent) instead of symlinking.
install_pi() {
  command -v pi >/dev/null || { echo "pi is not on PATH; install it first: https://pi.dev" >&2; exit 1; }
  local settings="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/settings.json" ok=1
  [ $# -eq 0 ] && set -- $(cd "$ROOT/ports/pi" && ls *.ts | sed 's/\.ts$//')
  for mod in "$@"; do
    [ -f "$ROOT/ports/pi/$mod.ts" ] || { echo "no pi port: $mod" >&2; exit 1; }
    pi install "$ROOT/ports/pi/$mod.ts"
    # pi exits 0 without saving when settings.json is malformed, so check it landed.
    if ! python3 - "$settings" "$ROOT/ports/pi/$mod.ts" <<'EOF'
import json, os, sys
settings, want = sys.argv[1], os.path.realpath(sys.argv[2])
try:
    packages = json.load(open(settings)).get("packages", [])
except Exception:
    sys.exit(1)
base = os.path.dirname(settings)
sources = [p if isinstance(p, str) else p.get("source", "") for p in packages]
sys.exit(0 if any(os.path.realpath(os.path.join(base, os.path.expanduser(s))) == want for s in sources) else 1)
EOF
    then
      echo "warning: $mod is not listed in $settings packages; check that file is valid JSON" >&2
      ok=0
    fi
  done
  [ $ok = 1 ] && echo "Done. Run /reload in open pi sessions." || echo "Finished with warnings." >&2
}

# Plugins are symlinked into plugins/ (Bun resolves imports from the real path);
# <mod>.tui.json keybinds are merged into tui.json without overwriting bound actions.
install_opencode() {
  local dir="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
  [ $# -eq 0 ] && set -- $(cd "$ROOT/ports/opencode" && ls | sed 's/\..*$//' | sort -u)
  mkdir -p "$dir/plugins"
  for mod in "$@"; do
    local plugin="$ROOT/ports/opencode/$mod.ts" keys="$ROOT/ports/opencode/$mod.tui.json" dest="$dir/plugins/$mod.ts"
    [ -f "$plugin" ] || [ -f "$keys" ] || { echo "no opencode port: $mod" >&2; exit 1; }
    if [ -f "$plugin" ]; then
      if [ -L "$dest" ] && [ "$(readlink -f "$dest")" != "$plugin" ]; then
        echo "skipped $dest: symlink to $(readlink "$dest"), not this repo" >&2
      elif [ -e "$dest" ] && [ ! -L "$dest" ]; then
        echo "skipped $dest: exists and is not a symlink" >&2
      else
        ln -sfn "$plugin" "$dest" && echo "linked $dest"
      fi
    fi
    [ -f "$keys" ] || continue
    python3 - "$keys" "$dir/tui.json" <<'EOF' || echo "warning: keybinds for $mod not merged" >&2
import json, os, sys, tempfile
from pathlib import Path
mod, path = json.loads(Path(sys.argv[1]).read_text()), Path(sys.argv[2])
try:
    user = json.loads(path.read_text()) if path.exists() else {"$schema": "https://opencode.ai/tui.json"}
    binds = user.setdefault("keybinds", {}) if isinstance(user, dict) else None
    if not isinstance(binds, dict):
        raise ValueError("unexpected shape")
except Exception as e:
    sys.exit(f"skipped {path} ({e}); add these keybinds by hand:\n{json.dumps(mod, indent=2)}")
for action, key in mod["keybinds"].items():
    if binds.setdefault(action, key) != key:
        print(f"kept your {action}: {binds[action]}")
fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tui.json.")
with os.fdopen(fd, "w") as f:
    f.write(json.dumps(user, indent=2, ensure_ascii=False) + "\n")
if path.exists():
    os.chmod(tmp, path.stat().st_mode)
os.replace(tmp, path)
print(f"merged keybinds into {path}")
EOF
  done
  echo "Done. Restart opencode."
}

case "${1:-}" in
  --pi) shift; install_pi "$@"; exit ;;
  --opencode) shift; install_opencode "$@"; exit ;;
esac

if claude plugin marketplace list 2>/dev/null | grep -q "$MARKET"; then
  claude plugin marketplace update "$MARKET"
else
  claude plugin marketplace add "$SOURCE"
fi

if [ $# -eq 0 ]; then
  set -- $(ls "$ROOT/mods")
fi

for mod in "$@"; do
  [ -d "$ROOT/mods/$mod" ] || { echo "unknown mod: $mod" >&2; exit 1; }
  claude plugin install "$mod@$MARKET"
  if [ -f "$ROOT/mods/$mod/keybindings.json" ]; then
    python3 "$ROOT/scripts/merge_keybindings.py" "$ROOT/mods/$mod/keybindings.json"
  fi
done
echo "Done. Run /reload-plugins in open sessions (restart if new keybindings don't respond)."
