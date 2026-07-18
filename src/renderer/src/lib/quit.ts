import { useStore } from '../store'

/**
 * Leaving XFly. Rather than closing the window on the spot, it hands off to the store:
 * Home sees `closing`, plays its opening in reverse — the screen leaves, the light
 * goes down, the room falls dark — and only then does the window actually close
 * (App schedules that, alongside the shutdown sound).
 *
 * The view is snapped back to Home first so the reverse plays over the home screen
 * even when the user quits from inside Library or Settings.
 */
export function requestQuit(): void {
  const s = useStore.getState()
  if (s.closing) return
  s.setView('home')
  s.setClosing()
}
