#!/usr/bin/env bash
# Install mods from this marketplace and merge each mod's keybindings.json
# into ~/.claude/keybindings.json.
# Usage: ./install.sh [mod ...]   (no args: every mod in mods/)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
SOURCE="${CLAUDE_MODS_SOURCE:-kygura/claude-mods}"   # or a local path for testing
MARKET=claude-mods

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
