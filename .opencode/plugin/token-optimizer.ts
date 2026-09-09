// Token Optimizer plugin — .opencode/token-optimizer.json dosyasını okur ve uygular.
// Otomatik keşif: .opencode/plugin/ altındaki her *.ts dosyası plugin sayılır.
// Tüm mantık try/catch korumalıdır; herhangi bir hata olursa istek aynen geçirilir.

import * as fs from "node:fs"
import * as path from "node:path"

type Cfg = {
  token_optimizer?: {
    enabled?: boolean
    remove_duplicates?: boolean
    remove_empty_content?: boolean
    max_context_tokens?: number
    reserved_output_tokens?: number
  }
  processing?: {
    normalize_whitespace?: boolean
    remove_duplicate_messages?: boolean
    trim_old_history?: boolean
  }
  budget?: { max_output_tokens?: number }
}

function loadConfig(): Cfg {
  try {
    const p = path.join(__dirname, "..", "token-optimizer.json")
    return JSON.parse(fs.readFileSync(p, "utf8"))
  } catch {
    return {}
  }
}

function textOf(content: unknown): string {
  try {
    if (typeof content === "string") return content
    if (Array.isArray(content)) {
      return content
        .map((p) => {
          if (typeof p === "string") return p
          if (p && typeof p === "object") {
            const o = p as Record<string, unknown>
            if (typeof o["text"] === "string") return o["text"] as string
            if (o["type"] === "text" && typeof o["text"] === "string") return o["text"] as string
          }
          return ""
        })
        .join("\n")
    }
    return ""
  } catch {
    return ""
  }
}

export default async () => {
  const cfg = loadConfig()
  const enabled = cfg.token_optimizer?.enabled !== false
  if (!enabled) return {}

  const maxOutput = cfg.budget?.max_output_tokens ?? cfg.token_optimizer?.reserved_output_tokens ?? 2048

  return {
    // Çıktı bütçesi: model isteğine üst sınır koy
    "chat.params": async (input: any, output: any) => {
      try {
        const params = output?.params ?? input?.params
        if (params && typeof params === "object") {
          if (typeof params.maxTokens === "number") {
            params.maxTokens = Math.min(params.maxTokens, maxOutput)
          } else {
            params.maxTokens = maxOutput
          }
        }
      } catch {
        // aynen geçir
      }
    },

    // Girdi kırpma: boş içerikleri at, whitespace normalize et, kaba duplikaları ele
    "experimental.chat.messages.transform": async (input: any, output: any) => {
      try {
        const messages = output?.messages ?? input?.messages
        if (!Array.isArray(messages)) return

        const removeEmpty = cfg.token_optimizer?.remove_empty_content !== false
        const normalize = cfg.processing?.normalize_whitespace !== false
        const dedupe = cfg.token_optimizer?.remove_duplicates !== false

        const seen = new Set<string>()
        const kept: unknown[] = []

        for (const m of messages) {
          const text = textOf((m as Record<string, unknown>)?.["content"])
          // 1) boş içerik
          if (removeEmpty && text.trim().length === 0) continue
          // 2) whitespace normalizasyonu (sistem talimatları dahil her şeyde güvenli)
          let norm = text
          if (normalize) {
            norm = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
            if (norm !== text && m && typeof m === "object") {
              const mm = m as Record<string, unknown>
              if (typeof mm["content"] === "string") mm["content"] = norm
            }
          }
          // 3) kaba duplika eleme (sistem mesajları hariç — ilk sistem mesajı korunur)
          const role = (m as Record<string, unknown>)?.["role"]
          if (dedupe && role !== "system") {
            const key = `${String(role)}:${norm.slice(0, 2000)}`
            if (seen.has(key)) continue
            seen.add(key)
          }
          kept.push(m)
        }

        // Sistem talimatı her zaman başta dursun
        kept.sort((a, b) => {
          const ra = (a as Record<string, unknown>)?.["role"] === "system" ? 0 : 1
          const rb = (b as Record<string, unknown>)?.["role"] === "system" ? 0 : 1
          return ra - rb
        })

        if (output && Array.isArray(output.messages)) output.messages = kept
        else if (input && Array.isArray(input.messages)) input.messages = kept
      } catch {
        // aynen geçir
      }
    },
  }
}
