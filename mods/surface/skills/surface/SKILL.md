---
name: surface
description: Use before any change to a codebase (Edit, Write, a refactor, a migration, a dependency bump, a commit, a push). Work out what the change does to the rest of the system first; when the ramifications can't be resolved from the code and this session, stop and ask the developer instead of assuming.
---

# Surface

A model that edits code it has not traced breaks things it never looked at. Surface makes the consequences of a change explicit before the change happens, and turns every consequence you cannot work out into a question for the developer.

## When it applies

Before you change a file that already exists, and before any git command that commits, pushes, merges, rebases, resets, restores or cleans. Creating a brand new file that nothing references yet is exempt. Reading, searching and running tests are always free.

## The procedure

1. **Trace.** For each file you are about to change, find what depends on it: who imports it, calls the function, reads the config key, queries the column, renders the component, consumes the API, runs the script in CI or deploys it. Use grep, the references the language server gives you, the tests, the build and deploy config. Do this before writing a line.
2. **State the consequences.** For each change: what will behave differently, who notices, what could break, and how you checked. "Callers keep working" counts only if you read the callers.
3. **Sort what you could not settle.** Anything you could not answer from the code and this session is unresolved. Typical ones:
   - the intent is ambiguous (two readings of the request lead to different code)
   - something outside the repo may depend on this (a mobile client, a cron job, a partner integration, data already in production)
   - the change removes or renames something public, changes a schema, a wire format, a default or a permission
   - the fix works but you are choosing between behaviours the developer may care about
   - you would have to guess at an environment, credential, or deploy step
4. **If anything is unresolved, stop and ask.** Interrupt your own flow. Ask the developer the open questions, one line each, and say what you would do by default so they can just say yes. Use AskUserQuestion when it is available; otherwise end your turn with the questions. Do not edit first and ask after. Do not pick the reading you like and mention it at the end.
5. **If nothing is unresolved, declare and proceed.** Make only the changes you described. If the work grows past them (a new file to touch, a caller you did not expect), go back to step 1 for the new part.

A subagent cannot reach the developer. It stops at step 4 and returns the questions, with its default for each, in its final report; the orchestrator asks.

## Declaring

How you declare depends on what is installed. Both forms carry the same three fields: **files** (every path you will change, a directory ends in `/`, plus `git` for the git commands above), **consequences**, and **unresolved** (`none` only when there are none).

- **Surface mod installed** (the `mcp__surface__declare` tool exists): call it. With open questions it clears nothing and holds every edit until the developer has answered.
- **Surface hook installed** (edits are refused with a `surface:` message): write the block in your reply before the change:

  ```
  Surface:
  files: src/auth/token.ts, src/routes/login.ts, git
  consequences: token.ts is imported by login.ts and middleware.ts. The new expiry check rejects tokens older than 24h; login.ts already refreshes on 401, so web sessions recover. Checked with grep and the auth tests.
  unresolved: none
  ```

- **Skill only**: write the same block anyway. It costs a few lines and the developer can stop you before the edit.

A clearance lasts until the developer's next message. A new instruction gets a new declaration.

## What a good question looks like

Short, decidable, with your default:

> The `legacy_token` column is still read by `scripts/backfill.py`. Drop it now, or keep it until the backfill is retired? I'd keep it.

Not: "Is it OK if I make some changes to auth?"

## What not to do

- Do not declare files you have not traced to get past the gate.
- Do not write "unresolved: none" while the consequences say "probably", "not sure" or "I assume". Those are open questions.
- Do not turn every edit into a question. When the code answers it, decide and say what you decided in the consequences.
