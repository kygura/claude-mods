# surface

Holds every edit and commit until Claude can state what the change does to the rest of the system. When it can't work that out from the code and the session, it has to stop and ask you instead of guessing.

It ships three ways, so it works wherever you run Claude:

| Form | What it is | Use it when |
| --- | --- | --- |
| Mod | `hooks/register.ts`: a `declare` tool, a hard gate on edits and git, `/surface` | You run Claude Code with mods (this marketplace) |
| Hook | `classic/surface-gate.mjs`: a plain `PreToolUse` settings hook | Your Claude Code does not load mods, or you want it in one project's `.claude/settings.json` |
| Skill | `skills/surface/SKILL.md`: the procedure itself | Anywhere skills load, including Claude.ai and other agents. The mod installs it too |

## The rule

Before Claude changes an existing file, or runs a git command that commits, pushes, merges, rebases, resets, restores or cleans, it declares:

- **files**: every path it will change (a directory ends in `/`), plus `git` for the git commands
- **consequences**: what reads, imports, calls or deploys each change, what could break, and how it checked
- **unresolved**: the questions about intent or impact it could not answer from the code and the session

With anything unresolved, nothing is cleared: Claude must ask you, with its default for each question, and wait. Declaring again with `unresolved: none` does not get around it; only your answer does (your next message, or an answer to its AskUserQuestion). Consequences that say "not sure", "unclear" or similar count as unresolved. Thin consequences (a few words) and wildcards are refused.

A clearance covers the declared files until your next message, so each instruction gets its own declaration. New files are free unless they replace an existing one. Subagents keep their own clearances and, since they can't ask you, return their open questions in their report.

## Where the mod hooks

| Event | What happens |
| --- | --- |
| `session.start` | Registers the `mcp__surface__declare` tool and the `/surface` command. |
| `prompt.compose` | The protocol goes into the system prompt, so Claude declares before it is refused. |
| `prompt.submit` | Your message answers any open questions and ends the current clearances. |
| `tool.call` | **The gate.** `Edit`, `Write`, `MultiEdit` and `NotebookEdit` on undeclared files are refused. So are git commit, push, merge, rebase, cherry-pick, revert, am, apply, pull, reset `--hard`, restore, `checkout --`, clean `-f`, stash drop/pop/clear, tag and `gh pr merge` without `git` declared, and `sed -i`, `perl -i` and `>`/`>>` into existing files. A failing gate holds the change. |
| `agent.spawn` | Subagents get the protocol in their brief. |

## Settings

- `/surface off`, `/surface on`, `/surface` for status and current clearances, `/surface clear` to drop them. On/off is kept across sessions.
- `ignore_paths`: path fragments never held. Default `/tmp/,.claude/plans/,.claude/memory/`.
- `allow_new_files` (default on): creating a file that does not exist yet needs no declaration.
- `gate_shell_edits` (default on): also hold in-place shell edits of existing files.
- `reset_on_prompt` (default on): clearances end with your next message.

## Install

Mod (and skill):

```
/plugin install surface --marketplace kygura/claude-mods
```

Hook only: copy this folder to `~/.claude/hooks/surface` (the hook imports `hooks/core.mjs`, so keep both) and merge [`classic/settings.json`](classic/settings.json) into `~/.claude/settings.json`, or a project's `.claude/settings.json`. Needs Node 18 or newer. With the hook, Claude declares by writing a block in its reply:

```
Surface:
files: src/auth/token.ts, git
consequences: token.ts is imported by login.ts and middleware.ts; ...
unresolved: none
```

`SURFACE=off` turns the hook off, `SURFACE_IGNORE` adds ignored path fragments, `SURFACE_NEW_FILES=held` gates new files too.

Skill only: copy `skills/surface` to `~/.claude/skills/surface`.

Don't run the mod and the hook together: the hook doesn't see the mod's declarations.

## Tests

```sh
claude plugin test mods/surface              # the mod
node --test mods/surface/classic/*.test.mjs  # the hook
```
