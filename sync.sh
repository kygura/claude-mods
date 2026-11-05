#!/usr/bin/env bash
# Pull, import mods from their dev folders, rebuild the marketplace, validate,
# scan for secrets, commit and push.
# Usage: ./sync.sh [mod-folder ...]   (no args: just rebuild and push what's in mods/)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if git rev-parse '@{u}' >/dev/null 2>&1; then
  git pull --rebase --autostash
fi

for src in "$@"; do
  name=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["name"])' "$src/.claude-plugin/plugin.json")
  rsync -a --delete --exclude .git --exclude .claude-plugin/types --exclude .mcpb-cache \
    --exclude .DS_Store --exclude '*.log' "$src/" "mods/$name/"
  echo "imported $name"
done

python3 scripts/build_marketplace.py

for dir in mods/*/; do
  if ! out=$(claude plugin validate "$dir" 2>&1); then
    echo "$out" | sed -n '/Validating hooks/,/Plugin directory/p' >&2
    echo "validation failed: $dir" >&2
    exit 1
  fi
done

git add -A
if git diff --cached --quiet; then
  echo "nothing to commit"
else
  if command -v gitleaks >/dev/null; then
    gitleaks protect --staged --redact
  else
    echo "warning: gitleaks not installed, pushing without a secret scan" >&2
  fi
  git commit -m "chore: sync mods"
fi
git push -u origin main
