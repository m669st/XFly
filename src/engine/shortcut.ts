import { engine, emit, diag } from './state'
import { rawGamepads } from './gamepad-gate'

/**
 * View + Menu, held together.
 *
 * Standard gamepad mapping puts this pair at 8 and 9 on every pad that reaches us:
 * View/Menu on an Xbox pad, Create/Options on a DualSense, the same two on the
 * Legion and the handhelds. Guide (16) would be the obvious button, but xCloud
 * already answers to it, and any single face or shoulder button belongs to the
 * game. Two buttons nobody presses together is the only room left.
 */
const VIEW = 8
const MENU = 9

export function watchMenuShortcut(): void {
  let held = false

  const tick = (): void => {
    let down = false
    for (const pad of rawGamepads()) {
      if (!pad) continue
      if (pad.buttons[VIEW]?.pressed && pad.buttons[MENU]?.pressed) {
        down = true
        break
      }
    }

    // The edge, not the level: holding the pair fires once, and the same press
    // that opens the menu must not immediately close it again.
    //
    // Only while something is streaming. Out in the launcher this same press would
    // hide the launcher and leave the user staring at the page behind it.
    if (down && !held && engine.video) emit({ type: 'menu.toggle' })
    held = down

    requestAnimationFrame(tick)
  }

  requestAnimationFrame(tick)

  // The pad is the point, but a stream can be played at a desk too, and a menu with
  // no keyboard way in cannot be reached while debugging either. F9 is what xCloud
  // itself uses for its guide, so it is already a key nothing else claims.
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'F9' && engine.video) {
        e.preventDefault()
        emit({ type: 'menu.toggle' })
      }
    },
    true,
  )

  diag('shortcut', 'View + Menu (or F9) toggles the XFly menu')
}
