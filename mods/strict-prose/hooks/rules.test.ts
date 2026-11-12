import { expect, test } from 'claude-code/testing'
import { commitMessage, fromCode, fromMarkdown, lint, proseOf } from './rules'
import { dashes } from './register'

const rules = (t: string) => lint(t).map(v => v.rule)

test('flags dashes, emoji, exclamations and hype words', () => {
  expect(rules('Fast — and cheap.')).toContain('em dash')
  expect(rules('Pages 5–10.')).toEqual([])
  expect(rules('Fast – and cheap.')).toContain('en dash')
  expect(rules('Saved!')).toContain('exclamation mark')
  expect(rules('Done \u{1F680}')).toContain('emoji')
  expect(rules('A seamless way to delve into data.')).toEqual(['"delve"', '"seamless"'])
  expect(rules("It's not a tool, it's a platform.")).toContain('"it\'s not X, it\'s Y"')
  expect(rules('Not just fast, but cheap.')).toContain('"not just X, but Y"')
  expect(rules("Whether you're a founder or a dev, it works.")).toContain('"whether you\'re X or Y"')
})

test('leaves plain UI copy alone', () => {
  expect(lint('Unlock account. Navigate to Settings to change your password.')).toEqual([])
  expect(lint('Copyright © 2026. Saved 3 files in 2.1 s.')).toEqual([])
  expect(lint('x != y and ![logo](a.png)')).toEqual([])
})

test('reports the line of each violation', () => {
  expect(lint('ok\nok\nreally robust').map(v => v.line)).toEqual([3])
})

test('markdown drops code and links', () => {
  expect(lint(fromMarkdown('Run `rm -rf — now`.\n\n```\nconst x = "seamless"!\n```\n[docs](https://a.b/delve)'))).toEqual([])
})

test('code keeps only prose strings and JSX text', () => {
  const src = `// a seamless comment\nconst k = 'robust'\nconst m = "Welcome aboard! Let's dive in."\nexport const A = () => <p>A seamless app</p>`
  const v = lint(fromCode(src)).map(x => x.rule)
  expect(v).toContain('exclamation mark')
  expect(v).toContain('"deep-dive"')
  expect(v).toContain('"seamless"')
  expect(v.filter(x => x === '"robust"')).toEqual([])
  expect(v.filter(x => x === '"seamless"').length).toBe(1)
})

test('only reader-facing files are checked', () => {
  expect(proseOf('/a/README.md', 'x')).not.toBeNull()
  expect(proseOf('/a/src/App.tsx', 'x')).not.toBeNull()
  expect(proseOf('/a/locales/en.json', 'x')).not.toBeNull()
  expect(proseOf('/a/package.json', 'x')).toBeNull()
  expect(proseOf('/a/server.py', 'x')).toBeNull()
})

test('commit messages are extracted', () => {
  expect(commitMessage('git commit -m "feat: seamless sync"')).toBe('feat: seamless sync')
  expect(commitMessage("git commit -m 'a' -m 'b'")).toBe('a\nb')
  expect(commitMessage('git status')).toBeNull()
})

test('chat dashes become commas', () => {
  expect(dashes('fast — cheap')).toBe('fast, cheap')
  expect(dashes('fast—cheap')).toBe('fast, cheap')
  expect(dashes('pages 5–10')).toBe('pages 5-10')
  expect(dashes('— item\n— two')).toBe('- item\n- two')
  expect(dashes('— next', false)).toBe(', next')
})
