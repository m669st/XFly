import { useEffect, useRef, type MutableRefObject } from 'react'
import { geom, litness, openTo, type Geom } from '../lib/light'
import type { Beam } from '../lib/useAim'

const FOCUS_STEPS = 5
const SPRITE = 64
const COUNT = 220

function moteSprite(sharpness: number, rgb: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = SPRITE
  const x = c.getContext('2d')!
  const r = SPRITE / 2
  const g = x.createRadialGradient(r, r, 0, r, r, r)
  const core = 0.04 + sharpness * 0.3
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(core, `rgba(255,255,255,${0.55 + sharpness * 0.35})`)
  g.addColorStop(core + (1 - core) * 0.45, `rgba(${rgb},${0.16 * (1 - sharpness) + 0.08})`)
  g.addColorStop(1, `rgba(${rgb},0)`)
  x.fillStyle = g
  x.fillRect(0, 0, SPRITE, SPRITE)
  return c
}

interface Mote {
  x: number
  y: number
  z: number
  r: number
  vx: number
  vy: number
  phase: number
  drift: number
  tw: number
  twSpeed: number
}

export function Particles({
  rgb,
  beam,
}: {
  rgb: string
  beam: MutableRefObject<Beam>
}): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const sprites = useRef<HTMLCanvasElement[]>([])
  const build = (c: string): HTMLCanvasElement[] =>
    Array.from({ length: FOCUS_STEPS }, (_, i) => moteSprite(i / (FOCUS_STEPS - 1), c))
  if (sprites.current.length === 0) sprites.current = build(rgb)
  useEffect(() => {
    sprites.current = build(rgb)
  }, [rgb])

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ctx = el.getContext('2d', { alpha: true })
    if (!ctx) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let w = 0
    let h = 0
    let g: Geom | null = null
    let motes: Mote[] = []

    const seed = (): void => {
      motes = Array.from({ length: COUNT }, () => {
        const z = Math.random()
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          z,
          r: (1.2 + z ** 2 * 9) * 0.5,
          vx: (Math.random() - 0.5) * 5 * (0.3 + z),
          vy: -(2 + Math.random() * 7) * (0.3 + z),
          phase: Math.random() * Math.PI * 2,
          drift: 0.15 + Math.random() * 0.4,
          tw: Math.random() * Math.PI * 2,
          twSpeed: 0.4 + Math.random() * 1.1,
        }
      })
      motes.sort((a, b) => a.z - b.z)
    }

    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = el.clientWidth
      h = el.clientHeight
      el.width = Math.floor(w * dpr)
      el.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      g = geom(w, h)
      seed()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    let raf = 0
    let last = performance.now()

    const frame = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      ctx.clearRect(0, 0, w, h)

      openTo(g!, beam.current.aim, beam.current.iris)

      ctx.globalCompositeOperation = 'lighter'

      for (const m of motes) {
        m.phase += m.drift * dt
        m.tw += m.twSpeed * dt
        m.x += (m.vx + Math.sin(m.phase) * 4 * (0.3 + m.z)) * dt
        m.y += m.vy * dt

        if (m.y < -20) {
          m.y = h + 20
          m.x = Math.random() * w
        }
        if (m.x < -20) m.x = w + 20
        if (m.x > w + 20) m.x = -20

        const lit = Math.max(litness(m.x, m.y, g!), 0.05 * m.z)

        const twinkle = 0.72 + Math.sin(m.tw) * 0.28
        const a = Math.min(1, lit * (0.35 + m.z * 0.65) * twinkle * 2.1)
        if (a < 0.012) continue

        const focus = 1 - Math.min(1, Math.abs(m.z - 0.62) * 2.4)
        const sprite = sprites.current[Math.round(focus * (FOCUS_STEPS - 1))]
        const size = m.r * (2 + (1 - focus) * 3.4)

        ctx.globalAlpha = a
        ctx.drawImage(sprite, m.x - size, m.y - size, size * 2, size * 2)
      }

      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
}
