// opencode port of mods/prompt-sharpen: rewrites each typed prompt to be more explicit.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { Plugin } from "@opencode-ai/plugin"
import type { TextPart } from "@opencode-ai/sdk"
import { SYSTEM, skip, unescape } from "../../mods/prompt-sharpen/hooks/sharpen"

const STATE = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "opencode", "prompt-sharpen.json")
const AGENT = "prompt-sharpen"

function enabled(): boolean {
  try {
    return JSON.parse(readFileSync(STATE, "utf8")).enabled !== false
  } catch {
    return true
  }
}

type ModelRef = { providerID: string; modelID: string }

// Cleanup runs in the background, off the user's critical path.
const background = (p: () => Promise<unknown>) => void p().catch(() => {})

export const PromptSharpen: Plugin = async ({ client }) => {
  let small: ModelRef | undefined
  // Sessions whose next message comes from a command template, not the composer.
  const fromCommand = new Set<string>()
  // Our throwaway rewrite sessions.
  const rewriting = new Set<string>()

  // One-shot completion in a throwaway child session, using the tool-less agent below.
  // Any failure, or 10s spent on create + prompt, yields "" so the original is sent.
  async function rewrite(parentID: string, text: string, model?: ModelRef): Promise<string> {
    const signal = AbortSignal.timeout(10_000)
    let id: string | undefined
    try {
      id = (await client.session.create({ body: { parentID, title: AGENT }, signal })).data?.id
      if (!id) return ""
      rewriting.add(id)
      const r = await client.session.prompt({
        path: { id },
        body: { agent: AGENT, model: small ?? model, tools: { "*": false }, parts: [{ type: "text", text }] },
        signal,
      })
      if (r.error || r.data?.info.error || r.data?.info.finish !== "stop") return ""
      return r.data.parts.flatMap(p => (p.type === "text" && !p.synthetic ? [p.text] : [])).join("").trim()
    } catch {
      return ""
    } finally {
      const sid = id
      if (sid)
        background(async () => {
          try {
            if (signal.aborted) await client.session.abort({ path: { id: sid } })
            await client.session.delete({ path: { id: sid } })
          } finally {
            rewriting.delete(sid)
          }
        })
    }
  }

  return {
    config: async cfg => {
      const [providerID, ...rest] = cfg.small_model?.split("/") ?? []
      small = providerID && rest.length ? { providerID, modelID: rest.join("/") } : undefined
      cfg.agent = {
        ...cfg.agent,
        [AGENT]: { mode: "subagent", hidden: true, prompt: SYSTEM, description: "Rewrites prompts for explicitness" },
      }
      cfg.command = {
        ...cfg.command,
        sharpen: { template: "Toggle prompt-sharpen.", description: "Toggle auto-rewriting prompts for explicitness" },
      }
    },

    // Without this, opencode appends env, AGENTS.md/CLAUDE.md and skills to every agent prompt.
    "experimental.chat.system.transform": async (input, output) => {
      if (input.sessionID && rewriting.has(input.sessionID)) output.system.splice(0, output.system.length, SYSTEM)
    },

    "command.execute.before": async (input, output) => {
      fromCommand.add(input.sessionID)
      if (input.command !== "sharpen") return
      const on = !enabled()
      let reply = `prompt-sharpen ${on ? "on" : "off"}`
      try {
        mkdirSync(dirname(STATE), { recursive: true })
        writeFileSync(STATE, JSON.stringify({ enabled: on }) + "\n")
      } catch {
        reply = `prompt-sharpen: could not save ${STATE}`
      }
      // ponytail: commands always reach the model, so the toggle costs one tiny reply.
      for (const p of output.parts) if (p.type === "text") p.text = `Reply with exactly "${reply}" and nothing else.`
    },

    "chat.message": async (input, output) => {
      if (fromCommand.delete(input.sessionID)) return
      const part = output.parts.find((p): p is TextPart => p.type === "text" && !p.synthetic)
      if (!part) return
      // Subagent sessions, including our own rewrite sessions, are left alone (as is anything we can't check).
      const session = await client.session.get({ path: { id: input.sessionID } }).catch(() => undefined)
      if (!session?.data || session.data.parentID) return
      if (skip(part.text) || !enabled()) {
        part.text = unescape(part.text)
        return
      }

      const original = part.text
      const text = await rewrite(input.sessionID, original, input.model)
      if (!text || text === original.trim()) return
      part.text = text
      // The main model still sees the original wording (synthetic parts are hidden in the UI).
      output.parts.splice(output.parts.indexOf(part) + 1, 0, {
        ...part,
        id: `${part.id}0`,
        text: `The user's message was auto-rewritten for explicitness. Their original wording:\n${original}`,
        synthetic: true,
      })
    },
  }
}
