"""Rebuild .claude-plugin/marketplace.json from mods/*/.claude-plugin/plugin.json."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
plugins = []
for manifest in sorted(root.glob("mods/*/.claude-plugin/plugin.json")):
    meta = json.loads(manifest.read_text())
    mod_dir = manifest.parent.parent
    plugins.append({
        "name": meta["name"],
        "source": f"./mods/{mod_dir.name}",
        "description": meta.get("description", ""),
        "version": meta.get("version", "0.1.0"),
    })

market = {"name": "claude-mods", "owner": {"name": "kygura"}, "plugins": plugins}
out = root / ".claude-plugin" / "marketplace.json"
out.write_text(json.dumps(market, indent=2) + "\n")
print(f"marketplace: {', '.join(p['name'] for p in plugins) or '(empty)'}")
