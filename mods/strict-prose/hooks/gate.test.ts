import { expect, test } from 'claude-code/testing'

test('a README write with hype words is refused, plain copy goes through', async ($, on) => {
  on('store.get', () => ({ value: undefined }))
  on('tool.call', () => ({ result: {} }))

  const bad = await $.tool.call({ tool: 'Write', file_path: '/r/README.md', content: '# App\n\nA seamless way to sync — fast!' })
  expect(bad.deny).toContain('strict-prose')
  expect(bad.deny).toContain('em dash')
  expect(bad.deny).toContain('"seamless"')

  const ok = await $.tool.call({ tool: 'Write', file_path: '/r/README.md', content: '# App\n\nSyncs 10k files in 3 seconds.' })
  expect(ok.deny).toBeUndefined()

  const code = await $.tool.call({ tool: 'Write', file_path: '/r/server.py', content: 'x = "seamless!"' })
  expect(code.deny).toBeUndefined()
})

test('commit messages are checked', async ($, on) => {
  on('store.get', () => ({ value: undefined }))
  on('tool.call', () => ({ result: {} }))
  const r = await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat: supercharge the sync"' })
  expect(r.deny).toContain('supercharg')
})

test('turned off, nothing is checked', async ($, on) => {
  on('store.get', () => ({ value: false }))
  on('tool.call', () => ({ result: {} }))
  const r = await $.tool.call({ tool: 'Write', file_path: '/r/README.md', content: 'Seamless!' })
  expect(r.deny).toBeUndefined()
})
