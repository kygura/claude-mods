"""Merge a mod's keybindings.json into ~/.claude/keybindings.json.

Adds missing bindings per context; never overwrites a key the user already bound.
"""
import json
import sys
from pathlib import Path

SCHEMA = {
    "$schema": "https://www.schemastore.org/claude-code-keybindings.json",
    "$docs": "https://code.claude.com/docs/en/keybindings",
}


def merge(user: dict, mod: dict) -> list[str]:
    """Merge mod bindings into user in place; return skipped (conflicting) keys."""
    blocks = user.setdefault("bindings", [])
    skipped = []
    for mod_block in mod.get("bindings", []):
        block = next((b for b in blocks if b.get("context") == mod_block["context"]), None)
        if block is None:
            block = {"context": mod_block["context"], "bindings": {}}
            blocks.append(block)
        for key, action in mod_block["bindings"].items():
            current = block["bindings"].get(key, action)
            if current != action:
                skipped.append(f"{mod_block['context']}/{key} (already {current})")
                continue
            block["bindings"][key] = action
    return skipped


def main() -> None:
    target = Path.home() / ".claude" / "keybindings.json"
    user = json.loads(target.read_text()) if target.exists() else dict(SCHEMA)
    skipped = merge(user, json.loads(Path(sys.argv[1]).read_text()))
    target.write_text(json.dumps(user, indent=2) + "\n")
    for s in skipped:
        print(f"kept your binding, skipped: {s}", file=sys.stderr)


def demo() -> None:
    user = {"bindings": [{"context": "Global", "bindings": {"ctrl+meta+up": "app:redraw"}}]}
    mod = {"bindings": [
        {"context": "Global", "bindings": {"ctrl+meta+up": "x", "ctrl+meta+down": "y"}},
        {"context": "Chat", "bindings": {"meta+m": "z"}},
    ]}
    skipped = merge(user, mod)
    assert skipped == ["Global/ctrl+meta+up (already app:redraw)"]
    assert user["bindings"][0]["bindings"] == {"ctrl+meta+up": "app:redraw", "ctrl+meta+down": "y"}
    assert user["bindings"][1] == {"context": "Chat", "bindings": {"meta+m": "z"}}
    print("ok")


if __name__ == "__main__":
    demo() if sys.argv[1:] == ["--test"] else main()
