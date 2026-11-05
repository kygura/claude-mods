import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ContextSnapshot, Effort } from '../types'
import { formatTokens, segments } from './context-bar'

const model = atom({ plugin: 'model-keys', key: 'model' } as const, null)
const effort = atom({ plugin: 'model-keys', key: 'effort' } as const, null)
const context = atom({ plugin: 'model-keys', key: 'context' } as const, null)

const PANE = 'context'

// null = session default
const MODELS: (string | null)[] = [null, 'haiku', 'sonnet', 'opus', 'fable']
const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

// ctrl+alt+arrows are mapped to these idle diff-panel actions in
// ~/.claude/keybindings.json. Buttons naming them fire from the prompt while
// the diff panel (their engine handler) is closed.
const KEYS = {
  modelUp: 'app:diffFileListUp',
  modelDown: 'app:diffFileListDown',
  effortDown: 'app:toggleDiffNoiseFilter',
  effortUp: 'app:toggleDiffPreSession',
}

const MODEL_COLOR: Record<string, string> = {
  default: '#9ca3af',
  haiku: '#34d399',
  sonnet: '#60a5fa',
  opus: '#c084fc',
  fable: '#f59e0b',
}
// cool → hot, low to max
const EFFORT_COLOR: Record<Effort, string> = {
  low: '#38bdf8',
  medium: '#4ade80',
  high: '#facc15',
  xhigh: '#fb923c',
  max: '#f87171',
}

// Context bar only: desaturated pastels.
const PASTEL = {
  blue: '#9db4cf',
  lavender: '#b9a7cc',
  teal: '#9cc5c0',
  sand: '#d9c29b',
  sage: '#a8c5a0',
  peach: '#e0b99a',
  rose: '#d4a5a5',
  butter: '#ddd4a3',
  slate: '#a7adba',
  free: '#454a54',
  buffer: '#6e6875',
}
// Used categories take these in /context's order.
const CONTEXT_COLORS = [PASTEL.blue, PASTEL.lavender, PASTEL.teal, PASTEL.sand, PASTEL.sage, PASTEL.peach, PASTEL.rose, PASTEL.butter]
const fillColor = (percent: number) =>
  percent >= 85 ? PASTEL.rose : percent >= 60 ? PASTEL.butter : PASTEL.sage

const clamp = (i: number, n: number) => Math.max(0, Math.min(n - 1, i))

// 'summary' estimates locally: no token-count API calls.
async function refreshContext($: EngineInterface) {
  const { context: usage } = await $.session.usage({ breakdown: 'summary' })
  const b = usage.breakdown
  if (!b) return
  const snapshot: ContextSnapshot = {
    max: b.rawMaxTokens,
    percent: b.percentage,
    slices: b.categories
      .filter(c => c.kind !== 'deferred')
      .map((c, i) => ({
        name: c.name,
        tokens: c.tokens,
        kind: c.kind as 'used' | 'free' | 'buffer',
        color:
          c.kind === 'free' ? PASTEL.free
          : c.kind === 'buffer' ? PASTEL.buffer
          : CONTEXT_COLORS[i % CONTEXT_COLORS.length] ?? PASTEL.slate,
      })),
  }
  await update($, context, () => snapshot)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'context-panel', description: 'Show the context usage breakdown in a pane' })
    await refreshContext($)
    void $.ui.open({ id: PANE, title: 'Context' })
    return result
  })

  on('command.run', { command: 'context-panel' }, async $ => {
    await refreshContext($)
    await $.ui.open({ id: PANE, title: 'Context' })
    return { text: 'Context pane opened.' }
  })

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    if (e.changed.includes('context')) await refreshContext($)
    return result
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    const m = await read($, model)
    const ef = await read($, effort)
    const r = yield* next({ ...e, ...(m && { model: m }), ...(ef && { effort: ef }) })
    // The model the API reports for this answer, not the one we asked for.
    if (r.usage) $.ui.status(`▸ ${r.usage.model}${ef ? ` · ${ef}` : ''}`)
    return r
  })

  // Detailed breakdown: segmented bar + legend.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const ctx = await read($, context)
    if (!ctx) return <Text dimColor>No context reading yet.</Text>

    const width = Math.max(10, e.props.bodyColumns)
    const total = ctx.slices.filter(sl => sl.kind === 'used').reduce((n, sl) => n + sl.tokens, 0)
    const pct = (tokens: number) => `${((tokens / ctx.max) * 100).toFixed(1)}%`

    return (
      <Box flexDirection="column" rowGap={1}>
        <Box columnGap={1}>
          <Text bold color={fillColor(ctx.percent)}>{`${ctx.percent}%`}</Text>
          <Text dimColor>{`${formatTokens(total)} / ${formatTokens(ctx.max)}`}</Text>
        </Box>
        <Box>
          {segments(ctx.slices, ctx.max, width).map(seg => (
            <Text key={seg.name} color={seg.color}>{'█'.repeat(seg.cells)}</Text>
          ))}
        </Box>
        <Box flexDirection="column">
          {ctx.slices.filter(sl => sl.tokens > 0).map(sl => (
            <Box key={sl.name} columnGap={1}>
              <Text color={sl.color}>■</Text>
              <Box flexGrow={1}><Text dimColor={sl.kind !== 'used'}>{sl.name}</Text></Box>
              <Text dimColor>{formatTokens(sl.tokens).padStart(5)}</Text>
              <Text dimColor>{pct(sl.tokens).padStart(6)}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const m = await read($, model)
    const ef = await read($, effort)
    const ctx = await read($, context)

    const set = async (nm: string | null, ne: Effort | null) => {
      await update($, model, () => nm)
      await update($, effort, () => ne)
    }
    const stepModel = (d: number) =>
      set(MODELS[clamp(MODELS.indexOf(m) + d, MODELS.length)] ?? null, ef)
    // ponytail: unset effort steps from 'medium' (the user's /effort default)
    const stepEffort = (d: number) =>
      set(m, EFFORTS[clamp(EFFORTS.indexOf(ef ?? 'medium') + d, EFFORTS.length)] ?? 'medium')

    // Selected option is an inverted, bold chip; the rest are tinted text.
    const chip = (key: string, label: string, color: string, isOn: boolean, onPress: () => unknown) => (
      <Button key={key} plain onPress={onPress}>
        <Text color={color} bold={isOn} inverse={isOn}>{` ${label} `}</Text>
      </Button>
    )
    const arrow = (key: string, action: string, glyph: string, onPress: () => unknown) => (
      <Button key={key} plain dimColor action={action} onPress={onPress}>{glyph}</Button>
    )

    // Simple one-line bar: fill vs free, click for the breakdown pane.
    const BAR = 24
    const filled = ctx ? Math.min(BAR, Math.round((ctx.percent / 100) * BAR)) : 0

    return (
      <Box flexDirection="column" borderStyle="round" borderColor="#4b5563" paddingX={1} rowGap={1}>
        <Box columnGap={1}>
          <Box width={7}><Text dimColor>model</Text></Box>
          {MODELS.map(alias => {
            const name = alias ?? 'default'
            return chip(name, name, MODEL_COLOR[name] ?? '#9ca3af', m === alias, () => set(alias, ef))
          })}
          <Box marginLeft={1} columnGap={1}>
            {arrow('mu', KEYS.modelUp, '▲', () => stepModel(1))}
            {arrow('md', KEYS.modelDown, '▼', () => stepModel(-1))}
          </Box>
        </Box>
        <Box columnGap={1}>
          <Box width={7}><Text dimColor>effort</Text></Box>
          {EFFORTS.map(level => chip(level, level, EFFORT_COLOR[level], ef === level, () => set(m, level)))}
          <Box marginLeft={1} columnGap={1}>
            {arrow('ed', KEYS.effortDown, '◀', () => stepEffort(-1))}
            {arrow('eu', KEYS.effortUp, '▶', () => stepEffort(1))}
          </Box>
          <Box marginLeft={2}>
            <Button key="reset" plain dimColor onPress={() => set(null, null)}>reset</Button>
          </Box>
        </Box>
        {ctx && (
          <Box columnGap={1}>
            <Box width={7}><Text dimColor>context</Text></Box>
            <Button key="ctx" plain onPress={() => $.ui.open({ id: PANE, title: 'Context', focus: true })}>
              <Text color={fillColor(ctx.percent)}>{'█'.repeat(filled)}</Text>
              <Text color={PASTEL.free}>{'█'.repeat(BAR - filled)}</Text>
            </Button>
            <Text color={fillColor(ctx.percent)}>{`${ctx.percent}%`}</Text>
            <Text dimColor>{`of ${formatTokens(ctx.max)}`}</Text>
          </Box>
        )}
        <Text dimColor>ctrl+alt+↑↓ model · ctrl+alt+←→ effort · click bar for details</Text>
      </Box>
    )
  })
}
