import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useStore } from './store'
import { Home } from './components/Home'
import { Library } from './components/Library'
import { Settings } from './components/Settings'
import { StreamHud } from './components/StreamHud'
import { Splash } from './components/Splash'
import { Mark } from './components/Mark'
import { useFocus, setFocus } from './lib/focus'
import { t } from './lib/i18n'
import { sfxShutdown } from './lib/sfx'
import { loadLibrary, loadRecent, loadProfile, loadMkbIds, loadEntitledIds, preloadShelves } from './lib/xbox'

const BOOT_MAX_MS = 8_000
// How long the reverse-opening runs before the window actually closes: the screen
// leaves, the light goes down, the room falls dark — then it holds on black for a beat
// so the power-down chime can resolve before the window shuts.
const CLOSE_MS = 2_300

export default function App(): JSX.Element {
  const view = useStore((s) => s.view)
  const signedIn = useStore((s) => s.signedIn)
  const booted = useStore((s) => s.booted)
  const streamState = useStore((s) => s.streamState)
  const closing = useStore((s) => s.closing)

  useEffect(() => {
    if (!closing) return
    sfxShutdown()
    const id = setTimeout(() => window.xfly.close(), CLOSE_MS)
    return () => clearTimeout(id)
  }, [closing])

  useEffect(() => {
    if (signedIn === null) return
    if (!signedIn) {
      useStore.getState().setBooted()
      return
    }

    const boot = Promise.allSettled([
      loadProfile(useStore.getState().profile ?? undefined).then((p) => useStore.getState().mergeProfile(p)),
      loadRecent().then((r) => r.length && useStore.getState().setRecent(r)),
    ])
    const giveUp = new Promise((r) => setTimeout(r, BOOT_MAX_MS))
    void Promise.race([boot, giveUp]).then(() => useStore.getState().setBooted())

    loadLibrary((batch) => useStore.getState().mergeLibrary(batch)).catch(() => {})
    loadMkbIds().then((ids) => ids.size && useStore.getState().setMkbIds(ids)).catch(() => {})
    loadEntitledIds().then((ids) => ids.size && useStore.getState().setEntitledIds(ids)).catch(() => {})
    // Warm the Library shelves now, from the home screen, so opening Library is instant.
    preloadShelves()
  }, [signedIn])

  const inGame = streamState === 'playing' || streamState === 'starting' || streamState === 'loading'
  const showSplash = signedIn === null || (signedIn && !booted)

  return (
    <div className="relative h-full w-full">
      <Toast />
      {/* Home mounts under the splash while it fades, so its own dark-to-light intro
          begins the moment the loader lifts — one continuous rise from black. */}
      {!showSplash &&
        (inGame ? (
          <StreamHud />
        ) : !signedIn ? (
          <div className="relative z-10 h-full">
            <div className="xfly-bg" />
            <SignIn />
          </div>
        ) : (
          <div className="relative z-10 h-full">
            <Home />
            <AnimatePresence>
              {view === 'library' && <Library key="library" />}
              {view === 'settings' && <Settings key="settings" />}
            </AnimatePresence>
          </div>
        ))}
      <AnimatePresence>
        {showSplash && (
          <Splash key="splash" status={signedIn === null ? t.boot.starting : t.boot.loadingAccount} />
        )}
      </AnimatePresence>
    </div>
  )
}

function Toast(): JSX.Element | null {
  const toast = useStore((s) => s.toast)

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => useStore.getState().setToast(null), 5000)
    return () => clearTimeout(id)
  }, [toast])

  if (!toast) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center">
      <div className="glass max-w-md rounded-xl border border-amber-500/40 px-5 py-3 text-center text-[13px] text-white animate-fadeIn">
        {toast}
      </div>
    </div>
  )
}

function SignIn(): JSX.Element {
  const start = (): void => window.xfly.signIn()
  const { props } = useFocus({ focusKey: 'SIGN_IN', onEnterPress: start })

  useEffect(() => {
    setFocus('SIGN_IN')
  }, [])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-center animate-fadeIn">
      <Mark size={88} />
      <div className="font-display text-6xl font-bold tracking-tight">
        X<span className="text-xbox-lift">Fly</span>
      </div>
      <p className="max-w-md text-ink-2">{t.signIn.tagline}</p>
      <button
        {...props}
        className="focusable rounded-xl bg-accent px-8 py-3 font-semibold text-white shadow-glow hover:brightness-110"
        onClick={start}
      >
        {t.signIn.button}
      </button>
      <p className="text-xs text-white/40">{t.signIn.note}</p>
    </div>
  )
}
