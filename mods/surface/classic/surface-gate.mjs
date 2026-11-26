#!/usr/bin/env node
// Surface as a plain Claude Code settings hook (PreToolUse), for setups that
// do not load mods. Same rule as the mod, with the declaration written in
// Claude's reply instead of a tool call:
//
//   Surface:
//   files: src/auth.ts, git
//   consequences: what reads it, what could break, how it was checked
//   unresolved: none
//
// It reads the session transcript, takes every Surface block Claude wrote
// since the developer's last message, and refuses Edit, Write, MultiEdit,
// NotebookEdit, git commits/pushes/merges/resets and in-place shell edits of
// files those blocks do not clear. Open questions hold everything until the
// developer answers (a new message, or an AskUserQuestion reply).
//
// Env: SURFACE=off disables it. SURFACE_IGNORE adds comma-separated path
// fragments to skip. SURFACE_NEW_FILES=held gates new files too.

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { GIT, anyCovers, check, fromDeveloper, gitWrite, list, parseBlock, shellEdits } from '../hooks/core.mjs'

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const DEFAULT_IGNORE = ['/tmp/', '.claude/plans/', '.claude/memory/']

const textOf = content =>
  typeof content === 'string' ? content : Array.isArray(content) ? content.filter(b => b?.type === 'text').map(b => b.text).join('\n') : ''

function isDeveloperPrompt(entry) {
  if (entry.type !== 'user' || entry.isMeta || entry.isCompactSummary) return false
  const c = entry.message?.content
  if (Array.isArray(c) && c.length && c.every(b => b?.type === 'tool_result')) return false
  return entry.origin ? fromDeveloper(entry.origin) : true
}

/** Folds the transcript since the developer's last message into { files, pending }. */
export function state(entries) {
  let start = 0
  entries.forEach((e, i) => {
    if (isDeveloperPrompt(e)) start = i + 1
  })
  const files = []
  let pending = []
  const asks = new Set()
  for (const e of entries.slice(start)) {
    const content = e.message?.content
    if (e.type === 'assistant') {
      for (const b of Array.isArray(content) ? content : []) {
        if (b?.type === 'tool_use' && b.name === 'AskUserQuestion') asks.add(b.id)
      }
      const block = parseBlock(textOf(content))
      if (!block) continue
      const r = check(block)
      if (r.problem) continue
      if (r.unresolved.length) pending = r.unresolved
      else if (!pending.length) files.push(...r.files)
    } else if (e.type === 'user' && Array.isArray(content)) {
      if (content.some(b => b?.type === 'tool_result' && asks.has(b.tool_use_id) && !b.is_error)) pending = []
    }
  }
  return { files: [...new Set(files)], pending }
}

function transcriptFor(input) {
  if (input.agent_transcript_path) return input.agent_transcript_path
  const main = input.transcript_path
  if (input.agent_id && main) {
    const sub = join(dirname(main), basename(main, '.jsonl'), 'subagents', `agent-${input.agent_id}.jsonl`)
    if (existsSync(sub)) return sub
  }
  return main
}

function read(path) {
  if (!path || !existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap(l => {
      try {
        return [JSON.parse(l)]
      } catch {
        return []
      }
    })
}

const HOW =
  'State the consequences first. In your reply, before the change, write a block:\n\nSurface:\nfiles: <every path you will change; a directory ends in /; add "git" for commits, pushes, merges, resets>\nconsequences: <what reads, imports, calls or deploys each change, what could break, how you checked>\nunresolved: <questions about intent or impact you could not answer from the code and this session, or none>\n\nIf anything is unresolved, ask the developer and wait for the answer before changing files.'

/** Decides one PreToolUse call: a deny reason, or null to let it through. */
export function decide(input, entries, exists = existsSync) {
  if (process.env.SURFACE === 'off') return null
  const tool = input.tool_name
  const args = input.tool_input ?? {}
  const cwd = input.cwd ?? process.cwd()
  const ignore = [...DEFAULT_IGNORE, ...list(process.env.SURFACE_IGNORE ?? '')]
  const ignored = p => ignore.some(f => p.includes(f))
  const abs = p => (isAbsolute(p) ? p : resolve(cwd, p))

  const isEdit = EDIT_TOOLS.has(tool)
  const git = tool === 'Bash' ? gitWrite(String(args.command ?? '')) : null
  const shell = tool === 'Bash' ? shellEdits(String(args.command ?? '')).filter(p => !ignored(p) && exists(abs(p))) : []
  if (!isEdit && !git && !shell.length) return null

  const { files, pending } = state(entries)
  const held = what =>
    pending.length
      ? `surface: ${what} is held. Questions are still open:\n${pending.map(q => `- ${q}`).join('\n')}\nAsk the developer and wait for their answer, then write a new Surface block with their decision.`
      : `surface: ${what} is not cleared. ${HOW}`

  if (isEdit) {
    const path = String(args.file_path ?? args.notebook_path ?? '')
    if (!path || ignored(path)) return null
    if (pending.length) return held(path)
    if (anyCovers(files, path, cwd)) return null
    if (tool === 'Write' && process.env.SURFACE_NEW_FILES !== 'held' && !exists(abs(path))) return null
    return held(path)
  }
  if (git && (pending.length || !files.includes(GIT))) return held(`"${git}" (add "git" to files)`)
  for (const p of shell) if (pending.length || !anyCovers(files, p, cwd)) return held(p)
  return null
}

async function main() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    return
  }
  if (input.hook_event_name && input.hook_event_name !== 'PreToolUse') return
  const reason = decide(input, read(transcriptFor(input)))
  if (!reason) return
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }),
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) main()
