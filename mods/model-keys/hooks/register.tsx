import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Effort } from '../types'

const model = atom({ plugin: 'model-keys', key: 'model' } as const, null)
const effort = atom({ plugin: 'model-keys', key: 'effort' } as const, null)

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

const clamp = (i: number, n: number) => Math.max(0, Math.min(n - 1, i))

export const register: Register = on => {
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    const m = await read($, model)
    const ef = await read($, effort)
    return yield* next({ ...e, ...(m && { model: m }), ...(ef && { effort: ef }) })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const m = await read($, model)
    const ef = await read($, effort)

    const set = async (nm: string | null, ne: Effort | null) => {
      await update($, model, () => nm)
      await update($, effort, () => ne)
      $.ui.status(nm || ne ? `⚙ ${nm ?? 'default'} · ${ne ?? 'default'}` : undefined)
    }
    const stepModel = (d: number) =>
      set(MODELS[clamp(MODELS.indexOf(m) + d, MODELS.length)], ef)
    // ponytail: unset effort steps from 'medium' (the user's /effort default)
    const stepEffort = (d: number) =>
      set(m, EFFORTS[clamp(EFFORTS.indexOf(ef ?? 'medium') + d, EFFORTS.length)])

    // Selected option is an inverted, bold chip; the rest are tinted text.
    const chip = (key: string, label: string, color: string, isOn: boolean, onPress: () => unknown) => (
      <Button key={key} plain onPress={onPress}>
        <Text color={color} bold={isOn} inverse={isOn}>{` ${label} `}</Text>
      </Button>
    )
    const arrow = (key: string, action: string, glyph: string, onPress: () => unknown) => (
      <Button key={key} plain dimColor action={action} onPress={onPress}>{glyph}</Button>
    )

    return (
      <Box flexDirection="column" borderStyle="round" borderColor="#4b5563" paddingX={1} rowGap={1}>
        <Box columnGap={1}>
          <Box width={7}><Text dimColor>model</Text></Box>
          {MODELS.map(alias => {
            const name = alias ?? 'default'
            return chip(name, name, MODEL_COLOR[name], m === alias, () => set(alias, ef))
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
        <Text dimColor>ctrl+alt+↑↓ model · ctrl+alt+←→ effort · click to pick</Text>
      </Box>
    )
  })
}
