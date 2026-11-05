# model-keys

A band above the Claude Code prompt for watching context usage and switching the model and the effort level of the main conversation, without typing `/model` or `/effort`.

- **Click** any model (`default`, `haiku`, `sonnet`, `opus`, `fable`) or effort level (`low` to `max`). The current pick is a filled chip.
- **`ctrl+alt+↑/↓`** steps through models, **`ctrl+alt+←/→`** steps the effort level. `reset` returns to the session defaults.
- Each reply starts with the model it was sent to, as `[claude-sonnet-5-5]`, written by the mod into the message (not claimed by the model). Shown once per turn, again if the model changes mid-turn.
- **Context bar**: a one-line fill bar in the band (pastel sage → butter at 60% → rose at 85%). Click it, or run `/context-panel`, for a pane with the full breakdown by category (system prompt, tools, MCP, memory, skills, messages, free space, autocompact buffer), refreshed after every turn from a local estimate (no API calls).

The choice applies to every main-loop request (subagents keep theirs); `/model` keeps showing the session model. Switching models drops the prompt cache, so the next request costs more.

## Setup

The keys need the bindings in [`keybindings.json`](keybindings.json) merged into `~/.claude/keybindings.json`. The repository's `install.sh` does this. They borrow diff-panel actions, so they do nothing while the diff panel is open.
