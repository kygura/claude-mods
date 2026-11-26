import { expect, test } from 'claude-code/testing'

const start = async ($: any, on: any, surface: string) => {
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface, isInteractive: true })
  return $.ui.mount({ plugin: 'model-keys', component: 'AbovePrompt', surface, props: {} } as never)
}

test('desktop band draws model and effort as bars the arrows step', async ($, on) => {
  const ui = await start($, on, 'desktop')
  await ui.press({ key: 'mu' }) // default → haiku
  await ui.press({ key: 'mu' }) // → sonnet
  expect(await ui.find({ type: 'Text', props: { color: '#60a5fa' }, text: '▰▰' } as never)).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: 'sonnet' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: 'default' })).toBeTruthy()
  await ui.press({ key: 'eu' }) // unset steps from medium
  expect(await ui.find({ type: 'Text', props: { color: '#facc15' }, text: '▰▰▰' } as never)).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: 'high' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: 'ctrl+alt+↑↓ model · ctrl+alt+←→ effort' })).toBeFalsy()
})

test('terminal bars: clicking a cell picks that model or effort level and colors the bar', async ($, on) => {
  const ui = await start($, on, 'terminal')
  await ui.press({ key: 'e-max' })
  expect(await ui.find({ type: 'Text', text: 'max', props: { color: '#f87171' } } as never)).toBeTruthy()
  await ui.press({ key: 'e-low' })
  expect(await ui.find({ type: 'Text', text: 'low', props: { color: '#38bdf8' } } as never)).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: '▱', props: { color: '#4b5563' } } as never)).toBeTruthy()
  await ui.press({ key: 'm-opus' })
  expect(await ui.find({ type: 'Text', text: 'opus', props: { color: '#c084fc' } } as never)).toBeTruthy()
  await ui.press({ key: 'reset' })
  expect(await ui.find({ type: 'Text', text: 'opus' })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: 'low' })).toBeFalsy()
})
