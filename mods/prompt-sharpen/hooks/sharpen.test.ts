import { expect, test } from 'claude-code/testing'
import { skip, unescape } from './sharpen'

test('skips short, escaped and shell prompts', () => {
  expect(skip('yes')).toBe(true)
  expect(skip('run the tests')).toBe(false)
  expect(skip('\\fix the login bug in auth')).toBe(true)
  expect(skip('!ls -la some/dir')).toBe(true)
  expect(skip('fix the login bug in the auth module')).toBe(false)
})

test('backslash bypass is stripped', () => {
  expect(unescape('\\keep this as typed')).toBe('keep this as typed')
  expect(unescape('normal prompt')).toBe('normal prompt')
})
