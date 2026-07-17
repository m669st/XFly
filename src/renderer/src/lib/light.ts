export const LIGHT = {
  x: -0.06,
  y: -0.16,
  spread: 0.34,
  reach: 1.55,
  throat: 0.012,
  minSpread: 0.2,
  maxSpread: 0.62,
}

export const TAN_BASE = Math.tan(LIGHT.spread)
export const THROAT_U = LIGHT.throat / LIGHT.reach

export const DEFAULT_TARGET = { x: 0.1, y: 0.38 }

export interface Geom {
  ox: number
  oy: number
  diag: number

  sin: number
  cos: number
  tan: number
  throat: number
  reach: number
}

export function geom(w: number, h: number): Geom {
  const diag = Math.hypot(w, h)
  return {
    ox: LIGHT.x * w,
    oy: LIGHT.y * h,
    diag,
    sin: 0,
    cos: 1,
    tan: TAN_BASE,
    throat: THROAT_U * diag * LIGHT.reach,
    reach: diag * LIGHT.reach,
  }
}

export function openTo(g: Geom, aim: number, iris: number): void {
  g.sin = Math.sin(aim)
  g.cos = Math.cos(aim)
  g.tan = TAN_BASE * iris
  g.throat = THROAT_U * g.reach * iris
}

export function aimAt(tx: number, ty: number, w: number, h: number): number {
  return Math.atan2(tx * w - LIGHT.x * w, ty * h - LIGHT.y * h)
}

export function depthTo(tx: number, ty: number, w: number, h: number): number {
  return Math.hypot(tx * w - LIGHT.x * w, ty * h - LIGHT.y * h) / Math.hypot(w, h)
}

export function irisFor(
  titleWidthPx: number,
  tx: number,
  ty: number,
  w: number,
  h: number,
): number {
  const depth = depthTo(tx, ty, w, h) * Math.hypot(w, h)
  if (depth < 1) return 1
  const wanted = (titleWidthPx / 2) * 1.05 + h * 0.13
  const spread = Math.min(LIGHT.maxSpread, Math.max(LIGHT.minSpread, Math.atan(wanted / depth)))
  return Math.tan(spread) / TAN_BASE
}

export function lateral(xi: number): number {
  const fall = Math.exp(-((xi / 0.42) ** 2))
  const streak =
    0.78 +
    0.22 *
      (0.5 * Math.sin(xi * 13.7 + 0.4) +
        0.3 * Math.sin(xi * 27.1 + 2.1) +
        0.2 * Math.sin(xi * 6.3 + 4.2))
  return fall * streak
}

export function axial(u: number): number {
  if (u >= 1) return 0
  if (u <= 0) return 1
  return (1 - u) ** 1.6
}

export function litness(px: number, py: number, g: Geom): number {
  const dx = px - g.ox
  const dy = py - g.oy
  const along = dx * g.sin + dy * g.cos
  if (along <= 0) return 0
  const side = dx * g.cos - dy * g.sin
  const half = g.throat + along * g.tan
  const xi = side / half
  if (xi <= -1 || xi >= 1) return 0
  return lateral(xi) * axial(along / g.reach)
}
