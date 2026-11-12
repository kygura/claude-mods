# no-self-clone

Stops the planner from spawning copies of itself. Every subagent, teammate and workflow agent must run on a model below the one that spawned it (fable > opus > sonnet > haiku). A Fable planner that starts a workflow gets Sonnet and Haiku workers, never more Fables.

## Where it hooks

| Event | What happens |
| --- | --- |
| `prompt.compose` | The planner rule goes into the system prompt: pass an explicit cheaper `model` on every Agent and workflow `agent()` call, never fork. |
| `skill.prompt` | Any skill that talks about agents, workflows or orchestration (your build and autobuild skills, for example) gets the rule appended where the planner reads its steps. |
| `agent.spawn` | **The gate.** Runs for the Agent tool, teammates and every workflow `agent()`. A fork is always refused (it runs on the parent's model by design). A spawn with no `model`, `inherit`, or a model at or above the parent's tier is moved to the worker model, or refused in deny mode. |
| `turn.step` | Second line. Every request a tracked agent makes is checked; if anything (an agent definition's own model, a fallback, a setting) puts it back on the planner's tier, the request is rewritten to the worker model. |

A Haiku planner, resumed agents and model ids it does not recognise are left alone. A toast says each time a spawn is moved or refused.

## Settings

- `mode`: `rewrite` (default) moves an offending spawn to the worker model. `deny` refuses it, so the planner sees the error and retries with an explicit model.
- `worker_model`: `sonnet` (default), `haiku` or `opus`. If it is not below the planner, one tier below the planner is used instead.

Install: `/plugin install no-self-clone --marketplace kygura/claude-mods`
