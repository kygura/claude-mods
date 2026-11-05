// pi port of mods/prompt-sharpen: rewrites each typed prompt to be more explicit.
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"
import { getAgentDir } from "@earendil-works/pi-coding-agent"
import { SYSTEM, skip, unescape } from "../../mods/prompt-sharpen/hooks/sharpen"

const STATE = join(getAgentDir(), "prompt-sharpen.json")

function enabled(): boolean {
  try {
    return JSON.parse(readFileSync(STATE, "utf8")).enabled !== false
  } catch {
    return true
  }
}

// ponytail: first haiku-named model with auth wins; add a setting if you want to pick one.
const rewriteModel = (ctx: ExtensionContext) =>
  ctx.modelRegistry.getAvailable().find(m => /haiku/i.test(m.id)) ?? ctx.model

async function rewrite(ctx: ExtensionContext, text: string): Promise<string> {
  const model = rewriteModel(ctx)
  if (!model) return ""
  try {
    const r = await ctx.modelRegistry.complete(
      model,
      { systemPrompt: SYSTEM, messages: [{ role: "user", content: text, timestamp: Date.now() }] },
      { signal: AbortSignal.timeout(10_000) },
    )
    if (r.stopReason !== "stop") return ""
    return r.content.flatMap(c => (c.type === "text" ? [c.text] : [])).join("").trim()
  } catch {
    return ""
  }
}

export default function (pi: ExtensionAPI) {
  // The rewritten prompt, and the original wording to attach to it as hidden context.
  let pending: { text: string; original: string } | undefined

  pi.registerCommand("sharpen", {
    description: "Toggle auto-rewriting prompts for explicitness",
    handler: async (_args, ctx) => {
      const on = !enabled()
      writeFileSync(STATE, JSON.stringify({ enabled: on }) + "\n")
      ctx.ui.notify(`prompt-sharpen ${on ? "on" : "off"}`, "info")
    },
  })

  pi.on("input", async (event, ctx) => {
    // Extension messages, templates/skills (/...) and steering while a run streams are left alone.
    if (event.source === "extension" || event.text.startsWith("/") || event.streamingBehavior) {
      return { action: "continue" }
    }
    if (skip(event.text) || !enabled()) return { action: "transform", text: unescape(event.text) }

    const text = await rewrite(ctx, event.text)
    if (!text || text === event.text.trim()) return { action: "continue" }
    pending = { text, original: event.text }
    return { action: "transform", text }
  })

  // The main model still sees the original wording, so a bad rewrite can't silently change intent.
  pi.on("before_agent_start", async event => {
    const p = pending
    pending = undefined
    if (!p || event.prompt !== p.text) return
    return {
      message: {
        customType: "prompt-sharpen",
        content: `The user's message was auto-rewritten for explicitness. Their original wording:\n${p.original}`,
        display: false,
      },
    }
  })
}
