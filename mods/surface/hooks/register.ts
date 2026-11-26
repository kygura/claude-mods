import type { EngineInterface, Register } from 'claude-code'
import { GIT, anyCovers, check, fromDeveloper, gitWrite, list, shellEdits } from './core.mjs'

const KEY = 'enabled'
const SECTION = 'surface:protocol'
const DECLARE = 'mcp__surface__declare'
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

const PROTOCOL = `Surface is on. Before you change code you must be able to state what the change does to the rest of the system.

Before the first Edit, Write, MultiEdit or NotebookEdit of a file, or a git command that commits, pushes, merges, rebases, resets or discards work, call ${DECLARE} with:
- files: every path you will change (a directory ends in /), plus "git" if you will run one of those git commands.
- consequences: what reads, imports, calls or deploys each change, what could break, and how you checked (files read, greps run, tests).
- unresolved: every question about intent or impact you could not answer from the code and this session. Empty only when there are none.

If unresolved is not empty, nothing is cleared. Stop and ask the developer (AskUserQuestion, or end your turn with the question), say what you would do by default, and declare again with their answer. Do not guess past an open question. A subagent cannot ask: it stops and returns the question in its report.

A clearance lasts until the developer's next message. New files are free unless they replace an existing one.`

type Loop = { files: string[]; pending: string[] }

const enabled = async ($: EngineInterface) => (await $.store.get(KEY)) !== false

function refuse($: EngineInterface, what: string, pending: string[]) {
  $.ui.status(`surface: held ${what.split('/').pop()}`)
  if (pending.length) {
    return {
      deny: `surface: ${what} is held. Questions are still open:\n${pending.map(q => `- ${q}`).join('\n')}\nAsk the developer and wait for the answer. Do not change files until they reply; then call ${DECLARE} again with their decision.`,
    }
  }
  return {
    deny: `surface: ${what} is not cleared. Before changing it, work out its consequences: read what imports, calls, tests or deploys it, then call ${DECLARE} with files, consequences and unresolved. If you cannot work them out from the code and this session, list the open questions under unresolved and ask the developer.`,
  }
}

export const register: Register = (on, options) => {
  const ignore = list(options.ignore_paths ?? '')
  const allowNewFiles = options.allow_new_files !== false
  const gateShell = options.gate_shell_edits !== false
  const perPrompt = options.reset_on_prompt !== false

  // Clearances per agent loop ('main' or a subagent's id). Module state: a
  // reload forgets them and Claude declares again, which is the safe side.
  const loops = new Map<string, Loop>()
  const loop = (id?: string) => {
    const key = id ?? 'main'
    let l = loops.get(key)
    if (!l) loops.set(key, (l = { files: [], pending: [] }))
    return l
  }
  const ignored = (path: string) => ignore.some(p => path.includes(p))

  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'declare',
      isDeferred: false,
      description:
        'Surface: state the consequences of a code change before making it. Clears the listed files (and "git" for commits, pushes, merges, resets) for Edit, Write and git until the developer next writes. With open questions under unresolved, clears nothing: ask the developer instead.',
      inputSchema: {
        type: 'object',
        properties: {
          files: { type: 'array', items: { type: 'string' }, description: 'Paths you will change; a directory ends in /. Add "git" to cover commit, push, merge, rebase, reset --hard, restore, clean.' },
          consequences: { type: 'string', description: 'What reads, imports, calls or deploys each change, what could break, and how you checked.' },
          unresolved: { type: 'array', items: { type: 'string' }, description: 'Questions about intent or impact you could not answer from the code and this session. Empty only when there are none.' },
        },
        required: ['files', 'consequences', 'unresolved'],
      },
    })
    await $.command.register({ name: 'surface', description: 'Surface gate: on, off, clear, or no argument for status', argumentHint: '[on|off|clear]' })
    return next(e)
  })

  on('command.run', { command: 'surface' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') await $.store.set(KEY, arg === 'on')
    if (arg === 'clear') loops.clear()
    const main = loop()
    const lines = [`surface ${(await enabled($)) ? 'on' : 'off'}`]
    if (main.files.length) lines.push(`cleared: ${main.files.join(', ')}`)
    if (main.pending.length) lines.push(`open questions: ${main.pending.join(' | ')}`)
    return { text: lines.join('\n') }
  })

  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    if (!(await enabled($))) return r
    return { sections: [...r.sections.filter(s => s.id !== SECTION), { id: SECTION, text: PROTOCOL, scope: 'session' as const }] }
  })

  // The developer's message answers open questions and starts a fresh scope.
  on('prompt.submit', async ($, e, next) => {
    if (!e.command && fromDeveloper(e.origin)) {
      const main = loop()
      main.pending = []
      if (perPrompt) main.files = []
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const args = e as unknown as Record<string, unknown>
    const id = e.agentId

    if (tool === DECLARE) {
      const l = loop(id)
      const { files, unresolved, problem } = check(args)
      if (problem) return { result: `Not cleared: ${problem}` }
      if (unresolved.length) {
        l.pending = unresolved
        return {
          result: `Not cleared. Open questions:\n${unresolved.map(q => `- ${q}`).join('\n')}\n${
            id ? 'You are a subagent: stop here and return these questions, with what you would do by default, in your final report.' : 'Ask the developer now (AskUserQuestion, or end your turn with the questions) and say what you would do by default. Declare again once they answer.'
          }`,
        }
      }
      if (l.pending.length) {
        return { result: `Not cleared: questions from your last declaration are still open and the developer has not answered them:\n${l.pending.map(q => `- ${q}`).join('\n')}\nAsk them first.` }
      }
      l.files = [...new Set([...l.files, ...files])]
      $.ui.status(`surface: cleared ${files.length} item${files.length === 1 ? '' : 's'}`)
      return { result: `Cleared: ${files.join(', ')}. Make only the changes you described; if the work grows past them, declare again.` }
    }

    if (!(await enabled($))) return next(e)

    // An answered question from the developer lifts the hold.
    if (tool === 'AskUserQuestion') {
      const r = await next(e)
      if (!r.deny && !r.isError) loop(id).pending = []
      return r
    }

    const l = loop(id)
    const cwd = await $.session.cwd()

    if (EDIT_TOOLS.has(tool)) {
      const path = String(args.file_path ?? args.notebook_path ?? '')
      if (!path || ignored(path)) return next(e)
      if (l.pending.length) return refuse($, path, l.pending)
      if (anyCovers(l.files, path, cwd)) return next(e)
      if (tool === 'Write' && allowNewFiles && !(await $.fs.exists(path))) {
        l.files.push(path)
        return next(e)
      }
      return refuse($, path, [])
    }

    if (tool === 'Bash') {
      const command = String(args.command ?? '')
      const git = gitWrite(command)
      if (git) {
        if (l.pending.length) return refuse($, git, l.pending)
        if (!l.files.includes(GIT)) return refuse($, `"${git}" (declare "git")`, [])
      }
      if (gateShell) {
        for (const path of shellEdits(command)) {
          if (ignored(path) || anyCovers(l.files, path, cwd)) continue
          if (!(await $.fs.exists(path))) continue
          return refuse($, path, l.pending)
        }
      }
    }
    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'surface: its gate failed, so the change is held. Run /surface off to bypass.' }))

  on('agent.spawn', async ($, e, next) => {
    if (e.resume || !(await enabled($))) return next(e)
    return next({ ...e, prompt: `${e.prompt}\n\n${PROTOCOL}` })
  })
}
