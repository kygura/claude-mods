// Shared, pure logic for the Surface mod (hooks/register.ts) and the
// standalone settings hook (classic/surface-gate.mjs). No engine, no Node.

/** The clearance entry that covers git commands that change history or the working tree. */
export const GIT = 'git'

const HUMAN_ORIGINS = new Set(['composer', 'bridge', 'sdk'])
/** Whether a prompt came from the developer (and so answers a pending question). */
export const fromDeveloper = origin => HUMAN_ORIGINS.has(origin?.kind)

// Wording that admits the consequences are not worked out. A declaration that
// says it is unsure counts as having unresolved questions.
const HEDGE = /\b(not sure|unsure|unclear|don'?t know|do not know|no idea|can'?t tell|cannot tell|not certain|uncertain)\b/i

const NONE = /^(none|no|nothing|n\/a|-|—)?\.?$/i

/** Splits a comma, semicolon or newline separated list, or passes an array through. */
export const list = v =>
  (Array.isArray(v) ? v : String(v ?? '').split(/[,;\n]/))
    .map(s => String(s).trim().replace(/^[-*]\s+/, '').replace(/^`|`$/g, ''))
    .filter(s => s && !NONE.test(s))

/**
 * Checks one declaration. Returns { files, unresolved, problem }: `problem` is
 * set when it cannot clear anything (too thin, or hedged without listing what
 * is open), `unresolved` holds the questions the developer must answer.
 */
export function check(decl) {
  const files = list(decl.files)
  const consequences = String(decl.consequences ?? '').trim()
  const unresolved = list(decl.unresolved)
  if (!files.length) return { files, unresolved, problem: 'it names no files. List every path you will change (a directory ends in /), plus "git" for commits, pushes, merges, resets.' }
  if (files.some(f => f === '*' || f === '**' || f === '.' || f === './')) return { files, unresolved, problem: 'a wildcard covers nothing. Name the files or directories.' }
  if (consequences.length < 40) return { files, unresolved, problem: 'the consequences are too thin. Say what reads or depends on each change, what could break, and how you checked.' }
  if (!unresolved.length && HEDGE.test(consequences)) {
    unresolved.push(`The consequences say: "${consequences.match(HEDGE)[0]}". Resolve it or ask.`)
  }
  return { files, unresolved, problem: null }
}

const trimSlash = p => p.replace(/^\.\//, '').replace(/\/+$/, '')

/** Whether a declared entry covers a path (absolute or relative to cwd). */
export function covers(entry, path, cwd = '') {
  if (entry === GIT) return false
  const abs = path.startsWith('/') ? path : `${cwd.replace(/\/+$/, '')}/${trimSlash(path)}`
  const isDir = entry.endsWith('/')
  const e = trimSlash(entry)
  if (!e) return false
  const target = e.startsWith('/') ? e : `${cwd.replace(/\/+$/, '')}/${e}`
  if (abs === target) return true
  if (isDir && abs.startsWith(`${target}/`)) return true
  // A bare relative entry also matches the same path below another root
  // ("src/a.ts" covers "/repo/src/a.ts" when cwd is elsewhere).
  if (!e.startsWith('/') && (abs.endsWith(`/${e}`) || (isDir && abs.includes(`/${e}/`)))) return true
  return false
}

export const anyCovers = (entries, path, cwd) => entries.some(f => covers(f, path, cwd))

// A small shell tokenizer: words, with quotes removed, split at ; && || | and newlines.
export function segments(command) {
  const out = [[]]
  let word = ''
  let quoted = false
  let inWord = false
  let q = null
  const push = () => {
    if (inWord) out.at(-1).push({ text: word, quoted })
    word = ''
    quoted = false
    inWord = false
  }
  for (let i = 0; i < command.length; i++) {
    const c = command[i]
    if (q) {
      if (c === q) q = null
      else if (c === '\\' && q === '"' && i + 1 < command.length) word += command[++i]
      else word += c
      continue
    }
    if (c === "'" || c === '"') { q = c; quoted = true; inWord = true; continue }
    if (c === '\\' && i + 1 < command.length) { word += command[++i]; inWord = true; continue }
    if (c === ';' || c === '\n' || c === '|' || c === '&' || c === '(' || c === ')') {
      push()
      if ((c === '&' || c === '|') && command[i + 1] === c) i++
      if (c === '&' && command[i - 1] === '>') continue
      if (out.at(-1).length) out.push([])
      continue
    }
    if (c === '>' || c === '<') {
      push()
      let op = c
      if (command[i + 1] === c) op += command[++i]
      if (command[i + 1] === '&') { op += '&'; i++ }
      out.at(-1).push({ text: op, op: true })
      continue
    }
    if (/\s/.test(c)) { push(); continue }
    word += c
    inWord = true
  }
  push()
  return out.filter(s => s.length)
}

// git subcommands that change history, a remote, or throw work away.
const GIT_WRITE = new Set(['commit', 'push', 'merge', 'rebase', 'cherry-pick', 'revert', 'am', 'apply', 'pull'])
const ENV_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/

const words = seg => {
  const w = seg.filter(t => !t.op).map(t => t.text)
  while (w.length && (ENV_ASSIGN.test(w[0]) || ['sudo', 'command', 'env', 'time', 'nohup', 'exec'].includes(w[0]))) w.shift()
  return w
}

/** The git operation a command runs that needs a "git" clearance, or null. */
export function gitWrite(command) {
  for (const seg of segments(command)) {
    const w = words(seg)
    if (w[0] === 'gh' && w[1] === 'pr' && w[2] === 'merge') return 'gh pr merge'
    if (w[0] !== 'git') continue
    let i = 1
    while (i < w.length && w[i].startsWith('-')) i += ['-C', '-c', '--git-dir', '--work-tree'].includes(w[i]) ? 2 : 1
    const sub = w[i]
    const rest = w.slice(i + 1)
    if (GIT_WRITE.has(sub)) return `git ${sub}`
    if (sub === 'reset' && rest.includes('--hard')) return 'git reset --hard'
    if (sub === 'clean' && rest.some(a => /^-[a-z]*f/.test(a) || a === '--force')) return 'git clean'
    if (sub === 'restore' || (sub === 'checkout' && rest.includes('--'))) return `git ${sub}`
    if (sub === 'stash' && ['drop', 'clear', 'pop'].includes(rest[0])) return `git stash ${rest[0]}`
    if (sub === 'tag' && rest.length && !rest.some(a => a === '-l' || a === '--list')) return 'git tag'
  }
  return null
}

const SAFE_TARGET = /^(\/dev\/|\/tmp\/|\/proc\/)|^&?\d*$/

/**
 * Files a command edits in place: sed -i / perl -i targets and > / >> redirect
 * targets. Paths only; whether each exists is the caller's question.
 */
export function shellEdits(command) {
  const out = []
  for (const seg of segments(command)) {
    for (let i = 0; i < seg.length; i++) {
      const t = seg[i]
      if (t.op && (t.text === '>' || t.text === '>>') && seg[i + 1] && !seg[i + 1].op) {
        const target = seg[i + 1].text
        if (!SAFE_TARGET.test(target)) out.push(target)
      }
    }
    const w = words(seg)
    const cmd = w[0]
    if (cmd !== 'sed' && cmd !== 'perl' && cmd !== 'gsed') continue
    const inPlace = w.some(a => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))
    if (!inPlace) continue
    // After the flags: the script (unless given with -e), then the files.
    const toks = seg.filter(t => !t.op)
    let scriptGiven = false
    const files = []
    for (let i = 1; i < toks.length; i++) {
      const a = toks[i].text
      if (a === '-e' || a === '--expression' || a === '-f') { scriptGiven = true; i++; continue }
      if (a.startsWith('-')) continue
      if (!scriptGiven) { scriptGiven = true; continue }
      files.push(a)
    }
    out.push(...files.filter(f => !SAFE_TARGET.test(f)))
  }
  return [...new Set(out)]
}

/**
 * Finds the last Surface block in assistant prose:
 *
 *   Surface:
 *   files: src/a.ts, src/b.ts, git
 *   consequences: ...
 *   unresolved: none
 *
 * Fields may be bulleted, bolded, and run onto following lines.
 */
export function parseBlock(text) {
  const lines = String(text).split('\n')
  let found = null
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*(?:#+\s*)?\**surface\**\s*:?\**\s*$/i.test(lines[i])) continue
    const decl = { files: '', consequences: '', unresolved: '' }
    let field = null
    let any = false
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j].replace(/^\s*[-*]\s+/, '').replace(/\*\*/g, '')
      const m = line.match(/^\s*(files|consequences|unresolved)\s*:\s*(.*)$/i)
      if (m) {
        field = m[1].toLowerCase()
        decl[field] = m[2]
        any = true
        continue
      }
      if (!line.trim()) { if (any && field !== 'consequences') break; continue }
      if (!field) break
      decl[field] += `\n${line}`
    }
    if (any) found = decl
  }
  return found
}
