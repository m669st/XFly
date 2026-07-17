import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'

export function rec(kind: string, d: unknown): void {
  try {
    ipcRenderer.send(IPC.recordEvent, { kind, d })
  } catch {
    /* not in electron */
  }
}

const SECRET_KEY = /^(authorization|cookie|set-cookie|x-gssv-client|gstoken|gsToken|token|xsts|refresh_token|access_token)$/i
const SECRET_IN_VALUE = /(eyJ[\w-]{20,}|XBL3\.0 x=)/

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '<deep>'
  if (typeof value === 'string') {
    if (value.length > 4096) return `<str:${value.length}>`
    return SECRET_IN_VALUE.test(value) ? `<redacted:${value.length}>` : value
  }
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => redact(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? `<redacted:${String(v).length}>` : redact(v, depth + 1)
    }
    return out
  }
  return value
}

export function redactText(text: string, limit = 200_000): string {
  const clipped = text.length > limit ? text.slice(0, limit) + `…<truncated ${text.length}>` : text
  return clipped.replace(/eyJ[\w-]{20,}\.[\w-]+\.[\w-]+/g, '<jwt>').replace(/XBL3\.0 x=[^"';\s]+/g, '<xbl3>')
}

export function headersToObject(h: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  h.forEach((v, k) => {
    out[k] = SECRET_KEY.test(k) ? `<redacted:${v.length}>` : v
  })
  return out
}
