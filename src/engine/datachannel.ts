import { rec } from './record'
import { diag, engine } from './state'

const HIGH_RATE = /^(input|control)$/i
const FULL_PAYLOAD_BUDGET = 60
const MAX_PAYLOAD = 2048

interface ChannelState {
  sent: number
  received: number
  sentBytes: number
  receivedBytes: number
  fullSent: number
  fullReceived: number
}

const seen = new Map<string, ChannelState>()

let control: { ch: RTCDataChannel; send: (d: string) => void } | null = null

let controlReady: (() => void) | null = null
export function onControlReady(cb: () => void): void {
  controlReady = cb
  if (control?.ch.readyState === 'open') cb()
}

export function requestResolution(alias: string): boolean {
  if (!control || control.ch.readyState !== 'open') return false
  control.send(JSON.stringify({ message: 'userRequestedResolutionUpdate', resolutionAlias: alias }))
  diag('lever', `resolution request -> "${alias}"`)
  rec('lever.alias', { to: alias, live: true })
  return true
}

export function requestBitrate(bps: number, repeat = false): boolean {
  if (!control || control.ch.readyState !== 'open') return false
  control.send(JSON.stringify({ message: 'rateControlBitrateUpdate', bitratebps: Math.floor(bps) }))
  diag('lever', `bitrate ${repeat ? 'hold' : 'request'} -> ${(bps / 1e6).toFixed(1)} Mbps`)
  rec('lever.bitrate', { bps, repeat })
  return true
}

export function requestKeyframe(): boolean {
  if (!control || control.ch.readyState !== 'open') return false
  control.send(JSON.stringify({ message: 'videoKeyframeRequested', ifrRequested: true }))
  return true
}

export function wantedAlias(): string | null {
  return targetAlias()
}

function describe(data: unknown): { type: string; size: number; text?: string; hex?: string } {
  if (typeof data === 'string') {
    return { type: 'string', size: data.length, text: data.slice(0, MAX_PAYLOAD) }
  }
  let bytes: Uint8Array | null = null
  if (data instanceof ArrayBuffer) bytes = new Uint8Array(data)
  else if (ArrayBuffer.isView(data)) bytes = new Uint8Array((data as ArrayBufferView).buffer, (data as ArrayBufferView).byteOffset, (data as ArrayBufferView).byteLength)
  if (!bytes) return { type: typeof data, size: 0 }
  const slice = bytes.subarray(0, MAX_PAYLOAD)
  let text = ''
  try {
    text = new TextDecoder('utf-8', { fatal: false }).decode(slice)
    if (!/[\x20-\x7e]{6}/.test(text)) text = ''
  } catch {
    /* not text */
  }
  return {
    type: 'binary',
    size: bytes.length,
    hex: Array.from(slice, (b) => b.toString(16).padStart(2, '0')).join(''),
    ...(text ? { text } : {}),
  }
}

let probed = false
export async function probeResolutionAliases(): Promise<void> {
  if (probed) return
  probed = true
  const FIELD = 'userRequestedResolutionAlias'
  try {
    const urls = [
      ...new Set<string>([
        ...[...document.querySelectorAll('script[src]')].map((s) => (s as HTMLScriptElement).src),
        ...performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /\.js(\?|$)/.test(n)),
      ]),
    ]
    diag('probe', `scanning ${urls.length} scripts for ${FIELD}`)

    let found = 0
    for (const src of urls) {
      const text = await fetch(src).then((r) => r.text()).catch(() => '')
      if (!text.includes(FIELD)) continue
      if (/web-rtc-stream/.test(src)) continue

      found++
      diag('probe', `assigns ${FIELD} in ${src}`)
      const i = text.indexOf(FIELD)
      const ctx = text.slice(Math.max(0, i - 1400), i + 1400)
      for (let n = 0; n < ctx.length; n += 400) diag('probe', `set[${n}] ${ctx.slice(n, n + 400)}`)

      const RE = /["'`](Auto|Automatic|[0-9]{3,4}[pP](?:[A-Za-z ]{0,24})?)["'`]/g
      const hits = [...new Set(text.match(RE) ?? [])].slice(0, 40)
      diag('probe', `alias-shaped literals there: ${hits.join(' ') || '(none)'}`)
      rec('probe.alias', { src, hits, context: ctx })
    }
    if (!found) diag('probe', `${FIELD} assigned nowhere outside web-rtc-stream (${urls.length} scripts)`)
  } catch (e) {
    diag('probe', `alias probe failed: ${e}`)
  }
}

const TIER_PIXELS: Array<{ alias: string; w: number; h: number }> = [
  { alias: '1440', w: 2560, h: 1440 },
  { alias: '1080HQ', w: 1920, h: 1080 },
  { alias: '720HQ', w: 1280, h: 720 },
]

function containScale(streamW: number, streamH: number): number {
  const dpr = window.devicePixelRatio || 1
  const viewW = window.innerWidth * dpr
  const viewH = window.innerHeight * dpr
  return Math.min(viewW / streamW, viewH / streamH)
}

function vsrTier(): string {
  const MIN_UPSCALE = 1.05
  for (const t of TIER_PIXELS) {
    if (containScale(t.w, t.h) >= MIN_UPSCALE) return t.alias
  }
  return TIER_PIXELS[TIER_PIXELS.length - 1].alias
}

function targetAlias(): string | null {
  const pref = (engine.settings.resolutionAlias as string | undefined) ?? 'Auto'
  if (pref !== 'Auto') return pref

  if (engine.settings.videoEnhancer === 'vsr') {
    const alias = vsrTier()
    const t = TIER_PIXELS.find((x) => x.alias === alias)!
    diag('lever', `resolution "${alias}" for VSR — it will be drawn at x${containScale(t.w, t.h).toFixed(2)}`)
    return alias
  }
  return null
}

function rewriteOutgoing(label: string, data: unknown): unknown {
  if (typeof data !== 'string') return data

  if (label === 'control') {
    try {
      const msg = JSON.parse(data)
      if (msg?.message !== 'userRequestedResolutionUpdate') return data
      const alias = targetAlias()
      diag('lever', `control resolution request: server default "${msg.resolutionAlias}"${alias ? ` -> "${alias}"` : ' (left alone)'}`)
      rec('lever.alias', { from: msg.resolutionAlias, to: alias })
      if (!alias) return data
      msg.resolutionAlias = alias
      return JSON.stringify(msg)
    } catch {
      return data
    }
  }
  return data
}

export function recordDataChannel(ch: RTCDataChannel, origin: 'local' | 'remote'): void {
  const label = ch.label || '(unnamed)'
  const key = `${origin}:${label}`
  if (seen.has(key)) return
  const st: ChannelState = { sent: 0, received: 0, sentBytes: 0, receivedBytes: 0, fullSent: 0, fullReceived: 0 }
  seen.set(key, st)

  if (label === 'control') {
    void probeResolutionAliases()
    control = { ch, send: ch.send.bind(ch) }
  }

  diag('dc', `${origin} channel "${label}" id=${ch.id} ordered=${ch.ordered} protocol=${ch.protocol || '-'}`)
  rec('dc.open', { origin, label, id: ch.id, ordered: ch.ordered, protocol: ch.protocol, maxRetransmits: ch.maxRetransmits, negotiated: ch.negotiated })

  const nativeSend = ch.send.bind(ch)
  ch.send = function (data: any) {
    let out = data
    try {
      out = rewriteOutgoing(label, data)
      const d = describe(out)
      st.sent++
      st.sentBytes += d.size
      const verbose = !HIGH_RATE.test(label) || st.fullSent < FULL_PAYLOAD_BUDGET
      if (verbose) {
        st.fullSent++
        rec('dc.send', { label, ...d, n: st.sent })
      }
    } catch {
      /* never break the send path */
    }
    return nativeSend(out)
  }

  ch.addEventListener('message', (e: MessageEvent) => {
    try {
      const d = describe(e.data)
      st.received++
      st.receivedBytes += d.size
      const verbose = !HIGH_RATE.test(label) || st.fullReceived < FULL_PAYLOAD_BUDGET
      if (verbose) {
        st.fullReceived++
        rec('dc.recv', { label, ...d, n: st.received })
      }
    } catch {
      /* ignore */
    }
  })

  ch.addEventListener('open', () => {
    rec('dc.state', { label, state: 'open' })
    if (label === 'control') controlReady?.()
  })
  ch.addEventListener('close', () => rec('dc.state', { label, state: 'close', totals: { ...st } }))
  ch.addEventListener('error', (e: any) => rec('dc.state', { label, state: 'error', error: String(e?.error ?? e) }))
}

export function dataChannelTotals(): Record<string, ChannelState> {
  return Object.fromEntries(seen)
}
