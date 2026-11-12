import type { EngineInterface, Register } from 'claude-code'
import {
  COPY_REQUEST,
  PUBLISH_FIELDS,
  PUBLISH_TOOL,
  RULES_TEXT,
  commitMessage,
  fromMarkdown,
  lint,
  proseOf,
  report,
  type Violation,
} from './rules'

const KEY = 'enabled'
const SECTION = 'strict-prose:rules'

const summary = (v: Violation[]) => [...new Set(v.map(x => `${x.rule} ("${x.match}")`))].slice(0, 8).join(', ')

// Chat text: an em or en dash becomes a comma, a numeric en-dash range a
// hyphen, and a dash opening a line a list hyphen.
export const dashes = (s: string, lineStart = true) =>
  s
    .replace(/(\d)\u2013(\d)/g, '$1-$2')
    .replace(lineStart ? /(^|\n)([^\S\n]*)[\u2014\u2013][^\S\n]*/g : /(\n)([^\S\n]*)[\u2014\u2013][^\S\n]*/g, '$1$2- ')
    .replace(/[^\S\n]*[\u2014\u2013][^\S\n]*/g, ', ')

const enabled = async ($: EngineInterface) => (await $.store.get(KEY)) !== false

export const register: Register = (on, options) => {
  const ignore = String(options.ignore_paths ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  const chatDashes = options.chat_dashes !== false
  const autoRewrite = options.auto_rewrite !== false

  // Module state: what the last main-loop reply broke, and whether the prompt
  // that started the turn asked for copy. A reload forgets both, harmlessly.
  let lastBroke: Violation[] = []
  let copyTurn = false
  let rewrites = 0

  const ignored = (path: string) => ignore.some(p => path.includes(p))

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'strict-prose', description: 'Turn the house writing rules on or off (on, off, or no argument for status)' })
    return next(e)
  })

  on('command.run', { command: 'strict-prose' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') await $.store.set(KEY, arg === 'on')
    return { text: `strict-prose ${(await enabled($)) ? 'on' : 'off'}` }
  })

  // The rules ride in the system prompt of every request.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    if (!(await enabled($))) return r
    return { sections: [...r.sections.filter(s => s.id !== SECTION), { id: SECTION, text: RULES_TEXT, scope: 'session' as const }] }
  })

  // A prompt asking for copy gets the rules again beside it, plus whatever the
  // last reply broke.
  on('prompt.submit', async ($, e, next) => {
    if (e.command || !(await enabled($))) return next(e)
    const notes: string[] = []
    if (e.origin.kind === 'composer') {
      copyTurn = COPY_REQUEST.test(e.text)
      rewrites = 0
    }
    if (copyTurn) notes.push(`${RULES_TEXT}\nThis request is for text people will read. Every rule above applies to your reply and to anything you write to files.`)
    if (lastBroke.length) {
      notes.push(`strict-prose: your previous reply broke the house writing rules: ${summary(lastBroke)}. Do not repeat these.`)
      lastBroke = []
    }
    return notes.length ? next({ ...e, context: [...(e.context ?? []), ...notes] }) : next(e)
  })

  // Hard gate: file writes, commits and publishing tools.
  on('tool.call', async ($, e, next) => {
    if (!(await enabled($))) return next(e)
    let where = ''
    let text: string | null = null

    if (e.tool === 'Write' || e.tool === 'Edit') {
      const path = e.file_path
      if (ignored(path)) return next(e)
      text = proseOf(path, e.tool === 'Write' ? e.content : e.new_string)
      where = path
    } else if (e.tool === 'NotebookEdit') {
      if (e.cell_type === 'markdown' && !ignored(e.notebook_path)) text = fromMarkdown(e.new_source)
      where = e.notebook_path
    } else if (e.tool === 'Bash') {
      text = commitMessage(e.command)
      where = 'the commit message'
    } else if (e.tool.startsWith('mcp__') && PUBLISH_TOOL.test(e.tool)) {
      const fields = Object.entries(e as Record<string, unknown>)
        .filter(([k, v]) => PUBLISH_FIELDS.has(k) && typeof v === 'string')
        .map(([, v]) => v as string)
      text = fields.length ? fromMarkdown(fields.join('\n')) : null
      where = `the text sent with ${e.tool}`
    }

    if (!text) return next(e)
    const v = lint(text)
    if (!v.length) return next(e)
    $.ui.status(`strict-prose: blocked ${v.length} issue${v.length === 1 ? '' : 's'} in ${where.split('/').pop()}`)
    return { deny: report(where, v) }
  })

  // Subagents that will write copy get the rules in their brief.
  on('agent.spawn', async ($, e, next) => {
    if (e.resume || !(await enabled($)) || !COPY_REQUEST.test(`${e.description}\n${e.prompt}`)) return next(e)
    return next({ ...e, prompt: `${e.prompt}\n\n${RULES_TEXT}` })
  })

  // Chat replies: dashes are rewritten as they stream on the main loop.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined || !chatDashes || !(await enabled($))) return yield* next(e)
    const stream = next(e)
    let held = ''
    let heldIndex = -1
    let lineEnded = true
    for await (const c of stream) {
      if (c.kind !== 'text') {
        held = ''
        yield c
        continue
      }
      // Whitespace at a chunk's end waits for the next chunk of the same block,
      // so a dash opening that chunk does not leave "word ," behind.
      const same = c.index === heldIndex
      let text = dashes(same ? held + c.text : c.text, !same || lineEnded)
      heldIndex = c.index
      held = text.match(/[^\S\n]+$/)?.[0] ?? ''
      if (held.length === text.length) held = ''
      if (held) text = text.slice(0, -held.length)
      if (text) lineEnded = text.endsWith('\n')
      yield text === c.text ? c : { ...c, text }
    }
    return await stream.result
  })

  // After a main-loop reply: what it broke is fed back on the next prompt, and a
  // reply to a copy request is sent back for one rewrite.
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined || e.reason !== 'answer' || !(await enabled($))) return r
    const v = lint(fromMarkdown(e.answer)).filter(x => !(chatDashes && (x.rule === 'em dash' || x.rule === 'en dash')))
    if (!v.length) return r
    if (copyTurn && autoRewrite && rewrites < 1) {
      rewrites++
      $.ui.toast(`strict-prose: reply broke ${v.length} rule${v.length === 1 ? '' : 's'}, asking for a rewrite`)
      await $.prompt.submit({
        text: `${report('Your last reply', v)}\nRewrite the whole reply so it follows every house writing rule. Output only the rewritten reply.`,
      })
    } else {
      lastBroke = v
      $.ui.toast(`strict-prose: reply broke ${summary(v)}`)
    }
    return r
  })
}
