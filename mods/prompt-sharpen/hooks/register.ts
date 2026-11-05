import type { Register } from 'claude-code'
import { SYSTEM, skip, unescape } from './sharpen'

const KEY = 'enabled'
const MODEL = 'haiku'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'sharpen', description: 'Toggle auto-rewriting prompts for explicitness' })
    return next(e)
  })

  on('command.run', { command: 'sharpen' }, async $ => {
    const enabled = (await $.store.get(KEY)) === false
    await $.store.set(KEY, enabled)
    return { text: `prompt-sharpen ${enabled ? 'on' : 'off'}` }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta || e.origin.kind !== 'composer') return next(e)
    if (skip(e.text) || (await $.store.get(KEY)) === false) return next({ ...e, text: unescape(e.text) })

    const r = await $.model.complete({ model: MODEL, system: SYSTEM, prompt: e.text, effort: 'low', timeoutMs: 10000 })
    const text = r.isAnswered ? r.text.trim() : ''
    if (!text || text === e.text.trim()) return next(e)

    // The main model still sees the original wording, so a bad rewrite can't silently change intent.
    const original = `The user's message was auto-rewritten for explicitness. Their original wording:\n${e.text}`
    return next({ ...e, text, context: [...(e.context ?? []), original] })
  })
}
