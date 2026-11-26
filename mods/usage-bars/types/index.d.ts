export type Limit = { label: string; percent: number; severity: string; resetsAt: string | null }
export type Extra = { isEnabled: boolean; used: number | null; limit: number | null; currency: string | null }
export type Usage = { limits: Limit[]; extra: Extra | null; fetchedAt: number; error?: string }

declare module 'claude-code' {
  interface PluginState {
    'usage-bars': { usage: Usage | null }
  }
}
