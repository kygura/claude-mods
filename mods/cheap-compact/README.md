# cheap-compact

Runs compaction on Haiku instead of your session's main model. By default `/compact` and auto-compaction send the whole transcript back to the model you're working with (Opus, Fable) and bill the summary at that model's output rate. This mod answers the compaction itself with one Haiku call.

## Where it hooks

| Event | What happens |
| --- | --- |
| `session.compact` | For the main conversation (`manual`, `auto`, `precompute`), the transcript is rendered to text, each block cut at 4K chars, and summarized by Haiku at low effort. The summary replaces the history. Text after `/compact` is passed on as the focus. Subagent compactions are left to the engine. |

A toast shows the summarizer's token counts. If the Haiku call fails, the engine's normal compaction runs instead.

## Cost

Haiku 5.5 is $0.10/M input and $0.50/M output. Opus 5.5 compaction reads the transcript from cache at $0.20/M and writes the summary at $20/M, so Haiku is cheaper on both sides even without a cache hit.

## Trade-offs

- Haiku's summary is less careful than Opus's on long, tangled sessions. Change `MODEL` in `hooks/register.ts` to `'sonnet'` for a middle ground.
- Tool results over 4K characters reach the summarizer truncated.
- Only the summary is kept; no recent messages are carried over verbatim.

Install: `/plugin install cheap-compact --marketplace kygura/claude-mods`
