import { useEffect, useRef } from 'react'
import { createLightRig, type RigHandle } from '../lib/light-rig'

/**
 * The spotlight, its shade and the dust in the beam.
 *
 * The three canvases are handed to a worker on mount and drawn there; this component
 * keeps only their layout and the fade that brings them up out of the dark. After the
 * handover the main thread sends a message when the colour or the aim changes and
 * nothing else — so decoding a hero image, merging a page of the library or starting a
 * game cannot put a hitch in the light.
 *
 * If a worker or OffscreenCanvas is unavailable the same engine simply runs here
 * instead, which is what used to happen for everything.
 */

type Msg =
  | { type: 'colour'; rgb: string }
  | { type: 'target'; aim: number; iris: number }
  | { type: 'resize'; w: number; h: number; dpr: number }
  | { type: 'reduced'; v: boolean }

const FADE = 'opacity 2.4s ease-out'

export function LightRig({
  rgb,
  aim,
  iris,
  lit = true,
}: {
  rgb: string
  aim: number
  iris: number
  lit?: boolean
}): JSX.Element {
  const shadeRef = useRef<HTMLCanvasElement>(null)
  const lightRef = useRef<HTMLCanvasElement>(null)
  const dustRef = useRef<HTMLCanvasElement>(null)

  // Whatever the newest values are when the (deferred) handover finally runs.
  const latest = useRef({ rgb, aim, iris })
  latest.current = { rgb, aim, iris }

  const send = useRef<((m: Msg) => void) | null>(null)

  useEffect(() => {
    const shade = shadeRef.current
    const light = lightRef.current
    const dust = dustRef.current
    if (!shade || !light || !dust) return

    let cancelled = false
    let worker: Worker | null = null
    let local: RigHandle | null = null
    let ro: ResizeObserver | null = null
    let probe: ReturnType<typeof setTimeout> | null = null

    const dprNow = (): number => Math.min(window.devicePixelRatio || 1, 2)
    const size = (): { w: number; h: number } => ({
      w: shade.clientWidth || window.innerWidth,
      h: shade.clientHeight || window.innerHeight,
    })

    // Deferred by a tick on purpose. Transferring a canvas is irreversible, and in
    // StrictMode the first pass is mounted and thrown away immediately — doing the
    // handover inline would burn the canvas on a pass that is about to be discarded.
    const id = setTimeout(() => {
      if (cancelled) return

      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      const startLocal = (): void => {
        if (cancelled) return
        try {
          const { w, h } = size()
          const { rgb: r0, aim: a0, iris: i0 } = latest.current
          local = createLightRig(shade, light, dust, { w, h, dpr: dprNow(), rgb: r0, aim: a0, iris: i0, reduced })
          // eslint-disable-next-line no-console
          console.log('[XFLY-RIG] light running on the main thread (no worker)')
          send.current = (m) => {
            if (m.type === 'colour') local?.colour(m.rgb)
            else if (m.type === 'target') local?.target(m.aim, m.iris)
            else if (m.type === 'resize') local?.resize(m.w, m.h, m.dpr)
            else local?.setReduced(m.v)
          }
        } catch {
          local = null
        }
      }

      const handOver = (w0: Worker): void => {
        if (cancelled) return
        try {
          const { w, h } = size()
          const { rgb: r0, aim: a0, iris: i0 } = latest.current
          const os = [shade, light, dust].map((c) => c.transferControlToOffscreen())
          w0.postMessage(
            {
              type: 'init',
              shade: os[0],
              light: os[1],
              dust: os[2],
              w,
              h,
              dpr: dprNow(),
              rgb: r0,
              aim: a0,
              iris: i0,
              reduced,
            },
            os,
          )
          send.current = (m) => w0.postMessage(m)
          // eslint-disable-next-line no-console
          console.log('[XFLY-RIG] light running on its own thread')
        } catch {
          // The canvases are gone either way at this point; nothing left to fall back to.
          send.current = null
        }
      }

      let settled = false
      try {
        if (typeof Worker !== 'undefined' && typeof shade.transferControlToOffscreen === 'function') {
          const w0 = new Worker(new URL('../lib/light-worker.ts', import.meta.url), { type: 'module' })
          worker = w0

          // Only hand the canvases over once the worker has proved it is running. If it
          // never reports in — a blocked origin, a failed load — fall back to this
          // thread with the canvases still intact.
          const giveUp = (): void => {
            if (settled) return
            settled = true
            if (probe) clearTimeout(probe)
            worker = null
            try {
              w0.terminate()
            } catch {
              /* already gone */
            }
            startLocal()
          }
          probe = setTimeout(giveUp, 1500)
          w0.onerror = giveUp
          w0.onmessage = (e: MessageEvent<{ type?: string }>) => {
            if (settled || e.data?.type !== 'ready') return
            settled = true
            if (probe) clearTimeout(probe)
            handOver(w0)
          }
        }
      } catch {
        worker = null
      }

      if (!worker && !settled) {
        settled = true
        startLocal()
      }

      ro = new ResizeObserver(() => {
        const { w: nw, h: nh } = size()
        send.current?.({ type: 'resize', w: nw, h: nh, dpr: dprNow() })
      })
      ro.observe(shade)
    }, 0)

    return () => {
      cancelled = true
      clearTimeout(id)
      if (probe) clearTimeout(probe)
      ro?.disconnect()
      send.current = null
      if (worker) {
        worker.postMessage({ type: 'destroy' })
        worker.terminate()
      }
      local?.destroy()
    }
  }, [])

  useEffect(() => {
    send.current?.({ type: 'colour', rgb })
  }, [rgb])

  useEffect(() => {
    send.current?.({ type: 'target', aim, iris })
  }, [aim, iris])

  const fade = { transition: FADE, opacity: lit ? 1 : 0 }
  return (
    <>
      <canvas ref={shadeRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" style={fade} />
      <canvas
        ref={lightRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ ...fade, mixBlendMode: 'screen' }}
      />
      <canvas ref={dustRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" style={fade} />
    </>
  )
}
