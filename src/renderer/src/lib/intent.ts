// Did the last focus change come from the user, or from the app moving focus on its
// own? The launcher sets focus programmatically all the time — auto-selecting the
// first game at boot, restoring focus when a panel closes — and none of that should
// click. We only make a navigation sound when a real input happened a moment ago.

let last = -1e9

export function markInput(): void {
  last = performance.now()
}

export function hadRecentInput(within = 350): boolean {
  return performance.now() - last < within
}

export function startInputTracking(): () => void {
  const mark = (): void => markInput()
  // Capture phase so we record the input before the navigation layer reacts to it.
  // Keydown covers the pad (its d-pad/stick/A are dispatched as synthetic keys) and a
  // real keyboard; pointerdown covers the mouse; the shoulder event covers LB/RB.
  window.addEventListener('keydown', mark, true)
  window.addEventListener('pointerdown', mark, true)
  window.addEventListener('xfly-shoulder', mark)
  return () => {
    window.removeEventListener('keydown', mark, true)
    window.removeEventListener('pointerdown', mark, true)
    window.removeEventListener('xfly-shoulder', mark)
  }
}
