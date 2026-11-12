import type { Register } from 'claude-code'
import { RULE, decide, tierOf, workerFor } from './tiers'

const SECTION = 'no-self-clone:rule'

export const register: Register = (on, options) => {
  const mode = String(options.mode ?? 'rewrite')
  const preferred = String(options.worker_model ?? 'sonnet')

  // Each agent this session started, with the tier it must stay below and the
  // model it was put on. A reload forgets them; new spawns are tracked again.
  const ceilings = new Map<string, { below: number; model: string }>()

  // The rule rides in the planner's system prompt.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    return { sections: [...r.sections.filter(s => s.id !== SECTION), { id: SECTION, text: RULE, scope: 'session' as const }] }
  })

  // Skills that orchestrate (build, autobuild, anything that mentions agents or
  // workflows) carry the rule inline, where the planner reads its steps.
  on('skill.prompt', async ($, e, next) => {
    if (!/\b(?:Agent|Workflow|subagent|sub-agent|workflow|orchestrat\w*|spawn\w*|parallel agents?)\b/.test(e.text)) return next(e)
    return next({ ...e, text: `${e.text}\n\n${RULE}` })
  })

  // The gate: every subagent, teammate and workflow agent passes here.
  on('agent.spawn', async ($, e, next) => {
    const v = decide(
      { parentModel: e.parentModel, model: e.model, fork: e.fork, resume: e.resume !== undefined, subagentType: e.subagentType },
      mode,
      preferred,
    )
    if (v.kind === 'deny') {
      $.ui.toast(`no-self-clone: refused ${e.fork ? 'a fork' : `"${e.description}"`}`)
      return { deny: v.reason }
    }
    const below = tierOf(e.parentModel)
    if (v.kind === 'allow') {
      const r = await next(e)
      if (r.agentId && below !== undefined && below > 1) ceilings.set(r.agentId, { below, model: r.model })
      return r
    }
    $.ui.toast(`no-self-clone: "${e.description}" moved to ${v.model} (${v.why})`)
    const r = await next({ ...e, model: v.model })
    if (r.agentId && below !== undefined) ceilings.set(r.agentId, { below, model: v.model })
    return r
  })

  // Second line: a tracked agent's requests never reach the planner's tier,
  // whatever resolved its model (an agent definition, a fallback, a setting).
  on('turn.step', async function* ($, e, next) {
    const c = e.agentId === undefined ? undefined : ceilings.get(e.agentId)
    const t = tierOf(e.model)
    if (!c || t === undefined || t < c.below) return yield* next(e)
    const model = (tierOf(c.model) ?? c.below) < c.below ? c.model : workerFor(c.below, preferred)
    return yield* next({ ...e, model })
  })

  on('turn.complete', async ($, e, next) => {
    // A subagent's run is over; a teammate wakes again and is tracked again at its next spawn.
    if (e.agentId) ceilings.delete(e.agentId)
    return next(e)
  })
}
