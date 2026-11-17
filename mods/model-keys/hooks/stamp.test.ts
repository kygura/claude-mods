import { expect, test } from 'claude-code/testing'

import { headlessLine, stampText } from './register'

test('stamps unstamped text once', () => {
  expect(stampText('Hello', 'claude-opus-5-5')).toBe('`[claude-opus-5-5]`\n\nHello')
})

test('a second copy of the hook leaves a stamped chunk alone', () => {
  const once = stampText('Hello', 'opus')
  expect(stampText(once, 'claude-opus-5-5')).toBe(once)
})

test('inline code at the start of a reply is not mistaken for a stamp', () => {
  expect(stampText('`[x]` is an array', 'opus')).toBe('`[opus]`\n\n`[x]` is an array')
})

test('headless line carries model, effort and context', () => {
  expect(headlessLine('claude-opus-5-5', 'high', { percent: 42, max: 200000 })).toBe('claude-opus-5-5 · effort high · ctx 42% of 200k')
  expect(headlessLine('claude-opus-5-5', undefined, null)).toBe('claude-opus-5-5')
})

test('a headless stamp is still recognized as a stamp', () => {
  const once = stampText('Hello', headlessLine('opus', 'low', { percent: 9, max: 1000000 }))
  expect(stampText(once, 'opus')).toBe(once)
})
