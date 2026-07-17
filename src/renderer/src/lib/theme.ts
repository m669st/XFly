export interface Ambient {
  rgb: string
}

const cache = new Map<string, Ambient>()
const FALLBACK: Ambient = { rgb: '16, 124, 16' }

const MIN_SAT = 0.18
const MIN_LUM = 0.10
const MAX_LUM = 0.92

function dominant(data: Uint8ClampedArray): Ambient {
  let r = 0, g = 0, b = 0, weight = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue
    const [pr, pg, pb] = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255]
    const max = Math.max(pr, pg, pb)
    const min = Math.min(pr, pg, pb)
    const lum = (max + min) / 2
    if (lum < MIN_LUM || lum > MAX_LUM) continue
    const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lum - 1))
    if (sat < MIN_SAT) continue
    const w = sat * sat
    r += pr * w
    g += pg * w
    b += pb * w
    weight += w
  }
  if (weight < 0.5) return FALLBACK

  let [nr, ng, nb] = [r / weight, g / weight, b / weight]
  const peak = Math.max(nr, ng, nb)
  if (peak > 0) {
    const lift = 0.85 / peak
    nr *= lift
    ng *= lift
    nb *= lift
  }
  return { rgb: [nr, ng, nb].map((c) => Math.round(Math.min(1, c) * 255)).join(', ') }
}

export async function ambientFrom(url: string | undefined): Promise<Ambient> {
  if (!url) return FALLBACK
  const hit = cache.get(url)
  if (hit) return hit

  const done = (a: Ambient): Ambient => {
    cache.set(url, a)
    return a
  }

  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await img.decode()
    const S = 48
    const c = document.createElement('canvas')
    c.width = S
    c.height = S
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return done(FALLBACK)
    ctx.drawImage(img, 0, 0, S, S)
    return done(dominant(ctx.getImageData(0, 0, S, S).data))
  } catch {
    return done(FALLBACK)
  }
}
