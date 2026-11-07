import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentRun, RootRun } from '../types'

// Running subagents of this session, by agentId, in spawn order.
const agents = atom({ plugin: 'subagent-model', key: 'running' } as const, {} as Record<string, AgentRun>)
// The main loop's last request.
const root = atom({ plugin: 'subagent-model', key: 'root' } as const, null as RootRun | null)
// model-keys rewrites the main loop's effort beneath this hook, so its choice is read directly.
const keysEffort = { plugin: 'model-keys', key: 'effort' } as const

// Same palette as model-keys.
const MODEL_COLOR: Record<string, string> = {
  default: '#9ca3af',
  haiku: '#34d399',
  sonnet: '#60a5fa',
  opus: '#c084fc',
  fable: '#f59e0b',
}
const EFFORT_COLOR: Record<string, string> = {
  low: '#38bdf8',
  medium: '#4ade80',
  high: '#facc15',
  xhigh: '#fb923c',
  max: '#f87171',
}

// 'claude-haiku-5-5' -> 'haiku 5.5'; unknown ids pass through.
const family = (id: string) => Object.keys(MODEL_COLOR).find(f => id.includes(f))
const shortModel = (id: string) => {
  const f = family(id)
  const version = id.match(/(\d+)-(\d+)/)
  return f ? `${f}${version ? ` ${version[1]}.${version[2]}` : ''}` : id
}

// Depth-first order: each agent followed by the agents it spawned.
export const tree = (all: Record<string, AgentRun>) => {
  const rows: { id: string; run: AgentRun; depth: number }[] = []
  const walk = (parent: string | undefined, depth: number) => {
    for (const [id, run] of Object.entries(all)) {
      // An agent whose parent already finished hangs off the root.
      const p = run.parent && all[run.parent] ? run.parent : undefined
      if (p === parent) {
        rows.push({ id, run, depth })
        walk(id, depth + 1)
      }
    }
  }
  walk(undefined, 1)
  return rows
}

export const register: Register = on => {
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    const agentId = r.agentId
    if (agentId) {
      await update($, agents, all => ({
        ...all,
        [agentId]: { description: e.description, parent: e.parentAgentId, ...all[agentId], model: all[agentId]?.model ?? r.model },
      }))
    }
    return r
  })

  on('turn.step', async function* ($, e, next) {
    const agentId = e.agentId
    const effort = e.effort === undefined ? undefined : String(e.effort)
    if (agentId === undefined) {
      const result = yield* next(e)
      // The model that answered, after any rewrite or fallback beneath this hook.
      const model = result.usage?.model ?? e.model
      const override = (await $.state.get(keysEffort).catch(() => undefined))?.value
      const run: RootRun = { model, effort: override ?? effort }
      const prev = await read($, root)
      if (prev?.model !== run.model || prev?.effort !== run.effort) await update($, root, () => run)
      return result
    }
    const prev = (await read($, agents))[agentId]
    if (prev && (prev.model !== e.model || prev.effort !== effort)) {
      await update($, agents, all => (all[agentId] ? { ...all, [agentId]: { ...all[agentId], model: e.model, effort } } : all))
    }
    return yield* next(e)
  })

  // A subagent's turn ending means it finished: drop its row.
  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId) {
      await update($, agents, all => {
        const { [agentId]: _, ...rest } = all
        return rest
      })
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // The band is one slot: draw beneath whatever the other mods draw, never in place of it.
    const others = await next(e)
    const main = await read($, root)
    if (e.props.hasSurvey || !main) return others

    const { Box, Text } = $.ui.resolve(e)
    const chip = (label: string, color: string) => (
      <Text color={color} bold inverse>{` ${label} `}</Text>
    )
    const pills = (run: RootRun) => [
      chip(shortModel(run.model), MODEL_COLOR[family(run.model) ?? 'default'] ?? '#9ca3af'),
      chip(run.effort ?? 'n/a', (run.effort && EFFORT_COLOR[run.effort]) ?? '#9ca3af'),
    ]

    return (
      <Box flexDirection="column">
        {others}
        <Box flexDirection="column" borderStyle="round" borderColor="#4b5563" paddingX={1}>
          <Box key="root" columnGap={1}>
            <Box width={9}><Text dimColor>session</Text></Box>
            {pills(main)}
          </Box>
          {tree(await read($, agents)).map(({ id, run, depth }) => (
            <Box key={id} columnGap={1}>
              <Box width={9}><Text dimColor>{`${'  '.repeat(depth - 1)}└ agent`}</Text></Box>
              {pills(run)}
              <Text dimColor wrap="truncate">{run.description}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
