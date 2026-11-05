import type { ContextSlice } from '../types'

export type Segment = { name: string; color: string; cells: number }

/**
 * Splits `width` cells across the slices in proportion to their tokens.
 * Every non-empty slice gets at least one cell; rounding error is absorbed by
 * the free slice (or the largest one), so the cells always sum to `width`.
 */
export function segments(slices: ContextSlice[], max: number, width: number): Segment[] {
  const shown = slices.filter(s => s.tokens > 0)
  if (width <= 0 || max <= 0 || shown.length === 0) return []
  const segs = shown.map(s => ({
    name: s.name,
    color: s.color,
    cells: Math.max(1, Math.round((s.tokens / max) * width)),
  }))
  const sink =
    segs.find((_, i) => shown[i]?.kind === 'free') ??
    segs.reduce((a, b) => (b.cells > a.cells ? b : a))
  sink.cells += width - segs.reduce((n, s) => n + s.cells, 0)
  return segs.filter(s => s.cells > 0)
}

export const formatTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)

/** Longest prefix of `items` whose texts, `gap` cells apart, fit in `width` cells. */
export function fitPrefix<T extends { text: string }>(items: T[], width: number, gap = 1): T[] {
  const out: T[] = []
  let used = 0
  for (const item of items) {
    used += (out.length ? gap : 0) + item.text.length
    if (used > width) break
    out.push(item)
  }
  return out
}
