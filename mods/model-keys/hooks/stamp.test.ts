import { expect, test } from 'claude-code/testing'

import { stampText } from './register'

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
