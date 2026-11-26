// node --test mods/surface/classic
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { decide, state } from './surface-gate.mjs'

const GATE = fileURLToPath(new URL('./surface-gate.mjs', import.meta.url))
const user = text => ({ type: 'user', message: { role: 'user', content: text } })
const say = text => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })
const use = (id, name, input = {}) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } })
const result = id => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } })

const BLOCK = (files, unresolved = 'none') => `I'll change the token check.

Surface:
files: ${files}
consequences: auth.ts is imported by routes/login.ts and middleware.ts. The signature stays the same, so both callers keep working; checked with grep and the auth tests.
unresolved: ${unresolved}`

const edit = path => ({ tool_name: 'Edit', cwd: '/repo', tool_input: { file_path: path, old_string: 'a', new_string: 'b' } })
const bash = command => ({ tool_name: 'Bash', cwd: '/repo', tool_input: { command } })
const none = () => false

test('an edit with no Surface block is held', () => {
  assert.match(decide(edit('/repo/src/auth.ts'), [user('fix login')], none), /not cleared/)
})

test('a block clears its files only', () => {
  const t = [user('fix login'), say(BLOCK('src/auth.ts'))]
  assert.equal(decide(edit('/repo/src/auth.ts'), t, none), null)
  assert.match(decide(edit('/repo/src/db.ts'), t, none), /not cleared/)
})

test('a block before the developer\'s last message no longer counts', () => {
  const t = [user('fix login'), say(BLOCK('src/auth.ts')), user('now do the db too')]
  assert.match(decide(edit('/repo/src/auth.ts'), t, none), /not cleared/)
})

test('open questions hold everything until the developer answers', () => {
  const asked = [user('fix login'), say(BLOCK('src/auth.ts', 'Does the mobile app still send the old token?'))]
  assert.match(decide(edit('/repo/src/auth.ts'), asked, none), /mobile app/)

  // Claiming it is resolved without an answer does not clear it.
  const dodged = [...asked, say(BLOCK('src/auth.ts'))]
  assert.match(decide(edit('/repo/src/auth.ts'), dodged, none), /still open/)

  // An AskUserQuestion reply answers it.
  const answered = [...asked, use('q1', 'AskUserQuestion'), result('q1'), say(BLOCK('src/auth.ts'))]
  assert.equal(decide(edit('/repo/src/auth.ts'), answered, none), null)

  // So does the developer's next message.
  const replied = [...asked, user('the app moved off it in May, go ahead'), say(BLOCK('src/auth.ts'))]
  assert.equal(decide(edit('/repo/src/auth.ts'), replied, none), null)
})

test('commits need "git" in the block', () => {
  assert.match(decide(bash('git commit -m fix'), [user('ship it'), say(BLOCK('src/auth.ts'))], none), /git commit/)
  assert.equal(decide(bash('git commit -m fix'), [user('ship it'), say(BLOCK('src/auth.ts, git'))], none), null)
  assert.equal(decide(bash('git status && git log -3'), [user('x')], none), null)
})

test('new files are free; sed -i on an existing file is held', () => {
  const t = [user('add a helper')]
  assert.equal(decide({ tool_name: 'Write', cwd: '/repo', tool_input: { file_path: '/repo/src/new.ts', content: '' } }, t, none), null)
  const exists = p => p === '/repo/config.json'
  assert.match(decide(bash("sed -i 's/a/b/' config.json"), t, exists), /config.json/)
  assert.equal(decide(bash('echo x > /tmp/scratch.txt'), t, exists), null)
})

test('state folds blocks written in bold and bullets', () => {
  const t = [user('go'), say('**Surface:**\n- **files:** src/a.ts, src/b/\n- **consequences:** a.ts feeds the b/ loaders and nothing else; ran the loader tests after reading both.\n- **unresolved:** none')]
  assert.deepEqual(state(t), { files: ['src/a.ts', 'src/b/'], pending: [] })
})

test('the script reads stdin and the transcript and prints a deny', () => {
  const dir = mkdtempSync(join(tmpdir(), 'surface-'))
  const transcript = join(dir, 't.jsonl')
  writeFileSync(transcript, [user('fix login'), say(BLOCK('src/auth.ts'))].map(e => JSON.stringify(e)).join('\n'))
  const run = input =>
    spawnSync('node', [GATE], { input: JSON.stringify({ hook_event_name: 'PreToolUse', transcript_path: transcript, ...input }), encoding: 'utf8' })

  const held = run(edit('/repo/src/db.ts'))
  assert.equal(held.status, 0)
  const out = JSON.parse(held.stdout)
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /db\.ts/)

  const ok = run(edit('/repo/src/auth.ts'))
  assert.equal(ok.status, 0)
  assert.equal(ok.stdout, '')
})
