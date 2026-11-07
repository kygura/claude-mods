import { expect, test } from 'claude-code/testing'

import { tree } from '../hooks/register'

const BAND = { plugin: 'subagent-model', component: 'AbovePrompt', surface: 'terminal', props: { hasSurvey: false, bodyColumns: 80 } } as any

const seed = (running: object, root: object | null) => ($: unknown, e: { key: string }) =>
  ({ value: { value: e.key === 'running' ? running : e.key === 'root' ? root : null, version: 1 } })

test('nested agents follow their parent, orphans hang off the root', () => {
  const rows = tree({
    a: { description: 'a', model: 'm' },
    b: { description: 'b', model: 'm', parent: 'a' },
    c: { description: 'c', model: 'm', parent: 'gone' },
  })
  expect(rows.map(r => `${r.id}${r.depth}`)).toEqual(['a1', 'b2', 'c1'])
})

test('the band keeps the other mods bar and adds session and agent rows', async ($, on) => {
  on('state.get', seed(
    { a1: { description: 'demo', model: 'claude-haiku-5-5', effort: 'medium' } },
    { model: 'claude-opus-5-5', effort: 'high' },
  ) as any)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>model-keys bar</Text>
  })
  const ui = await $.ui.mount(BAND)
  expect((await ui.find({ type: 'Text', text: /model-keys bar/ }))?.text).toBe('model-keys bar')
  expect((await ui.find({ type: 'Text', text: /opus 5\.5/ }))?.text).toBe(' opus 5.5 ')
  expect((await ui.find({ type: 'Text', text: /haiku 5\.5/ }))?.text).toBe(' haiku 5.5 ')
  expect((await ui.find({ type: 'Text', text: /demo/ }))?.text).toBe('demo')
  await ui.unmount()
})

test('before the first request only the other mods bar shows', async ($, on) => {
  on('state.get', seed({}, null) as any)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>model-keys bar</Text>
  })
  const ui = await $.ui.mount(BAND)
  expect((await ui.find({ type: 'Text' }))?.text).toBe('model-keys bar')
  await ui.unmount()
})
