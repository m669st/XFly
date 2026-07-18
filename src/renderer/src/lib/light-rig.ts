import { TAN_BASE, THROAT_U, axial, geom, lateral, litness, openTo, type Geom } from './light'

/**
 * The light rig: the spotlight's shade and beam, the dust in it, and the spring that
 * aims it — one render engine, one frame loop.
 *
 * It lives here rather than in the components because it is written to run *anywhere*
 * a 2D context exists: on an OffscreenCanvas inside a worker (what we actually do) or
 * on a plain canvas on the main thread (the fallback). Nothing in here touches the
 * DOM, React, or window.
 *
 * Why a worker at all: colouring the beam bakes two large cones — roughly 1000×1400
 * and 700×500 — with a couple of hundred draws each. On the main thread that landed as
 * a visible hitch every time the accent colour changed, which is every time the player
 * moves along the rail, and again in the middle of the opening. Off the main thread it
 * cannot stall an animation no matter how slow the machine, and neither can anything
 * else the app is doing — image decodes, library merges, launching a game.
 */

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function ctx2d(c: AnyCanvas): Ctx2D | null {
  return (c as HTMLCanvasElement).getContext('2d', { alpha: true }) as unknown as Ctx2D | null
}

// OffscreenCanvas exists in both contexts in Chromium, so the intermediate bake
// surfaces are the same either way.
function surface(w: number, h: number): OffscreenCanvas {
  return new OffscreenCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)))
}

const nextFrame = (cb: (t: number) => void): number =>
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(cb)
    : (setTimeout(() => cb(performance.now()), 16) as unknown as number)

const cancelFrame = (id: number): void => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id)
  else clearTimeout(id as unknown as ReturnType<typeof setTimeout>)
}

// --- the beam ------------------------------------------------------------------

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
const GLOW = 512

// --- the dust ------------------------------------------------------------------

const FOCUS_STEPS = 5
const MOTE = 64
const COUNT = 240

// --- the spring ----------------------------------------------------------------

const STIFFNESS = 18
const DAMPING = 8.2

function maxHalfU(spreadMul: number): number {
  return THROAT_U + TAN_BASE * spreadMul
}

function parseRgb(rgb: string): [number, number, number] {
  const p = rgb.split(',').map((n) => Number(n.trim()))
  return [p[0] || 255, p[1] || 255, p[2] || 255]
}

function profileStrip(rgb: string, streaked: boolean): OffscreenCanvas {
  const c = surface(PROFILE, 4)
  const x = ctx2d(c)!
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

function bakeCone(rgb: string, streaked: boolean, spreadMul: number, peak: number, H: number): OffscreenCanvas {
  const maxHalf = maxHalfU(spreadMul)
  const c = surface(2 * maxHalf * H, H)
  const x = ctx2d(c)!
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

function bakeGlow(rgb: string): OffscreenCanvas {
  const c = surface(GLOW, GLOW)
  const x = ctx2d(c)!
  const [tr, tg, tb] = parseRgb(rgb)
  const r = GLOW / 2
  const g = x.createRadialGradient(r, r, 0, r, r, r)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.16, 'rgba(255,255,255,0.72)')
  g.addColorStop(0.36, `rgba(${tr},${tg},${tb},0.3)`)
  g.addColorStop(0.62, `rgba(${tr},${tg},${tb},0.09)`)
  g.addColorStop(1, `rgba(${tr},${tg},${tb},0)`)
  x.fillStyle = g
  x.fillRect(0, 0, GLOW, GLOW)
  return c
}

function bakeMask(): OffscreenCanvas {
  const maxHalf = maxHalfU(WASH_SPREAD)
  const H = WASH_H
  const c = surface(2 * maxHalf * H, H)
  const x = ctx2d(c)!
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

// A dust mote is not a light source — it's a speck that scatters the beam it happens
// to sit in. Tiny, near-neutral, fast falloff: no coloured bloom, no halo.
function moteSprite(sharpness: number, rgb: string): OffscreenCanvas {
  const c = surface(MOTE, MOTE)
  const x = ctx2d(c)!
  const r = MOTE / 2
  const [tr, tg, tb] = parseRgb(rgb)
  const g = x.createRadialGradient(r, r, 0, r, r, r)
  const edge = 0.12 + (1 - sharpness) * 0.24
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(edge * 0.45, 'rgba(255,255,255,0.92)')
  g.addColorStop(edge, 'rgba(236,244,236,0.28)')
  g.addColorStop(Math.min(1, edge * 2), `rgba(${tr},${tg},${tb},0.04)`)
  g.addColorStop(1, `rgba(${tr},${tg},${tb},0)`)
  x.fillStyle = g
  x.fillRect(0, 0, MOTE, MOTE)
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

export interface RigInit {
  w: number
  h: number
  dpr: number
  rgb: string
  aim: number
  iris: number
  reduced: boolean
}

export interface RigHandle {
  resize(w: number, h: number, dpr: number): void
  colour(rgb: string): void
  target(aim: number, iris: number): void
  setReduced(v: boolean): void
  destroy(): void
}

export function createLightRig(
  shadeC: AnyCanvas,
  lightC: AnyCanvas,
  dustC: AnyCanvas,
  init: RigInit,
): RigHandle {
  const shade = ctx2d(shadeC)
  const light = ctx2d(lightC)
  const dust = ctx2d(dustC)
  if (!shade || !light || !dust) {
    return { resize: () => {}, colour: () => {}, target: () => {}, setReduced: () => {}, destroy: () => {} }
  }

  let w = init.w
  let h = init.h
  let g: Geom = geom(Math.max(1, w), Math.max(1, h))
  let rgb = init.rgb
  let reduced = init.reduced

  // The spring lives here so aiming costs the main thread nothing: it only ever sends
  // a new target, which happens when the title moves — not every frame.
  const tgt = { aim: init.aim, iris: init.iris }
  const now = { aim: init.aim, iris: init.iris }
  const vel = { aim: 0, iris: 0 }

  let core = bakeCone(rgb, true, 1, CORE_PEAK, CORE_H)
  let wash = bakeCone(rgb, false, WASH_SPREAD, WASH_PEAK, WASH_H)
  let glow = bakeGlow(rgb)
  const mask = bakeMask()

  let sprites = Array.from({ length: FOCUS_STEPS }, (_, i) => moteSprite(i / (FOCUS_STEPS - 1), rgb))
  let motes: Mote[] = []

  const seed = (): void => {
    motes = Array.from({ length: COUNT }, () => {
      const z = Math.random()
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        z,
        // Small — fine airborne dust, with only the nearest few flecks any bigger.
        r: 0.5 + z * z * 2.1,
        vx: (Math.random() - 0.5) * 4 * (0.3 + z),
        vy: -(1.5 + Math.random() * 5) * (0.3 + z),
        phase: Math.random() * Math.PI * 2,
        drift: 0.12 + Math.random() * 0.35,
        tw: Math.random() * Math.PI * 2,
        twSpeed: 0.3 + Math.random() * 0.9,
      }
    })
    motes.sort((a, b) => a.z - b.z)
  }

  const applySize = (nw: number, nh: number, dpr: number): void => {
    w = Math.max(1, nw)
    h = Math.max(1, nh)
    const pw = Math.floor(w * dpr)
    const ph = Math.floor(h * dpr)
    for (const [c, x] of [
      [shadeC, shade],
      [lightC, light],
      [dustC, dust],
    ] as const) {
      c.width = pw
      c.height = ph
      x.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    g = geom(w, h)
    seed()
  }
  applySize(init.w, init.h, init.dpr)

  let raf = 0
  let last = performance.now()
  const t0 = performance.now()
  let alive = true

  const frame = (t: number): void => {
    if (!alive) return
    raf = nextFrame(frame)

    const dt = Math.min((t - last) / 1000, 0.05)
    last = t

    // spring toward the target
    for (const key of ['aim', 'iris'] as const) {
      if (reduced) {
        now[key] = tgt[key]
        vel[key] = 0
        continue
      }
      const accel = (tgt[key] - now[key]) * STIFFNESS - vel[key] * DAMPING
      vel[key] += accel * dt
      now[key] += vel[key] * dt
    }

    const aim = now.aim
    const iris = now.iris
    openTo(g, aim, iris)

    // --- shade + beam ---
    const reach = g.reach
    const washK = Math.min(WASH_MAX, Math.max(iris * WASH_MIN_MUL, iris * WASH_SPREAD))
    const wh = maxHalfU(WASH_SPREAD) * reach * (washK / WASH_SPREAD)

    const s = (t - t0) / 1000
    const breathe = reduced ? 1 : 1 + Math.sin(s * 0.21) * 0.035 + Math.sin(s * 0.13 + 1.7) * 0.02

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

    // --- dust ---
    dust.clearRect(0, 0, w, h)
    dust.globalCompositeOperation = 'lighter'
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

      // The beam is what reveals the mote. Out of the cone it's all but invisible.
      const reveal = Math.max(litness(m.x, m.y, g), 0.02 * m.z * m.z)
      const twinkle = 0.82 + Math.sin(m.tw) * 0.18
      const a = Math.min(1, reveal * (0.4 + m.z * 0.6) * twinkle * 1.7)
      if (a < 0.01) continue

      const focus = 1 - Math.min(1, Math.abs(m.z - 0.6) * 2.2)
      const sprite = sprites[Math.round(focus * (FOCUS_STEPS - 1))]
      const size = m.r * (2.2 + (1 - focus) * 2.2)

      dust.globalAlpha = a
      dust.drawImage(sprite, m.x - size, m.y - size, size * 2, size * 2)
    }
    dust.globalAlpha = 1
    dust.globalCompositeOperation = 'source-over'
  }
  raf = nextFrame(frame)

  return {
    resize(nw, nh, dpr) {
      applySize(nw, nh, dpr)
    },
    colour(next) {
      if (next === rgb) return
      rgb = next
      core = bakeCone(rgb, true, 1, CORE_PEAK, CORE_H)
      wash = bakeCone(rgb, false, WASH_SPREAD, WASH_PEAK, WASH_H)
      glow = bakeGlow(rgb)
      sprites = Array.from({ length: FOCUS_STEPS }, (_, i) => moteSprite(i / (FOCUS_STEPS - 1), rgb))
    },
    target(aim, iris) {
      tgt.aim = aim
      tgt.iris = iris
    },
    setReduced(v) {
      reduced = v
    },
    destroy() {
      alive = false
      cancelFrame(raf)
    },
  }
}
