export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

declare module 'claude-code' {
  interface PluginState {
    'model-keys': { model: string | null; effort: Effort | null }
  }
}
