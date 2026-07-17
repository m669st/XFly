import type { StreamStats } from '../shared/ipc'
import { rec } from './record'


const RECORDED_TYPES = new Set(['inbound-rtp', 'outbound-rtp', 'remote-inbound-rtp', 'remote-outbound-rtp', 'candidate-pair', 'transport', 'track', 'media-source'])


export class StatsCollector {
  private timer: ReturnType<typeof setInterval> | null = null
  private lastBytes = 0
  private lastT = 0
  private rttBaseline: number | null = null
  private onStats: (s: StreamStats) => void

  constructor(onStats: (s: StreamStats) => void) {
    this.onStats = onStats
  }

  start(pc: RTCPeerConnection): void {
    this.stop()
    this.timer = setInterval(() => this.sample(pc), 1000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.lastBytes = 0
    this.lastT = 0
  }

  private async sample(pc: RTCPeerConnection): Promise<void> {
    let report: RTCStatsReport
    try {
      report = await pc.getStats()
    } catch {
      return
    }
    const s: StreamStats = {
      t: Date.now(),
      width: 0,
      height: 0,
      fps: 0,
      bitrateMbps: 0,
      packetsLost: 0,
      rttMs: null,
      jitterMs: 0,
      codec: '',
      freezes: 0,
      bufferbloat: false,
    }
    const codecs = new Map<string, string>()
    const raw: any[] = []
    report.forEach((r: any) => {
      if (r.type === 'codec') codecs.set(r.id, r.mimeType)
      if (RECORDED_TYPES.has(r.type) && !(r.type === 'candidate-pair' && r.state !== 'succeeded')) raw.push(r)
    })
    rec('stats', raw)
    report.forEach((r: any) => {
      if (r.type === 'inbound-rtp' && r.kind === 'video') {
        s.width = r.frameWidth || 0
        s.height = r.frameHeight || 0
        s.fps = r.framesPerSecond || 0
        s.packetsLost = r.packetsLost || 0
        s.jitterMs = Math.round((r.jitter || 0) * 1000)
        s.freezes = r.freezeCount || 0
        s.codec = codecs.get(r.codecId) || ''
        const now = r.timestamp || Date.now()
        if (this.lastT && r.bytesReceived >= this.lastBytes) {
          const dt = (now - this.lastT) / 1000
          if (dt > 0.2) s.bitrateMbps = +(((r.bytesReceived - this.lastBytes) * 8) / dt / 1e6).toFixed(1)
        }
        this.lastBytes = r.bytesReceived
        this.lastT = now
      }
      if (r.type === 'candidate-pair' && (r.nominated || r.selected)) {
        if (typeof r.currentRoundTripTime === 'number') {
          s.rttMs = Math.round(r.currentRoundTripTime * 1000)
          if (this.rttBaseline == null || s.rttMs < this.rttBaseline) this.rttBaseline = s.rttMs

          if (this.rttBaseline != null && s.rttMs > this.rttBaseline + 120) s.bufferbloat = true
        }
      }
    })
    this.onStats(s)
  }
}
