import { expect, test } from 'claude-code/testing'
import { barCells, color, terminalFit } from '../hooks/register'

const BODY = {
  limits: [
    { kind: 'session', percent: 66, severity: 'normal', resets_at: '2026-11-16T23:00:00Z', scope: null },
    { kind: 'weekly_all', percent: 32, severity: 'normal', resets_at: '2026-11-22T03:00:00Z', scope: null },
    { kind: 'weekly_scoped', percent: 5, severity: 'normal', resets_at: '2026-11-22T03:00:00Z', scope: { model: { display_name: 'Fable' } } },
  ],
  extra_usage: { is_enabled: false },
}

test('draws 5h, week and Fable bars from the usage endpoint', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: Date.parse('2026-11-16T21:00:00Z') }))
  on('clock.every', () => ({ value: undefined }))
  on('session.authorize', () => ({ value: { handle: 'h', kind: 'bearer' } }))
  on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify(BODY) } }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  // refresh runs unawaited at session start: let its promise chain finish.
  for (let i = 0; i < 50; i++) await Promise.resolve()

  const ui = await $.ui.mount({ plugin: 'usage-bars', component: 'AbovePrompt', surface: 'terminal', props: { bodyColumns: 80 } } as never)
  expect(await ui.find({ type: 'Text', text: '5h' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: 'Fable' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: '66%' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: 'extra usage: off' })).toBeTruthy()
  // 80 cols fits the full 24-cell bar: 66% of 192 eighths = 127 = 15 cells + 7/8.
  expect(await ui.find({ type: 'Text', text: '█'.repeat(15) + '▉' })).toBeTruthy()
})

test('narrow terminal shows numbers only, no bars', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: Date.parse('2026-11-16T21:00:00Z') }))
  on('clock.every', () => ({ value: undefined }))
  on('session.authorize', () => ({ value: { handle: 'h', kind: 'bearer' } }))
  on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify(BODY) } }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  for (let i = 0; i < 50; i++) await Promise.resolve()

  const ui = await $.ui.mount({ plugin: 'usage-bars', component: 'AbovePrompt', surface: 'terminal', props: { bodyColumns: 26 } } as never)
  expect(await ui.find({ type: 'Text', text: '66%' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: 'Fable ' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: '█' } as never)).toBeFalsy()
})

test('eighth-block bars and five color levels', () => {
  expect(barCells(0, 4)).toEqual({ fill: '', rest: '    ' })
  expect(barCells(50, 4)).toEqual({ fill: '██', rest: '  ' })
  expect(barCells(53, 4)).toEqual({ fill: '██▏', rest: ' ' })
  expect(barCells(100, 4)).toEqual({ fill: '████', rest: '' })
  expect([10, 60, 80, 90, 97].map(percent => color({ percent, severity: 'normal' })))
    .toEqual(['#4ade80', '#a3e635', '#facc15', '#fb923c', '#f87171'])
  expect(color({ percent: 10, severity: 'warning' })).toBe('#f87171')
})

test('terminal bar fits a narrow band, dropping the "resets in" prefix first', () => {
  expect(terminalFit(80, 6, 6)).toEqual({ bar: 24, isShort: false })
  // 40 cols: 40-4-3-6-4-16 = 7 < 8, so short form: 40-4-3-6-4-6 = 17
  expect(terminalFit(40, 6, 6)).toEqual({ bar: 17, isShort: true })
  // Under 8 cells even short: numbers only.
  expect(terminalFit(30, 6, 6).bar).toBe(0)
})

test('desktop draws a Box bar, not glyphs', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: Date.parse('2026-11-16T21:00:00Z') }))
  on('clock.every', () => ({ value: undefined }))
  on('session.authorize', () => ({ value: { handle: 'h', kind: 'bearer' } }))
  on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify(BODY) } }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (let i = 0; i < 50; i++) await Promise.resolve()

  const ui = await $.ui.mount({ plugin: 'usage-bars', component: 'AbovePrompt', surface: 'desktop', props: {} } as never)
  expect(await ui.find({ type: 'Box', props: { width: '66%' } } as never)).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: '░' } as never)).toBeFalsy()
})
