import { engine, diag } from './state'


export function gateGamepads(): void {
  const nav = navigator as Navigator & { webkitGetGamepads?: () => (Gamepad | null)[] }
  const native = nav.getGamepads?.bind(nav)
  if (!native) return

  const blocked = (): boolean => engine.launcherVisible



  const EMPTY: (Gamepad | null)[] = []
  nav.getGamepads = function () {
    return blocked() ? EMPTY : dedupe(native())
  }
  if (nav.webkitGetGamepads) nav.webkitGetGamepads = nav.getGamepads


  for (const type of ['gamepadconnected', 'gamepaddisconnected']) {
    window.addEventListener(
      type,
      (e) => {
        if (!blocked()) return
        e.stopImmediatePropagation()
        e.preventDefault()
      },
      true,
    )
  }

  diag('gamepad', 'xbox page is blind to the controller unless the stream is on screen')
}


function hwKey(p: Gamepad): string | null {
  const m = p.id.match(/Vendor:\s*(\w+)\s+Product:\s*(\w+)/)
  return m ? `${m[1]}:${m[2]}` : null
}

function dedupe(pads: (Gamepad | null)[]): (Gamepad | null)[] {

  const canonical = new Map<string, { id: string; rumble: boolean }>()
  for (const p of pads) {
    if (!p) continue
    const key = hwKey(p)
    if (!key) continue
    const rumble = !!p.vibrationActuator
    const cur = canonical.get(key)
    if (!cur) canonical.set(key, { id: p.id, rumble })
    else if (cur.id !== p.id && !cur.rumble && rumble) canonical.set(key, { id: p.id, rumble })
  }

  let dropped = 0
  const out = pads.map((p) => {
    if (!p) return p
    const key = hwKey(p)
    if (!key) return p


    if (canonical.get(key)?.id === p.id) return p
    dropped++
    return null
  })

  if (dropped && !warned) {
    warned = true
    for (const c of canonical.values()) {
      diag('gamepad', `duplicate hidden — kept rumble=${c.rumble} "${c.id.slice(0, 40)}"`)
    }
  }
  return out
}
let warned = false


export function announceGamepads(): void {


  for (const pad of navigator.getGamepads()) {
    if (!pad) continue
    window.dispatchEvent(new GamepadEvent('gamepadconnected', { gamepad: pad }))
    diag('gamepad', `re-announced "${pad.id}" to the xbox page`)
  }
}
