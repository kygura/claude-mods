// The style rules and the linter. Pure: no `$`, so tests import it directly.

export type Violation = { rule: string; match: string; line: number; fix: string }

type Rule = { id: string; re: RegExp; fix: string; keep?: (m: RegExpExecArray, text: string) => boolean }

// Phrases are matched case-insensitively on word boundaries. Keep each entry
// specific enough that ordinary UI copy ("Unlock account", "Navigate to settings")
// never trips it.
const WORDS: [string, string][] = [
  ['delve|delves|delving', 'say "look at" or "cover"'],
  ['tapestry', 'cut it'],
  ['testament to', 'say what it shows'],
  ['realm of', 'name the field'],
  ['embark(?:s|ed|ing)? on', 'say "start"'],
  ['unleash(?:es|ed|ing)?', 'say what it does'],
  ['supercharg(?:e|es|ed|ing)', 'say what gets faster, and by how much'],
  ['game[- ]chang(?:er|ers|ing)', 'say what changed'],
  ['cutting[- ]edge', 'name the feature'],
  ['revolutioni[sz](?:e|es|ed|ing)', 'say what it changes'],
  ['revolutionary', 'say what is new'],
  ['groundbreaking', 'say what is new'],
  ['seamless(?:ly)?', 'say what the user does not have to do'],
  ['effortless(?:ly)?', 'say how many steps it takes'],
  ['elevat(?:e|es|ed|ing)', 'say what improves'],
  ['empower(?:s|ed|ing|ment)?', 'say what the user can now do'],
  ['leverag(?:e|es|ed|ing)', 'say "use"'],
  ['synerg(?:y|ies|istic)', 'cut it'],
  ['holistic(?:ally)?', 'cut it'],
  ['paradigm(?:s| shift)?', 'cut it'],
  ['robust', 'say what it survives'],
  ['pivotal', 'say "key" or cut it'],
  ['crucial(?:ly)?', 'say why it matters, or cut it'],
  ['vibrant', 'cut it'],
  ['bustling', 'cut it'],
  ['meticulous(?:ly)?', 'cut it'],
  ['intricate(?:ly)?', 'say "detailed" or cut it'],
  ['multifaceted', 'cut it'],
  ['nuanced', 'cut it'],
  ['myriad', 'say "many" or give the number'],
  ['plethora', 'say "many" or give the number'],
  ['comprehensive', 'say what it covers'],
  ['streamlin(?:e|es|ed|ing)', 'say what got shorter'],
  ['transformative', 'say what changes'],
  ['unparalleled', 'cut it'],
  ['world[- ]class', 'cut it'],
  ['best[- ]in[- ]class', 'cut it'],
  ['state[- ]of[- ]the[- ]art', 'name the method'],
  ['next[- ]level|to the next level', 'say what improves'],
  ['ever[- ](?:evolving|changing)', 'cut it'],
  ['fast[- ]paced', 'cut it'],
  ["in today'?s", 'cut the scene-setting'],
  ['harness(?:es|ing)? the power', 'say "use"'],
  ['unlock(?:s|ing)? the (?:power|potential|full)', 'say what the user can do'],
  ['the power of', 'cut it'],
  ['look no further', 'cut it'],
  ['deep[- ]dive|dive (?:in|into|deep)|let\'?s dive', 'say "look at"'],
  ['navigat(?:e|ing) the (?:complexities|landscape|world)', 'cut it'],
  ['at its core', 'cut it'],
  ['in essence', 'cut it'],
  ["it'?s worth noting|it is worth noting|worth mentioning", 'state the fact'],
  ["it'?s important to (?:note|remember)|it is important to (?:note|remember)", 'state the fact'],
  ['load[- ]bearing', 'cut it'],
  ['rest assured', 'cut it'],
  ['i hope this helps', 'cut it'],
  ['great question', 'cut it'],
  ['happy to help', 'cut it'],
  ["i'?d be happy to", 'just do it'],
  ['buckle up', 'cut it'],
  ['spoiler(?: alert)?', 'cut it'],
  ['pro tip', 'say "tip" or cut it'],
  ["here'?s the (?:thing|kicker|catch|deal)", 'state the point'],
  ["let'?s (?:be honest|face it)", 'cut it'],
  ['say goodbye to', 'say what stops happening'],
  ['magic(?:al|ally)?', 'say what it does'],
  ['tailor(?:ed)? to your', 'say what it adapts to'],
  ['foster(?:s|ed|ing)?', 'say "build" or "help"'],
  ['underscor(?:es|ed|ing) the', 'say "shows"'],
  ['boasts?', 'say "has"'],
  ['showcas(?:e|es|ed|ing)', 'say "shows"'],
  ['embrac(?:e|es|ed|ing)', 'say "use" or "adopt"'],
  ['journey', 'name the steps'],
  ['ecosystem', 'name the parts'],
  ['curated', 'say who picked them'],
  ['crafted', 'say "made" or cut it'],
]

// "embark(?:s|ed)? on" -> "embark on", "deep[- ]dive|dive in" -> "deep-dive".
const label = (w: string) =>
  (w.replace(/\(\?:[^)]*\)\??/g, '').split('|')[0] ?? w).replace(/\[- \]/g, '-').replace(/'\?/g, "'").replace(/\\/g, '').replace(/\s+/g, ' ').trim()

const RULES: Rule[] = [
  { id: 'em dash', re: /\u2014/g, fix: 'use a comma, period, colon or parentheses' },
  {
    id: 'en dash',
    re: /\u2013/g,
    fix: 'use a hyphen for ranges, otherwise a comma or period',
    // Allowed only in a numeric range: 2020\u20132024, 5\u201310.
    keep: (m, t) => !(/\d\s?$/.test(t.slice(0, m.index)) && /^\s?\d/.test(t.slice(m.index + 1))),
  },
  { id: 'double-hyphen dash', re: /(?<=\w)\s--\s(?=\w)/g, fix: 'use a comma or period' },
  { id: 'exclamation mark', re: /(?<=[\p{L}\p{N})"'])!+(?=\s|$|["')\]])/gu, fix: 'end with a period' },
  {
    id: 'emoji',
    re: /\p{Extended_Pictographic}/gu,
    fix: 'remove it',
    keep: m => !['\u00a9', '\u00ae', '\u2122'].includes(m[0]),
  },
  { id: '"not just X, but Y"', re: /\bnot (?:just|only|merely) [^.;:!?\n]{1,60}?,? but\b/gi, fix: 'say the one thing it is' },
  {
    id: '"it\'s not X, it\'s Y"',
    re: /\b(?:it'?s|this is|that'?s|they'?re|is) not (?:just |only |merely |about )?[^.;:!?\n]{1,50}?[,;.]\s*(?:it'?s|this is|they'?re|it is)\b/gi,
    fix: 'say what it is, once',
  },
  { id: '"more than just"', re: /\bmore than (?:just|a|an) [^.;\n]{1,30}?\b/gi, fix: 'say what it is' },
  { id: '"whether you\'re X or Y"', re: /\bwhether you'?re\b[^.\n]{1,80}?\bor\b/gi, fix: 'name the reader' },
  {
    id: 'teaser question',
    re: /\b(?:the|your) (?:result|catch|kicker|best part|twist|answer|secret|bottom line)\?/gi,
    fix: 'state it',
  },
  {
    id: 'sassy opener',
    re: /(?:^|[.!?]\s+)(?:oh|well|look|psst|newsflash|plot twist|honestly|okay so|so yeah|yep|nope|ta-?da|voil[aà]|boom)[,:!.\u2014]/gim,
    fix: 'start with the point',
  },
  {
    id: 'servile opener',
    re: /(?:^|\n)\s*(?:absolutely|certainly|of course|sure thing|great)[!,.]/gi,
    fix: 'start with the answer',
  },
  ...WORDS.map(([w, fix]) => ({ id: `"${label(w)}"`, re: new RegExp(`\\b(?:${w})\\b`, 'gi'), fix })),
]

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length

// Lints prose. `text` should already be prose only (see `extract`).
export const lint = (text: string, max = 25): Violation[] => {
  const out: Violation[] = []
  for (const r of RULES) {
    r.re.lastIndex = 0
    for (let m = r.re.exec(text); m; m = r.re.exec(text)) {
      if (m[0] === '') {
        r.re.lastIndex++
        continue
      }
      if (r.keep && !r.keep(m, text)) continue
      out.push({ rule: r.id, match: m[0].trim(), line: lineOf(text, m.index + (m[0].length - m[0].trimStart().length)), fix: r.fix })
      if (out.length >= max) return out.sort((a, b) => a.line - b.line)
    }
  }
  return out.sort((a, b) => a.line - b.line)
}

// Replaces every character of a span with spaces, keeping newlines, so line
// numbers still point into the original file.
const blank = (s: string) => s.replace(/[^\n]/g, ' ')

// Markdown and plain text: drop code (fenced, indented-fence, inline), link
// targets, HTML comments and front matter keys, keep the words.
export const fromMarkdown = (src: string) =>
  src
    .replace(/^---\n[\s\S]*?\n---\n/, blank)
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/`[^`\n]*`/g, blank)
    .replace(/\]\([^)\s]*\)/g, m => `]${blank(m.slice(1))}`)
    .replace(/https?:\/\/\S+/g, blank)

// HTML: drop scripts, styles, comments and tags; keep text and the attributes
// people read (alt, title, placeholder, aria-label, content, label).
export const fromHtml = (src: string) => {
  const out = src
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .split('')
  for (const tag of src.matchAll(/<[^>]*>/g)) {
    const start = tag.index!
    for (let i = 0; i < tag[0].length; i++) if (out[start + i] !== '\n') out[start + i] = ' '
    for (const a of tag[0].matchAll(/\b(?:alt|title|placeholder|aria-label|content|label)\s*=\s*"([^"]*)"/gi)) {
      const at = start + a.index! + a[0].indexOf('"') + 1
      const v = a[1] ?? ''
      for (let i = 0; i < v.length; i++) out[at + i] = v[i] ?? ' '
    }
  }
  return out.join('')
}

// Source code: only what a person reads. JSX text between tags, and string
// literals that hold at least two words. Comments, identifiers and
// one-word strings (keys, class names, enum values) are skipped.
export const fromCode = (src: string) => {
  const out = blank(src).split('')
  const keep = (start: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[start + i] = s[i] ?? ' '
  }
  const noComments = src.replace(/\/\*[\s\S]*?\*\/|(?<![:"'`\\])\/\/[^\n]*/g, blank)
  for (const m of noComments.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
    const body = m[2] ?? ''
    if (/[A-Za-z]{2,}[^\S\n]+[A-Za-z]{2,}/.test(body))
      keep(m.index! + 1, body.replace(/\$\{[^}]*\}/g, blank).replace(/\\[nt]/g, '  '))
  }
  for (const m of noComments.matchAll(/>([^<>{}]*[A-Za-z]{2,}[^<>{}]*)</g)) keep(m.index! + 1, m[1] ?? '')
  return out.join('')
}

// Key/value data files people read through an app (locale files, CMS content).
export const fromData = (src: string, ext: string) => (ext === 'json' ? fromCode(src) : fromMarkdown(src))

const PROSE = new Set(['md', 'mdx', 'markdown', 'txt', 'rst', 'adoc', 'asciidoc', 'textile', 'org', 'tex', 'eml'])
const MARKUP = new Set(['html', 'htm', 'xhtml', 'ejs', 'hbs', 'handlebars', 'njk', 'liquid', 'erb', 'twig', 'jinja', 'j2'])
const UI_CODE = new Set(['jsx', 'tsx', 'vue', 'svelte', 'astro', 'swift', 'kt', 'dart', 'js', 'ts', 'mjs', 'cjs'])
const DATA = new Set(['json', 'yaml', 'yml', 'toml', 'po', 'pot', 'strings', 'properties', 'arb', 'xliff', 'xlf', 'resx', 'csv'])
const LOCALE_PATH = /(?:^|\/)(?:locales?|i18n|l10n|lang|langs|translations?|messages|content|copy|strings)(?:\/|$)/i

// What part of a file reaches people, or null when none does.
export const proseOf = (path: string, src: string): string | null => {
  const ext = (path.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? '').toLowerCase()
  if (PROSE.has(ext)) return fromMarkdown(src)
  if (MARKUP.has(ext)) return fromHtml(src)
  if (UI_CODE.has(ext)) return fromCode(src)
  if (DATA.has(ext) && (LOCALE_PATH.test(path) || ext === 'po' || ext === 'strings' || ext === 'arb' || ext === 'xliff' || ext === 'xlf'))
    return fromData(src, ext)
  return null
}

// Text the model writes into a git commit, PR, issue, post or message.
export const PUBLISH_FIELDS = new Set(['body', 'title', 'message', 'text', 'content', 'description', 'subject', 'comment', 'summary', 'caption', 'markdown'])
export const PUBLISH_TOOL = /(?:create|update|send|post|reply|comment|publish|write|draft|forward|add_issue|issue_write|review)/i

export const commitMessage = (command: string): string | null => {
  if (!/\bgit\s+(?:-C\s+\S+\s+)?(?:commit|tag)\b/.test(command)) return null
  const parts = [...command.matchAll(/(?:-m|--message)(?:=|\s+)(?:"((?:\\.|[^"\\])*)"|'([^']*)')/g)].map(m => m[1] ?? m[2])
  const heredoc = command.match(/<<\s*'?(\w+)'?\n([\s\S]*?)\n\s*\1/)
  if (heredoc) parts.push(heredoc[2])
  return parts.length ? parts.join('\n') : null
}

export const report = (where: string, v: Violation[]) =>
  [
    `strict-prose: ${where} breaks the house writing rules. Rewrite it and try again. Do not work around the check (no unicode escapes, no splitting words, no moving text to another file).`,
    ...v.map(x => `  line ${x.line}: ${x.rule} ("${x.match}"): ${x.fix}`),
  ].join('\n')

// Prompts that ask for text other people will read.
export const COPY_REQUEST =
  /\b(?:copy|copywrit\w*|tagline|headline|slogan|landing page|hero|blog|post|article|newsletter|email|e-mail|tweet|thread|linkedin|announcement|press release|release notes|changelog|readme|docs?|documentation|onboarding|tooltip|button|label|placeholder|error message|empty state|microcopy|ui text|marketing|website|homepage|bio|about page|product description|description|caption|publish|publication|write[- ]?up|essay|cover letter|pitch|faq)\b/i

export const RULES_TEXT = `# House writing rules (strict-prose)

These rules apply to every piece of text a person other than the user will read: UI strings, docs, READMEs, commit messages, PR and issue text, emails, posts, release notes, marketing copy, and any copy you write in chat for the user to paste somewhere. A hook checks every file write and publishing tool call and refuses text that breaks them.

- No em dashes (\u2014). No en dashes (\u2013) except in numeric ranges. No " -- " as a dash. Use commas, periods, colons or parentheses.
- No exclamation marks. No emoji.
- No hype words: delve, tapestry, seamless, effortless, elevate, empower, leverage, robust, unleash, supercharge, cutting-edge, game-changer, revolutionize, transformative, world-class, state-of-the-art, next-level, comprehensive, streamline, crucial, pivotal, vibrant, meticulous, intricate, nuanced, myriad, plethora, journey, ecosystem, magic, curated, crafted, embrace, foster, showcase, boasts.
- No filler: "it's worth noting", "it's important to note", "in essence", "at its core", "in today's ...", "the power of", "look no further", "dive into", "deep dive", "rest assured", "I hope this helps", "great question", "I'd be happy to".
- No stock structures: "not just X, but Y", "it's not X, it's Y", "more than just", "whether you're X or Y", teaser questions ("The result?"), sassy openers ("Oh,", "Look,", "Spoiler:", "Here's the thing"), servile openers ("Absolutely!", "Certainly!").
- Register: plain, specific, declarative. Say what the thing does, with numbers where you have them. Short sentences. No cheerleading, no winks, no attitude. Write like a careful engineer writing a manual, not like a landing page.
`
