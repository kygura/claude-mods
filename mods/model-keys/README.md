# model-keys

A band above the Claude Code prompt for switching the model and the effort level of the main conversation, without typing `/model` or `/effort`.

- **Click** any model (`default`, `haiku`, `sonnet`, `opus`, `fable`) or effort level (`low` to `max`). The current pick is a filled chip.
- **`ctrl+alt+↑/↓`** steps through models, **`ctrl+alt+←/→`** steps the effort level. `reset` returns to the session defaults.
- Each reply starts with the model it was sent to, as `[claude-sonnet-5-5]`, written by the mod into the message (not claimed by the model). Shown once per turn, again if the model changes mid-turn.
- **Context pane**: opens at session start (or run `/context-panel`) with the context fill (pastel sage → butter at 60% → rose at 85%), the turn count, a bar and legend broken down by category (system prompt, tools, MCP, memory, skills, messages, free space, autocompact buffer), and `c` / `x` buttons that run `/compact` and `/clear`. The headline figure is the status line's (the last response's input tokens against the model's window); the categories are a local estimate (no API calls).

The choice applies to every main-loop request (subagents keep theirs); `/model` keeps showing the session model. Switching models drops the prompt cache, so the next request costs more.

## Setup

The keys need the bindings in [`keybindings.json`](keybindings.json) merged into `~/.claude/keybindings.json`. The repository's `install.sh` does this. They borrow diff-panel actions, so they do nothing while the diff panel is open.

## Cloud sessions

A cloud session shown in the Claude app (web, desktop or mobile) currently attaches no drawing surface: `$.session.surfaces()` is empty and the engine sends no `ui.render` request, so the band and the context pane cannot show. Status, toast and log lines (`$.ui.status`, `$.ui.toast`, `$.ui.log`) do not reach the app either. Hooks still run, and text the mod writes into a reply does show.

So while no surface is attached, the reply stamp carries what the band would show: `[claude-opus-5-5 · effort high · ctx 42% of 200k]` instead of `[claude-opus-5-5]`. Once a surface attaches, the stamp goes back to the model name alone.
