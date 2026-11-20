export const GIT: 'git'
export function fromDeveloper(origin: { kind?: string } | undefined): boolean
export function list(v: unknown): string[]
export function check(decl: { files?: unknown; consequences?: unknown; unresolved?: unknown }): {
  files: string[]
  unresolved: string[]
  problem: string | null
}
export function covers(entry: string, path: string, cwd?: string): boolean
export function anyCovers(entries: string[], path: string, cwd?: string): boolean
export function segments(command: string): { text: string; quoted?: boolean; op?: boolean }[][]
export function gitWrite(command: string): string | null
export function shellEdits(command: string): string[]
export function parseBlock(text: string): { files: string; consequences: string; unresolved: string } | null
