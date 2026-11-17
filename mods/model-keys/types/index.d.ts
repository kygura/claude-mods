export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** One /context category, trimmed to what the bar draws. */
export type ContextSlice = { name: string; tokens: number; color: string; kind: 'used' | 'free' | 'buffer' }
/** `tokens`/`max`/`percent` are the status line's figure; `slices` the /context estimate, out of `sliceMax`. */
export type ContextSnapshot = { slices: ContextSlice[]; max: number; percent: number; tokens: number; sliceMax?: number }

declare module 'claude-code' {
  interface PluginState {
    'model-keys': { model: string | null; effort: Effort | null; context: ContextSnapshot | null; tagged: string | null }
  }
}
