import { useEffect, useRef, type MutableRefObject } from 'react'
import { LIGHT, TAN_BASE, THROAT_U, axial, geom, lateral } from '../lib/light'
import type { Beam } from '../lib/useAim'

const PROFILE = 512
const BANDS = 220

const CORE_H = 1400
const WASH_H = 512

const WASH_SPREAD = 1.9
const WASH_MAX = 2.4
const WASH_MIN_MUL = 1.3

const CORE_PEAK = 0.34
const WASH_PEAK = 0.1
const THROAT_PEAK = 0.18
const SHADE = 0.64

const SPRITE = 512

function maxHalfU(spreadMul: number): number {
  return THROAT_U + TAN_BASE * spreadMul
}

function parseRgb(rgb: string): [number, number, number] {
  const p = rgb.split(',').map((n) => Number(n.trim()))
  return [p[0] || 255, p[1] || 255, p[2] || 255]
}

function profileStrip(rgb: string, streaked: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = PROFILE
  c.height = 4
  const x = c.getContext('2d')!
  const img = x.createImageData(PROFILE, 4)
  const [tr, tg, tb] = parseRgb(rgb)

  for (let i = 0; i < PROFILE; i++) {
    const xi = (i / (PROFILE - 1)) * 2 - 1
    const a = streaked ? lateral(xi) : Math.exp(-((xi / 0.42) ** 2))
    const white = Math.exp(-((xi / 0.22) ** 2))
    for (let row = 0; row < 4; row++) {
      const o = (row * PROFILE + i) * 4
      img.data[o] = tr + (255 - tr) * white
      img.data[o + 1] = tg + (255 - tg) * white
      img.data[o + 2] = tb + (255 - tb) * white
      img.data[o + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255)
    }
  }
  x.putImageData(img, 0, 0)
  return c
}

function bakeCone(
  rgb: string,
  streaked: boolean,
  spreadMul: number,
  peak: number,
  H: number,
): HTMLCanvasElement {
  const maxHalf = maxHalfU(spreadMul)
  const c = document.createElement('canvas')
  c.width = Math.max(2, Math.ceil(2 * maxHalf * H))
  c.height = H
  const x = c.getContext('2d')!
  const strip = profileStrip(rgb, streaked)
  x.translate(c.width / 2, 0)
  x.globalCompositeOperation = 'lighter'

  const dy = H / BANDS
  const tan = TAN_BASE * spreadMul
  for (let j = 0; j < BANDS; j++) {
    const y0 = j * dy
    const a = axial(y0 / H) * peak
    if (a <= 0.0015) continue
    const half = (THROAT_U + (y0 / H) * tan) * H
    x.globalAlpha = a
    x.drawImage(strip, -half, y0, half * 2, dy)
  }
  return c
}

function bakeGlow(rgb: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = SPRITE
  const x = c.getContext('2d')!
  const [tr, tg, tb] = parseRgb(rgb)
  const r = SPRITE / 2
  const g = x.createRadialGradient(r, r, 0, r, r, r)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.16, 'rgba(255,255,255,0.72)')
  g.addColorStop(0.36, `rgba(${tr},${tg},${tb},0.3)`)
  g.addColorStop(0.62, `rgba(${tr},${tg},${tb},0.09)`)
  g.addColorStop(1, `rgba(${tr},${tg},${tb},0)`)
  x.fillStyle = g
  x.fillRect(0, 0, SPRITE, SPRITE)
  return c
}

function bakeMask(): HTMLCanvasElement {
  const maxHalf = maxHalfU(WASH_SPREAD)
  const H = WASH_H
  const c = document.createElement('canvas')
  c.width = Math.max(2, Math.ceil(2 * maxHalf * H))
  c.height = H
  const x = c.getContext('2d')!
  const strip = profileStrip('255, 255, 255', false)
  x.translate(c.width / 2, 0)
  x.globalCompositeOperation = 'lighter'
  const dy = H / BANDS
  const tan = TAN_BASE * WASH_SPREAD
  for (let j = 0; j < BANDS; j++) {
    const y0 = j * dy
    const half = (THROAT_U + (y0 / H) * tan) * H
    x.drawImage(strip, -half, y0, half * 2, dy)
  }
  return c
}

export function Spotlight({
  rgb,
  beam,
}: {
  rgb: string
  beam: MutableRefObject<Beam>
}): JSX.Element {
  const shadeRef = useRef<HTMLCanvasElement>(null)
  const lightRef = useRef<HTMLCanvasElement>(null)
  const colour = useRef(rgb)
  colour.current = rgb
  const rebake = useRef<(() => void) | null>(null)

  useEffect(() => {
    const lightEl = lightRef.current
    const shadeEl = shadeRef.current
    if (!lightEl || !shadeEl) return
    const light = lightEl.getContext('2d', { alpha: true })
    const shade = shadeEl.getContext('2d', { alpha: true })
    if (!light || !shade) return

    let w = 0
    let h = 0
    let g = geom(1, 1)
    let core: HTMLCanvasElement | null = null
    let wash: HTMLCanvasElement | null = null
    let glow: HTMLCanvasElement | null = null
    const mask = bakeMask()

    const bake = (): void => {
      const c = colour.current
      wash = bakeCone(c, false, WASH_SPREAD, WASH_PEAK, WASH_H)
      core = bakeCone(c, true, 1, CORE_PEAK, CORE_H)
      glow = bakeGlow(c)
    }
    bake()

    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = lightEl.clientWidth
      h = lightEl.clientHeight
      for (const [el, ctx] of [
        [lightEl, light],
        [shadeEl, shade],
      ] as const) {
        el.width = Math.floor(w * dpr)
        el.height = Math.floor(h * dpr)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
      g = geom(w, h)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(lightEl)

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const t0 = performance.now()

    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame)
      if (!core || !wash || !glow || w < 2) return

      const { aim, iris } = beam.current
      const reach = g.reach
      const washK = Math.min(WASH_MAX, Math.max(iris * WASH_MIN_MUL, iris * WASH_SPREAD))
      const wh = maxHalfU(WASH_SPREAD) * reach * (washK / WASH_SPREAD)

      const s = (now - t0) / 1000
      const breathe = reduced
        ? 1
        : 1 + Math.sin(s * 0.21) * 0.035 + Math.sin(s * 0.13 + 1.7) * 0.02

      shade.globalCompositeOperation = 'source-over'
      shade.globalAlpha = 1
      shade.clearRect(0, 0, w, h)
      shade.fillStyle = `rgba(0,0,0,${SHADE})`
      shade.fillRect(0, 0, w, h)

      shade.globalCompositeOperation = 'destination-out'
      shade.save()
      shade.translate(g.ox, g.oy)
      shade.rotate(-aim)
      shade.drawImage(mask, -wh, 0, wh * 2, reach)
      shade.restore()
      shade.globalCompositeOperation = 'source-over'

      light.clearRect(0, 0, w, h)
      light.globalCompositeOperation = 'lighter'
      light.save()
      light.translate(g.ox, g.oy)
      light.rotate(-aim)
      light.globalAlpha = breathe
      light.drawImage(wash, -wh, 0, wh * 2, reach)
      const ch = maxHalfU(1) * reach * iris
      light.drawImage(core, -ch, 0, ch * 2, reach)
      light.restore()

      const tr = g.diag * 0.1
      light.globalAlpha = breathe * THROAT_PEAK
      light.drawImage(glow, g.ox - tr, g.oy - tr, tr * 2, tr * 2)

      light.globalAlpha = 1
      light.globalCompositeOperation = 'source-over'
    }
    raf = requestAnimationFrame(frame)

    rebake.current = bake

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      rebake.current = null
    }
  }, [])

  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    rebake.current?.()
  }, [rgb])

  return (
    <>
      <canvas ref={shadeRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
      <canvas
        ref={lightRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ mixBlendMode: 'screen' }}
      />
    </>
  )
}

