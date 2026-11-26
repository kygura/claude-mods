import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Extra, Limit, Usage } from '../types'

const usage = atom({ plugin: 'usage-bars', key: 'usage' } as const, null as Usage | null)

const URL = 'https://api.anthropic.com/api/oauth/usage'
const BAR_WIDTH = 24
const MIN_BAR = 8
const TRACK = '#374151'
const MIN_REFETCH_MS = 30_000
const POLL_MS = 5 * 60_000

type ApiLimit = {
  kind: string
  percent: number
  severity: string
  resets_at: string | null
  scope: { model?: { display_name?: string | null } | null; surface?: string | null } | null
}

// The same endpoint /usage reads. `limits` carries every window the plan has,
// including per-model weekly scopes such as Fable, so new ones show up unchanged.
export const toLimits = (limits: ApiLimit[]): Limit[] =>
  limits.map(l => ({
    label:
      l.kind === 'session' ? '5h'
      : l.kind === 'weekly_all' ? 'week'
      : l.scope?.model?.display_name ?? l.scope?.surface ?? l.kind,
    percent: Number(l.percent) || 0,
    severity: l.severity,
    resetsAt: l.resets_at,
  }))

export const untilReset = (iso: string | null, now: number) => {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((Date.parse(iso) - now) / 60_000))
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`
}

/**
 * Terminal bar width for a band `cols` wide: border+padding 4, three gaps, a
 * 4-cell percent, then the reset text. Capped at BAR_WIDTH. Drops the
 * "resets in" prefix first; under MIN_BAR cells even then, `bar` is 0 and the
 * band shows numbers only.
 */
export const terminalFit = (cols: number, labelWidth: number, resetLen: number) => {
  const room = (resetText: number) => cols - 4 - 3 - labelWidth - 4 - resetText
  const full = room(resetLen ? 'resets in '.length + resetLen : 0)
  const isShort = full < MIN_BAR && resetLen > 0
  const bar = Math.min(BAR_WIDTH, isShort ? room(resetLen) : full)
  return { bar: bar < MIN_BAR ? 0 : bar, isShort }
}

// Five steps, so the bar warns well before it is red.
const LEVELS: [number, string][] = [[50, '#4ade80'], [70, '#a3e635'], [85, '#facc15'], [95, '#fb923c']]
export const color = (l: Pick<Limit, 'percent' | 'severity'>) =>
  l.severity !== 'normal' ? '#f87171' : LEVELS.find(([max]) => l.percent < max)?.[1] ?? '#f87171'

const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']
/** A `width`-cell bar in eighths of a cell: full cells, one partial glyph, the rest blank. */
export const barCells = (pct: number, width: number) => {
  const eighths = Math.round((Math.min(100, Math.max(0, pct)) / 100) * width * 8)
  const full = Math.floor(eighths / 8), part = EIGHTHS[eighths % 8]
  return { fill: '█'.repeat(full) + part, rest: ' '.repeat(width - full - (part ? 1 : 0)) }
}

let lastFetch = 0
let poll: { cancel(): unknown } | undefined

async function refresh($: EngineInterface, force = false) {
  const now = await $.clock.now()
  if (!force && now - lastFetch < MIN_REFETCH_MS) return
  lastFetch = now
  try {
    const auth = await $.session.authorize()
    if (!auth) return // API key / 3P provider: no plan limits to show.
    const r = await $.http.fetch(URL, { auth: auth.handle, headers: { 'anthropic-beta': 'oauth-2025-04-20' } })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const body = JSON.parse(r.text)
    const x = body.extra_usage
    const extra: Extra | null = x
      ? { isEnabled: !!x.is_enabled, used: x.used_credits ?? null, limit: x.monthly_limit ?? null, currency: x.currency ?? null }
      : null
    await update($, usage, () => ({ limits: toLimits(body.limits ?? []), extra, fetchedAt: now }))
  } catch (err) {
    // Keep the last good bars; just flag that they are stale.
    await update($, usage, u => (u ? { ...u, error: String(err) } : u))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    void refresh($, true)
    poll?.cancel() // session.start can fire again (resume, /clear): one poller.
    poll = $.clock.every(POLL_MS, () => void refresh($, true))
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    void refresh($)
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // AbovePrompt is one slot shared by every mod: stack under the others.
    const others = await next(e)
    const u = await read($, usage)
    if (e.props.hasSurvey || !u || u.limits.length === 0) return others

    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const labelWidth = Math.max(...u.limits.map(l => l.label.length)) + 1
    const isTerminal = e.surface === 'terminal'
    const resets = u.limits.map(l => (l.resetsAt ? untilReset(l.resetsAt, now) : ''))
    // Terminal only: glyph cells are fixed, so fit them to the band. Drop the
    // "resets in" prefix before squeezing the bar under 8 cells.
    const fit = isTerminal ? terminalFit(e.props.bodyColumns, labelWidth, Math.max(...resets.map(r => r.length))) : null

    const extraLine = u.extra && (
      <Text dimColor>
        {u.extra.isEnabled
          ? `extra usage: ${u.extra.used ?? 0}${u.extra.limit != null ? ` / ${u.extra.limit}` : ''} ${u.extra.currency ?? ''}`.trim()
          : 'extra usage: off'}
        {u.error ? '  (stale: refresh failed)' : ''}
      </Text>
    )

    // Narrow terminal: a bar under MIN_BAR cells says little, so numbers only.
    if (fit && fit.bar === 0) {
      return (
        <Box flexDirection="column">
          {others}
          <Box flexWrap="wrap" columnGap={2} paddingX={1}>
            {u.limits.map((l, i) => (
              <Text key={l.label}>
                <Text dimColor>{`${l.label} `}</Text>
                <Text bold color={color(l)}>{`${Math.round(l.percent)}%`}</Text>
                {resets[i] ? <Text dimColor>{` ${resets[i]}`}</Text> : null}
              </Text>
            ))}
            {u.error ? <Text dimColor>(stale)</Text> : null}
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {others}
        <Box flexDirection="column" borderStyle="round" borderColor="#4b5563" paddingX={1}>
          {u.limits.map((l, i) => {
            const pct = Math.min(100, Math.max(0, l.percent))
            const reset = resets[i] && (fit?.isShort ? resets[i] : `resets in ${resets[i]}`)
            const cells = fit && barCells(pct, fit.bar)
            return (
              <Box key={l.label} columnGap={1} alignItems="center">
                <Box width={labelWidth} flexShrink={0}><Text dimColor>{l.label}</Text></Box>
                {cells ? (
                  // Eighth-block glyphs on a shaded track: 8 steps per cell.
                  <Text backgroundColor={TRACK}>
                    <Text color={color(l)}>{cells.fill}</Text>
                    {cells.rest}
                  </Text>
                ) : (
                  // Desktop/app: glyphs have uneven widths in a proportional font, so a
                  // bar of Boxes (flex track + percent fill) that shrinks with the window.
                  <Box flexGrow={1} flexShrink={1} minWidth={6} height={1} backgroundColor={TRACK}>
                    <Box width={`${pct}%`} height={1} backgroundColor={color(l)} />
                  </Box>
                )}
                <Box width={4} flexShrink={0}><Text bold color={color(l)}>{`${Math.round(l.percent)}%`}</Text></Box>
                <Text dimColor wrap="truncate-end">{reset}</Text>
              </Box>
            )
          })}
          {extraLine}
        </Box>
      </Box>
    )
  })
}
