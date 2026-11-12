# strict-prose

Holds every piece of text other people will read to one plain house style, and blocks text that breaks it at the moment it is written.

## What it enforces

- No em dashes. No en dashes outside numeric ranges (`5-10`). No ` -- ` used as a dash.
- No exclamation marks. No emoji.
- No hype words (seamless, robust, elevate, leverage, delve, cutting-edge, game-changer and about 70 more, see [`hooks/rules.ts`](hooks/rules.ts)).
- No filler ("it's worth noting", "in essence", "at its core", "I hope this helps").
- No stock AI structures: "not just X, but Y", "it's not X, it's Y", "whether you're X or Y", teaser questions ("The result?"), sassy openers ("Oh,", "Spoiler:", "Here's the thing"), servile openers ("Absolutely!").

## Where it hooks

| Event | What happens |
| --- | --- |
| `prompt.compose` | The rules go into the system prompt of every request. |
| `prompt.submit` | A prompt that asks for copy (README, landing page, email, release notes, UI text, ...) gets the rules again beside it, plus anything the last reply broke. |
| `tool.call` | **Hard gate.** `Write`, `Edit` and markdown `NotebookEdit` cells on reader-facing files, `git commit`/`git tag` messages, and the body/title/message fields of publishing MCP tools (GitHub PRs and comments, Slack, Gmail, Notion, ...) are linted. Any violation refuses the call, and Claude gets the line, the rule and the fix. |
| `agent.spawn` | A subagent whose task involves copy gets the rules appended to its prompt. Its writes hit the same gate. |
| `turn.step` | Em and en dashes in chat replies are replaced with commas as they stream. |
| `turn.complete` | A chat reply is linted. If the prompt asked for copy, the reply is sent back once for a rewrite; otherwise the next prompt carries a note of what broke. |

Reader-facing files: Markdown and plain text (code blocks and links skipped), HTML and templates (tag text and alt/title/placeholder/aria-label), UI source (`.tsx .jsx .vue .svelte .astro .ts .js .swift .kt .dart`: JSX text and string literals of two or more words, never comments or identifiers), and locale files (`.po .strings .arb .xliff`, and JSON/YAML under `locales/`, `i18n/`, `messages/`, ...). Backend code (`.py`, `.go`, ...) is not checked.

## Settings

- `/strict-prose off`, `/strict-prose on`, `/strict-prose` for status. Kept across sessions.
- `ignore_paths`: comma-separated path fragments the file gate skips. Default `strict-prose/`, so this mod's own word list can be edited.
- `chat_dashes` (default on): rewrite dashes in chat as they stream.
- `auto_rewrite` (default on): send a rule-breaking reply to a copy request back once.

Install: `/plugin install strict-prose --marketplace kygura/claude-mods`
