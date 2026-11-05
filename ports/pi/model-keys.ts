// pi port of mods/model-keys: ctrl+alt+arrows step the model and thinking level,
// and a widget above the editor shows both plus a context fill bar.
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai"
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"
import { formatTokens } from "../../mods/model-keys/hooks/context-bar"

type Level = ReturnType<ExtensionAPI["getThinkingLevel"]>
const WIDTH = 20

// Same pastels as the Claude Code context bar.
const SAGE = "#a8c5a0"
const BUTTER = "#ddd4a3"
const ROSE = "#d4a5a5"
const EMPTY = "#454a54"
const fill = (percent: number) => (percent >= 85 ? ROSE : percent >= 60 ? BUTTER : SAGE)
const fg = (hex: string, s: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  return `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m`
}

export default function (pi: ExtensionAPI) {
  let initial: { model: ExtensionContext["model"]; level: Level } | undefined

  function render(ctx: ExtensionContext) {
    if (!ctx.hasUI) return
    const parts = [ctx.model?.id ?? "no model", pi.getThinkingLevel()]
    const usage = ctx.getContextUsage()
    if (usage?.tokens != null && usage.percent != null) {
      const cells = Math.min(WIDTH, Math.round((usage.percent / 100) * WIDTH))
      const bar = fg(fill(usage.percent), "█".repeat(cells)) + fg(EMPTY, "█".repeat(WIDTH - cells))
      parts.push(`${bar} ${Math.round(usage.percent)}% ${formatTokens(usage.tokens)}/${formatTokens(usage.contextWindow)}`)
    }
    ctx.ui.setWidget("model-keys", [parts.join("  ·  ")])
  }

  async function stepModel(ctx: ExtensionContext, d: number) {
    const list = ctx.scopedModels.length ? ctx.scopedModels.map(s => s.model) : ctx.modelRegistry.getAvailable()
    if (!list.length) return
    const i = list.findIndex(m => m.provider === ctx.model?.provider && m.id === ctx.model?.id)
    // Not in the list: forward lands on the first entry, backward on the last.
    const next = list[i === -1 ? (d > 0 ? 0 : list.length - 1) : (i + d + list.length) % list.length]
    await setModel(ctx, next)
  }

  async function setModel(ctx: ExtensionContext, model: NonNullable<ExtensionContext["model"]>) {
    if (!(await pi.setModel(model))) ctx.ui.notify(`No API key for ${model.provider}/${model.id}`, "warning")
  }

  // Steps through the levels the model supports; the ends act as stops.
  function stepLevel(ctx: ExtensionContext, d: number) {
    const levels = ctx.model ? getSupportedThinkingLevels(ctx.model) : ["off" as const]
    const i = levels.indexOf(pi.getThinkingLevel())
    pi.setThinkingLevel(levels[Math.max(0, Math.min(levels.length - 1, i + d))])
  }

  pi.registerShortcut("ctrl+alt+up", { description: "Next model", handler: ctx => stepModel(ctx, 1) })
  pi.registerShortcut("ctrl+alt+down", { description: "Previous model", handler: ctx => stepModel(ctx, -1) })
  pi.registerShortcut("ctrl+alt+right", { description: "Raise thinking level", handler: ctx => stepLevel(ctx, 1) })
  pi.registerShortcut("ctrl+alt+left", { description: "Lower thinking level", handler: ctx => stepLevel(ctx, -1) })

  pi.registerCommand("model-keys", {
    description: "reset: return to the model and thinking level the session started with",
    handler: async (args, ctx) => {
      if (args.trim() !== "reset" || !initial) return ctx.ui.notify("Usage: /model-keys reset", "info")
      if (initial.model) await setModel(ctx, initial.model)
      pi.setThinkingLevel(initial.level)
    },
  })

  pi.on("session_start", (e, ctx) => {
    // /reload starts a fresh runtime with no baseline, so it takes the current state.
    if (e.reason === "startup" || e.reason === "new" || !initial) initial = { model: ctx.model, level: pi.getThinkingLevel() }
    render(ctx)
  })
  pi.on("model_select", (_e, ctx) => render(ctx))
  pi.on("thinking_level_select", (_e, ctx) => render(ctx))
  pi.on("turn_end", (_e, ctx) => render(ctx))
  pi.on("session_compact", (_e, ctx) => render(ctx))
}
