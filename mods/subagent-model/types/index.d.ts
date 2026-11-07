export type AgentRun = { description: string; model: string; effort?: string; parent?: string }
export type RootRun = { model: string; effort?: string }

declare module 'claude-code' {
  interface PluginState {
    'subagent-model': { running: Record<string, AgentRun>; root: RootRun | null }
    // Read only: model-keys' effort override, when that mod is installed.
    'model-keys': { effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null }
  }
}
