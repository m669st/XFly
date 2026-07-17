/**
 * Skip the Xbox intro clip.
 *
 * xCloud plays the same Xbox animation before every single stream, and the page
 * waits it out before showing the game. Removing the element is not enough — the
 * page is waiting on the clip's own events, and a clip that never reports back
 * leaves the launch hanging forever.
 *
 * So it plays, as far as the page can tell: silent, hidden, and already ended. The
 * play() it asked for is answered with a promise that never settles, which is what
 * keeps the page from sitting through the rest of it.
 */
const SPLASH_CLASS = 'XboxSplashVideo'

export function skipSplashVideo(): void {
  const nativePlay = HTMLMediaElement.prototype.play
  if ((nativePlay as unknown as { __xfly?: boolean }).__xfly) return

  const patched = function (this: HTMLMediaElement) {
    if (typeof this.className === 'string' && this.className.startsWith(SPLASH_CLASS)) {
      this.volume = 0
      this.style.display = 'none'
      this.dispatchEvent(new Event('ended'))
      return new Promise<void>(() => {})
    }
    return nativePlay.apply(this)
  }
  ;(patched as unknown as { __xfly?: boolean }).__xfly = true

  HTMLMediaElement.prototype.play = patched
}
