# subagent-model

Shows which model and effort level the session and each running subagent use. The pills appear in a box above the prompt, under any other mod's bar.

- The `session` row shows the model that answered the last main-loop request. If [model-keys](../model-keys) has an effort override set, the row shows that override.
- Each running subagent gets an `└ agent` row with its model, its effort and its description. A subagent spawned by another subagent is indented under its parent.
- A subagent's row disappears when its turn ends.
- Pill colors match model-keys.

Install: `/plugin install subagent-model --marketplace kygura/claude-mods`
