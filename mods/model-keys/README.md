# model-keys

A band above the Claude Code prompt for watching context usage and switching the model and the effort level of the main conversation, without typing `/model` or `/effort`.

- **Click** any model (`default`, `haiku`, `sonnet`, `opus`, `fable`) or effort level (`low` to `max`). The current pick is a filled chip.
- **`ctrl+alt+↑/↓`** steps through models, **`ctrl+alt+←/→`** steps the effort level. `reset` returns to the session defaults.
- Each reply starts with the model it was sent to, as `[claude-sonnet-5-5]`, written by the mod into the message (not claimed by the model). Shown once per turn, again if the model changes mid-turn.
- **Context bar**: a one-line fill bar in the band (pastel sage → butter at 60% → rose at 85%). Click it, or run `/context-panel`, for a pane with the full breakdown by category (system prompt, tools, MCP, memory, skills, messages, free space, autocompact buffer), refreshed after every turn from a local estimate (no API calls).

The choice applies to every main-loop request (subagents keep theirs); `/model` keeps showing the session model. Switching models drops the prompt cache, so the next request costs more.

## Setup

The keys need the bindings in [`keybindings.json`](keybindings.json) merged into `~/.claude/keybindings.json`. The repository's `install.sh` does this. They borrow diff-panel actions, so they do nothing while the diff panel is open.

## Cloud sessions

A cloud session shown in the Claude app (web, desktop or mobile) currently attaches no drawing surface: `$.session.surfaces()` is empty and the engine sends no `ui.render` request, so the band and the context pane cannot show. Hooks still run. While no surface is attached, model-keys puts what the band would show into two places:

- The reply stamp: `[claude-opus-5-5 · effort high · ctx 42% of 200k]` instead of `[claude-opus-5-5]`.
- The status line, through `$.ui.status`. Whether the app shows it has not been confirmed.

The stamp goes back to the model name alone, and the status line clears, once a surface attaches.
