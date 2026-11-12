import { expect, test } from 'claude-code/testing'
import { decide, tierOf, workerFor } from './tiers'

const base = { parentModel: 'claude-fable-5-2', fork: false, resume: false, subagentType: 'general-purpose' }

test('tiers read model ids and aliases', () => {
  expect(tierOf('claude-fable-5-2')).toBe(4)
  expect(tierOf('claude-opus-5-5')).toBe(3)
  expect(tierOf('sonnet')).toBe(2)
  expect(tierOf('claude-haiku-5-5')).toBe(1)
  expect(tierOf('gpt-x')).toBeUndefined()
})

test('worker sits below the planner', () => {
  expect(workerFor(4, 'sonnet')).toBe('sonnet')
  expect(workerFor(2, 'sonnet')).toBe('haiku')
  expect(workerFor(3, 'opus')).toBe('sonnet')
})

test('a spawn with no model is moved off the planner model', () => {
  expect(decide(base, 'rewrite', 'sonnet')).toMatchObject({ kind: 'rewrite', model: 'sonnet' })
  expect(decide({ ...base, model: 'inherit' }, 'rewrite', 'sonnet')).toMatchObject({ kind: 'rewrite' })
})

test('same or higher tier is a clone', () => {
  expect(decide({ ...base, model: 'fable' }, 'rewrite', 'sonnet')).toMatchObject({ kind: 'rewrite', model: 'sonnet' })
  expect(decide({ ...base, parentModel: 'claude-opus-5-5', model: 'claude-fable-5-2' }, 'deny', 'sonnet').kind).toBe('deny')
})

test('cheaper models pass', () => {
  expect(decide({ ...base, model: 'opus' }, 'deny', 'sonnet').kind).toBe('allow')
  expect(decide({ ...base, model: 'haiku' }, 'deny', 'sonnet').kind).toBe('allow')
})

test('forks are always refused', () => {
  const v = decide({ ...base, fork: true, subagentType: 'fork' }, 'rewrite', 'sonnet')
  expect(v.kind).toBe('deny')
})

test('a haiku planner, an unknown model and a resume are left alone', () => {
  expect(decide({ ...base, parentModel: 'claude-haiku-5-5' }, 'deny', 'sonnet').kind).toBe('allow')
  expect(decide({ ...base, model: 'some-local-model' }, 'deny', 'sonnet').kind).toBe('allow')
  expect(decide({ ...base, resume: true }, 'deny', 'sonnet').kind).toBe('allow')
})
