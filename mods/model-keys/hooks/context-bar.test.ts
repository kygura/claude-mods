import { expect, test } from 'claude-code/testing'

import { formatTokens, segments } from './context-bar'

test('segments fill the width exactly, proportionally', () => {
  const slices = [
    { name: 'System prompt', tokens: 10_000, color: 'promptBorder', kind: 'used' as const },
    { name: 'Messages', tokens: 50_000, color: 'permission', kind: 'used' as const },
    { name: 'Tiny', tokens: 10, color: 'inactive', kind: 'used' as const },
    { name: 'Free space', tokens: 140_000, color: 'inactive', kind: 'free' as const },
    { name: 'Empty', tokens: 0, color: 'inactive', kind: 'used' as const },
  ]
  const segs = segments(slices, 200_000, 40)
  expect(segs.reduce((n, s) => n + s.cells, 0)).toBe(40)
  expect(segs.map(s => s.name)).toEqual(['System prompt', 'Messages', 'Tiny', 'Free space'])
  expect(segs[1]?.cells).toBe(10)
  expect(segs[2]?.cells).toBe(1)
  expect(segments(slices, 200_000, 0)).toEqual([])
  expect(formatTokens(1500)).toBe('2k')
  expect(formatTokens(1_200_000)).toBe('1.2M')
})
