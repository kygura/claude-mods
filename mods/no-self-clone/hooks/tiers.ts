// Model tiers and the spawn decision. Pure: no `$`, so tests import it directly.

export const TIERS = ['haiku', 'sonnet', 'opus', 'fable'] as const
export type Family = (typeof TIERS)[number]

// 'claude-opus-5-5' -> 3, 'sonnet' -> 2, 'gpt-x' -> undefined.
export const tierOf = (model: string | undefined): number | undefined => {
  if (!model) return undefined
  const m = model.toLowerCase()
  const i = TIERS.findIndex(f => m.includes(f))
  return i < 0 ? undefined : i + 1
}

export const familyOf = (tier: number): Family => TIERS[Math.max(0, Math.min(TIERS.length, tier) - 1)] ?? 'haiku'

// The model a worker runs on: the configured one when it sits below the
// planner, else one tier below the planner.
export const workerFor = (parentTier: number, preferred: string) => {
  const t = tierOf(preferred)
  return t !== undefined && t < parentTier ? preferred : familyOf(parentTier - 1)
}

export type Verdict =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string }
  | { kind: 'rewrite'; model: string; why: string }

export type SpawnFacts = {
  parentModel: string
  model?: string
  fork: boolean
  resume: boolean
  subagentType: string
}

export const RULE = `# Planner rule (no-self-clone)

You are the planner. You do not delegate to copies of yourself. Every subagent, teammate and workflow agent you start runs on a model below yours (fable > opus > sonnet > haiku):

- Pass an explicit \`model\` on every Agent call and every workflow \`agent()\` call: \`sonnet\` for implementation and review, \`haiku\` for search, reads and mechanical edits.
- Never use the \`fork\` subagent type: a fork always runs on your model.
- Never omit \`model\`: an omitted model inherits yours.
- Planning, synthesis and final judgment stay with you, in this loop. Workers execute.

A hook enforces this. A spawn that breaks it is rewritten to a cheaper model or refused.`

const deny = (reason: string): Verdict => ({ kind: 'deny', reason: `no-self-clone: ${reason}` })

export const decide = (f: SpawnFacts, mode: string, preferred: string): Verdict => {
  if (f.resume) return { kind: 'allow' }
  const parent = tierOf(f.parentModel)
  // An unknown planner model, or one already at the bottom tier: nothing cheaper exists.
  if (parent === undefined || parent <= 1) return { kind: 'allow' }
  const worker = workerFor(parent, preferred)

  if (f.fork || f.subagentType === 'fork')
    return deny(`a fork runs on the planner's own model (${f.parentModel}). Spawn a general-purpose agent with model: "${worker}" and put the context it needs in its prompt.`)

  const asked = f.model && f.model !== 'inherit' ? f.model : undefined
  const child = tierOf(asked)
  // A model id this mod does not know is left alone.
  if (asked && child === undefined) return { kind: 'allow' }
  if (child !== undefined && child < parent) return { kind: 'allow' }

  const why = asked
    ? `asked for ${asked}, which is not below the planner's ${f.parentModel}`
    : `no model given, so it would inherit the planner's ${f.parentModel}`
  if (mode === 'deny')
    return deny(`${why}. Retry with model: "${worker}" (or "haiku" for search and reads).`)
  return { kind: 'rewrite', model: worker, why }
}
