import { useEffect, useRef, type MutableRefObject } from 'react'

const STIFFNESS = 18
const DAMPING = 8.2

const KEYS = ['aim', 'iris'] as const

export interface Beam {
  aim: number
  iris: number
}

export function useBeamSpring(target: Beam, animate = true): MutableRefObject<Beam> {
  const now = useRef<Beam>({ ...target })
  const vel = useRef<Beam>({ aim: 0, iris: 0 })

  const tgt = useRef(target)
  tgt.current = target
  const live = useRef(animate)
  live.current = animate

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const step = (t: number): void => {
      const dt = Math.min((t - last) / 1000, 0.05)
      last = t
      for (const key of KEYS) {
        if (!live.current) {
          now.current[key] = tgt.current[key]
          vel.current[key] = 0
          continue
        }
        const accel = (tgt.current[key] - now.current[key]) * STIFFNESS - vel.current[key] * DAMPING
        vel.current[key] += accel * dt
        now.current[key] += vel.current[key] * dt
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])

  return now
}
