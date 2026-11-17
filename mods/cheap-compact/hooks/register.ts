import type { Register, SessionMessage } from 'claude-code'

// Model that writes the summary. An alias ('haiku', 'sonnet') or a full id.
const MODEL = 'haiku'
// Per-block cap so huge tool outputs don't dominate the summarizer's input.
const MAX_BLOCK = 4000
const MAX_SUMMARY_TOKENS = 16000

const SYSTEM = `You compact a coding-agent conversation so work can continue in a fresh context.
Write a dense, factual summary. Keep: the user's goals and explicit instructions (verbatim where short),
decisions made and why, files touched with what changed, commands run and their outcomes, errors hit and
how they were fixed, open questions, and the exact next step. Drop pleasantries and anything superseded.
Use headed sections. Never invent details.`

const clip = (s: string) =>
  s.length > MAX_BLOCK ? `${s.slice(0, MAX_BLOCK)}\n…[${s.length - MAX_BLOCK} chars cut]` : s

const render = (messages: readonly SessionMessage[]) =>
  messages
    .map(m => {
      const parts: string[] = []
      if (m.text) parts.push(clip(m.text))
      for (const t of m.toolUses) parts.push(`[tool call] ${clip(JSON.stringify(t))}`)
      for (const r of m.toolResults ?? [])
        parts.push(`[tool result${r.isError ? ', error' : ''}] ${clip(r.text)}`)
      return parts.length ? `### ${m.role}\n${parts.join('\n')}` : ''
    })
    .filter(Boolean)
    .join('\n\n')

export const register: Register = on => {
  on('session.compact', async ($, e, next) => {
    // Leave subagents' own compactions to the engine.
    if (e.agentId) return next(e)

    const focus = e.instructions ? `\n\nThe user asked the summary to focus on: ${e.instructions}` : ''
    const r = await $.model.complete({
      model: MODEL,
      system: SYSTEM,
      prompt: `<transcript>\n${render(e.messages)}\n</transcript>\n\nSummarize this conversation.${focus}`,
      maxTokens: MAX_SUMMARY_TOKENS,
      effort: 'low',
      timeoutMs: 180_000,
    })

    // Anything goes wrong: fall back to the engine's normal compaction.
    if (!r.isAnswered) {
      $.ui.toast(`cheap-compact: ${MODEL} failed (${r.reason}), using main model`)
      return next(e)
    }

    if (e.trigger !== 'precompute') {
      const inTok = r.usage.input_tokens + r.usage.cache_read_input_tokens + r.usage.cache_creation_input_tokens
      $.ui.toast(`compacted on ${MODEL}: ${inTok} in / ${r.usage.output_tokens} out`)
    }

    return {
      messages: [
        {
          role: 'user',
          text: `This session was compacted. Summary of the earlier conversation:\n\n${r.text}`,
          toolUses: [],
        },
      ],
      usage: r.usage,
    }
  }).catch(($, e, next) => next(e))
}
