import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const DECLARE = 'mcp__surface__declare'
const CONSEQUENCES =
  'auth.ts is imported by routes/login.ts and middleware.ts; the signature stays the same, so both callers keep working. Checked with grep and the auth tests.'

const engine = (on: On, existing: string[] = []) => {
  on('store.get', () => ({ value: undefined }))
  on('tool.call', () => ({ result: {} }))
  on('fs.exists', (_, e) => ({ value: existing.some(p => (e as { path: string }).path.endsWith(p)) }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('ui.status', () => ({ value: undefined }))
}

test('an edit with no declaration is held', async ($, on) => {
  engine(on)
  const r = await $.tool.call({ tool: 'Edit', file_path: '/repo/src/auth.ts', old_string: 'a', new_string: 'b' })
  expect(r.deny).toContain('surface')
  expect(r.deny).toContain(DECLARE)
})

test('a declaration clears its files and nothing else', async ($, on) => {
  engine(on)
  const d = await $.tool.call({ tool: DECLARE, files: ['src/auth.ts'], consequences: CONSEQUENCES, unresolved: [] })
  expect(String(d.result)).toContain('Cleared')

  const ok = await $.tool.call({ tool: 'Edit', file_path: '/repo/src/auth.ts', old_string: 'a', new_string: 'b' })
  expect(ok.deny).toBeUndefined()

  const other = await $.tool.call({ tool: 'Edit', file_path: '/repo/src/db.ts', old_string: 'a', new_string: 'b' })
  expect(other.deny).toContain('not cleared')
})

test('a directory entry covers what is under it', async ($, on) => {
  engine(on)
  await $.tool.call({ tool: DECLARE, files: ['src/auth/'], consequences: CONSEQUENCES, unresolved: [] })
  const r = await $.tool.call({ tool: 'Write', file_path: '/repo/src/auth/token.ts', content: 'x' })
  expect(r.deny).toBeUndefined()
})

test('open questions clear nothing and hold every edit until the developer answers', async ($, on) => {
  engine(on)
  const d = await $.tool.call({
    tool: DECLARE,
    files: ['src/auth.ts'],
    consequences: CONSEQUENCES,
    unresolved: ['Does the mobile app still send the old token format?'],
  })
  expect(String(d.result)).toContain('Not cleared')

  const held = await $.tool.call({ tool: 'Edit', file_path: '/repo/src/auth.ts', old_string: 'a', new_string: 'b' })
  expect(held.deny).toContain('mobile app')

  // Re-declaring without an answer does not get around it.
  const again = await $.tool.call({ tool: DECLARE, files: ['src/auth.ts'], consequences: CONSEQUENCES, unresolved: [] })
  expect(String(again.result)).toContain('still open')

  // The developer answers.
  await $.tool.call({ tool: 'AskUserQuestion', questions: [] })
  const now = await $.tool.call({ tool: DECLARE, files: ['src/auth.ts'], consequences: `${CONSEQUENCES} The developer says the app moved off the old format.`, unresolved: [] })
  expect(String(now.result)).toContain('Cleared')
  const ok = await $.tool.call({ tool: 'Edit', file_path: '/repo/src/auth.ts', old_string: 'a', new_string: 'b' })
  expect(ok.deny).toBeUndefined()
})

test('hedged consequences count as open questions', async ($, on) => {
  engine(on)
  const d = await $.tool.call({
    tool: DECLARE,
    files: ['src/auth.ts'],
    consequences: 'Changes the token check. Not sure whether the cron job also reads this token.',
    unresolved: [],
  })
  expect(String(d.result)).toContain('Not cleared')
})

test('thin consequences and wildcards are refused', async ($, on) => {
  engine(on)
  const thin = await $.tool.call({ tool: DECLARE, files: ['a.ts'], consequences: 'Small fix.', unresolved: [] })
  expect(String(thin.result)).toContain('too thin')
  const star = await $.tool.call({ tool: DECLARE, files: ['*'], consequences: CONSEQUENCES, unresolved: [] })
  expect(String(star.result)).toContain('wildcard')
})

test('commits need "git" in the declaration', async ($, on) => {
  engine(on)
  const held = await $.tool.call({ tool: 'Bash', command: 'cd repo && git commit -m "fix auth"' })
  expect(held.deny).toContain('git commit')

  const status = await $.tool.call({ tool: 'Bash', command: 'git status && git diff' })
  expect(status.deny).toBeUndefined()

  await $.tool.call({ tool: DECLARE, files: ['src/auth.ts', 'git'], consequences: CONSEQUENCES, unresolved: [] })
  const ok = await $.tool.call({ tool: 'Bash', command: 'git -C repo commit -m "fix auth"' })
  expect(ok.deny).toBeUndefined()
})

test('new files are free; shell edits of existing files are held', async ($, on) => {
  engine(on, ['/repo/src/existing.ts', '/config.json'])
  const fresh = await $.tool.call({ tool: 'Write', file_path: '/repo/src/new.ts', content: 'x' })
  expect(fresh.deny).toBeUndefined()

  const replace = await $.tool.call({ tool: 'Write', file_path: '/repo/src/existing.ts', content: 'x' })
  expect(replace.deny).toContain('not cleared')

  const sed = await $.tool.call({ tool: 'Bash', command: "sed -i 's/a/b/' config.json" })
  expect(sed.deny).toContain('config.json')

  const scratch = await $.tool.call({ tool: 'Bash', command: 'echo hi > /tmp/x.txt 2>&1' })
  expect(scratch.deny).toBeUndefined()
})

test('a subagent has its own clearances', async ($, on) => {
  engine(on)
  await $.tool.call({ tool: DECLARE, files: ['src/auth.ts'], consequences: CONSEQUENCES, unresolved: [] })
  const sub = await $.tool.call({ tool: 'Edit', file_path: '/repo/src/auth.ts', old_string: 'a', new_string: 'b', agentId: 'a1' })
  expect(sub.deny).toContain('not cleared')
})

test('turned off, nothing is held', async ($, on) => {
  on('store.get', () => ({ value: false }))
  on('tool.call', () => ({ result: {} }))
  on('session.cwd', () => ({ value: '/repo' }))
  const r = await $.tool.call({ tool: 'Edit', file_path: '/repo/src/auth.ts', old_string: 'a', new_string: 'b' })
  expect(r.deny).toBeUndefined()
})
