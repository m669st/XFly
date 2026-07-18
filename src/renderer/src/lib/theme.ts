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

const S = 48

/**
 * The accent colour a piece of key art gives off.
 *
 * The decode is the expensive part — a full-size hero is millions of pixels, and doing
 * that on the main thread showed up as a hitch in the opening. createImageBitmap
 * decodes *and* downscales off-thread, so what reaches this thread is already a 48×48
 * thumbnail and the sampling below is trivial. Older paths fall back to an <img>.
 */
export async function ambientFrom(url: string | undefined): Promise<Ambient> {
  if (!url) return FALLBACK
  const hit = cache.get(url)
  if (hit) return hit

  const done = (a: Ambient): Ambient => {
    cache.set(url, a)
    return a
  }

  const sample = (src: CanvasImageSource): Ambient => {
    const c = document.createElement('canvas')
    c.width = S
    c.height = S
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return FALLBACK
    ctx.drawImage(src, 0, 0, S, S)
    return dominant(ctx.getImageData(0, 0, S, S).data)
  }

  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) throw new Error('fetch failed')
    const bmp = await createImageBitmap(await res.blob(), {
      resizeWidth: S,
      resizeHeight: S,
      resizeQuality: 'low',
    })
    const out = sample(bmp)
    bmp.close()
    return done(out)
  } catch {
    // fall through to the <img> path
  }

  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return done(sample(img))
  } catch {
    return done(FALLBACK)
  }
}
