import { expect, test } from 'claude-code/testing'
import type { AgentSpawnInput } from 'claude-code'

// The test kit passes the call's arguments as given, so the facts the engine
// would fill (the planner's model, fork) are stated here.
const spawn = (args: Record<string, unknown>) => args as unknown as AgentSpawnInput

test('an Agent call with no model runs on the worker model', async ($, on) => {
  let ran: string | undefined
  on('agent.spawn', (_, e) => {
    ran = e.model
    return { model: e.model ?? 'inherit', agentId: 'a1' }
  })
  const r = await $.agent.spawn(spawn({ prompt: 'Read the repo.', description: 'scan', parentModel: 'claude-fable-5-2', fork: false }))
  expect(r.deny).toBeUndefined()
  expect(ran).toBe('sonnet')
})

test('a cheaper model passes untouched', async ($, on) => {
  let ran: string | undefined
  on('agent.spawn', (_, e) => {
    ran = e.model
    return { model: e.model ?? 'inherit', agentId: 'a1' }
  })
  await $.agent.spawn(spawn({ prompt: 'x', description: 'grep', model: 'haiku', parentModel: 'claude-opus-5-5', fork: false }))
  expect(ran).toBe('haiku')
})

test('deny mode refuses a clone', { options: { mode: 'deny' } }, async ($, on) => {
  on('agent.spawn', (_, e) => ({ model: e.model ?? 'inherit', agentId: 'a1' }))
  const r = await $.agent.spawn(spawn({ prompt: 'x', description: 'clone', model: 'fable', parentModel: 'claude-fable-5-2', fork: false }))
  expect(r.deny).toContain('no-self-clone')
})

test('a fork is refused', async ($, on) => {
  on('agent.spawn', (_, e) => ({ model: e.model ?? 'inherit', agentId: 'a1' }))
  const r = await $.agent.spawn(spawn({ prompt: 'x', description: 'f', subagentType: 'fork', parentModel: 'claude-fable-5-2', fork: true }))
  expect(r.deny).toContain('fork')
})
