import { engine, emit, diag } from './state'
import { StatsCollector } from './stats'
import { upscaler } from './upscale'
import { rec } from './record'
import { recordDataChannel } from './datachannel'

let pcSeq = 0



export function patchRtcPeerConnection(): void {
  const Native = window.RTCPeerConnection
  if (!Native || (Native as any).__xfly) return

  const stats = new StatsCollector((s) => {
    emit({ type: 'stream.stats', stats: s })
    upscaler.feedBitrate(s.bitrateMbps)
  })

  const Patched = function (this: unknown, config?: RTCConfiguration) {
    const pc = new Native(config)
    const id = ++pcSeq




    let isSession = false
    let everConnected = false
    diag('pc', `#${id} created (iceServers=${config?.iceServers?.length ?? 0})`)
    rec('pc.create', { id, config: JSON.parse(JSON.stringify(config ?? {})) })


    const nativeCreateDc = pc.createDataChannel.bind(pc)
    pc.createDataChannel = function (label: string, init?: RTCDataChannelInit) {
      const ch = nativeCreateDc(label, init)
      try { recordDataChannel(ch, 'local') } catch { /* */ }
      return ch
    }
    pc.addEventListener('datachannel', (e: RTCDataChannelEvent) => {
      try { recordDataChannel(e.channel, 'remote') } catch { /* */ }
    })

    pc.addEventListener('icecandidate', (e: RTCPeerConnectionIceEvent) => {
      rec('ice.local', { id, candidate: e.candidate?.candidate ?? null })
    })

    pc.addEventListener('track', (e: RTCTrackEvent) => {
      diag('pc', `#${id} track kind=${e.track.kind}`)
      if (e.track.kind !== 'video') return
      isSession = true
      engine.pc = pc
      maybePlaying()
    })

    const maybePlaying = (): void => {
      if (!isSession || !everConnected) return
      stats.start(pc)
      diag('pc', `#${id} -> PLAYING`)
      emit({ type: 'stream.state', state: 'playing' })
    }





    const nativeSRD = pc.setRemoteDescription.bind(pc)
    pc.setRemoteDescription = function (desc?: RTCSessionDescriptionInit) {
      try {
        const d: any = desc ?? (arguments as any)[0]
        if (d?.sdp) {
          rec('sdp.answer', { raw: d.sdp })
          emit({ type: 'sdp', kind: 'answer', sdp: d.sdp })
        }
      } catch { /* */ }
      // eslint-disable-next-line prefer-rest-params
      return nativeSRD.apply(pc, arguments as any)
    }

    pc.addEventListener('iceconnectionstatechange', () => diag('pc', `#${id} ice=${pc.iceConnectionState}`))
    pc.addEventListener('icegatheringstatechange', () => diag('pc', `#${id} gathering=${pc.iceGatheringState}`))
    pc.addEventListener('connectionstatechange', () => {
      const st = pc.connectionState
      diag('pc', `#${id} conn=${st} session=${isSession}`)
      if (st === 'connected') {
        everConnected = true
        maybePlaying()
      } else if (st === 'closed' || st === 'failed') {


        if (!isSession || !everConnected) {
          diag('pc', `#${id} closed without ever carrying video — ignored`)
          return
        }
        stats.stop()
        emit({ type: 'stream.state', state: 'ended' })
      }
    })

    return pc
  } as unknown as typeof RTCPeerConnection

  Patched.prototype = Native.prototype
  ;(Patched as any).__xfly = true
  Object.getOwnPropertyNames(Native).forEach((k) => {
    try { (Patched as any)[k] = (Native as any)[k] } catch { /* */ }
  })
  window.RTCPeerConnection = Patched
  ;(window as any).webkitRTCPeerConnection = Patched
}
