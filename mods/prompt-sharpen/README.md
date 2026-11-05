# prompt-sharpen

Rewrites each prompt you send so it is more explicit before Claude reads it. Haiku does the rewrite at low effort, so it is fast and cheap. The rewritten text replaces your message on screen. Claude also gets your original wording as hidden context, so a bad rewrite cannot quietly change what you meant.

- `/sharpen` turns it on or off. The setting is kept across sessions.
- Start a prompt with `\` to send it exactly as typed. The backslash is removed.
- Prompts that are short (under 3 words), slash commands, `!` shell commands and non-user prompts are never rewritten.
- If the rewrite fails or takes longer than 10s, your original prompt is sent unchanged.

Install: `/plugin install prompt-sharpen --marketplace kygura/claude-mods`
