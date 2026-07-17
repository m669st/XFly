const BUTTON_KEYS: Record<number, string> = {
  0: 'Enter', // A / Cross — select
  1: 'Escape', // B / Circle — back
  12: 'ArrowUp',
  13: 'ArrowDown',
  14: 'ArrowLeft',
  15: 'ArrowRight',
}

const SHOULDERS: Record<number, 'LB' | 'RB'> = { 4: 'LB', 5: 'RB' }

const STICK = 0.55
const REPEAT_FIRST_MS = 400
const REPEAT_MS = 110

interface Held {
  next: number
}

export type ShoulderEvent = CustomEvent<'LB' | 'RB'>

export function startGamepadNavigation(): () => void {
  const held = new Map<string, Held>()
  let raf = 0

  const press = (key: string): void => {
    const target = (document.activeElement as HTMLElement) || document.body
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }))
  }

  const fire = (name: string, detail?: unknown): void => {
    window.dispatchEvent(new CustomEvent(name, { detail }))
  }

  const edge = (key: string, down: boolean, now: number, send: () => void): void => {
    if (!down) {
      held.delete(key)
      return
    }
    const h = held.get(key)
    if (!h) {
      held.set(key, { next: now + REPEAT_FIRST_MS })
      send()
      return
    }
    if (key === 'Enter' || key === 'Escape' || key === 'LB' || key === 'RB') return
    if (now >= h.next) {
      h.next = now + REPEAT_MS
      send()
    }
  }

  const poll = (): void => {
    raf = requestAnimationFrame(poll)
    const now = performance.now()

    const pad = Array.from(navigator.getGamepads?.() ?? []).find((p) => p && p.connected)
    if (!pad) {
      held.clear()
      return
    }

    const want = new Map<string, boolean>()
    const or = (key: string, v: boolean): void => {
      want.set(key, (want.get(key) ?? false) || v)
    }

    for (const [index, key] of Object.entries(BUTTON_KEYS)) {
      or(key, !!pad.buttons[Number(index)]?.pressed)
    }
    for (const [index, key] of Object.entries(SHOULDERS)) {
      or(key, !!pad.buttons[Number(index)]?.pressed)
    }
    const x = pad.axes[0] ?? 0
    const y = pad.axes[1] ?? 0
    or('ArrowLeft', x < -STICK)
    or('ArrowRight', x > STICK)
    or('ArrowUp', y < -STICK)
    or('ArrowDown', y > STICK)

    for (const [key, down] of want) {
      edge(key, down, now, () => (key === 'LB' || key === 'RB' ? fire('xfly-shoulder', key) : press(key)))
    }
  }

  raf = requestAnimationFrame(poll)
  return () => cancelAnimationFrame(raf)
}
