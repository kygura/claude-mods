import { expect, test } from 'claude-code/testing'

test('desktop band color-codes models and effort with a dot beside each button', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'model-keys', component: 'AbovePrompt', surface: 'desktop', props: {} } as never)
  expect(await ui.find({ type: 'Text', props: { color: '#c084fc' } } as never)).toBeTruthy() // opus
  expect(await ui.find({ type: 'Text', props: { color: '#f87171' } } as never)).toBeTruthy() // max
  expect(await ui.find({ type: 'Text', text: 'ctrl+alt+↑↓ model · ctrl+alt+←→ effort' })).toBeFalsy()
})
