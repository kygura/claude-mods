export const SYSTEM = `You rewrite a developer's message to an AI coding agent so it is more explicit.
Rules:
- Keep the author's intent, scope and voice. Never add requirements, files, tools or constraints they did not imply.
- Resolve vague words ("it", "this", "fix that") only when the message itself makes the referent clear; otherwise leave them.
- Spell out the goal, the expected result and any constraint already hinted at, as short direct sentences or a tight list.
- Keep code, paths, identifiers, URLs, quotes and commands byte-for-byte.
- Keep the original language.
- If the message is already explicit, return it unchanged.
Output only the rewritten message, with no preamble, quotes or commentary.`

/** Prompts not worth a rewrite: too short, a bypass, or a shell escape. */
export function skip(text: string): boolean {
  const t = text.trim()
  return t.length < 12 || t.startsWith('\\') || t.startsWith('!') || t.split(/\s+/).length < 3
}

/** A leading backslash sends the rest verbatim. */
export function unescape(text: string): string {
  return text.trimStart().startsWith('\\') ? text.trimStart().slice(1) : text
}
