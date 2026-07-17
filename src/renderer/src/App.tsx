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
import { loadLibrary, loadRecent, loadProfile } from './lib/xbox'

const BOOT_MAX_MS = 8_000

export default function App(): JSX.Element {
  const view = useStore((s) => s.view)
  const signedIn = useStore((s) => s.signedIn)
  const booted = useStore((s) => s.booted)
  const streamState = useStore((s) => s.streamState)

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
  }, [signedIn])

  const inGame = streamState === 'playing' || streamState === 'starting' || streamState === 'loading'

  if (signedIn === null) return <Splash status={t.boot.starting} />
  if (signedIn && !booted) return <Splash status={t.boot.loadingAccount} />

  return (
    <div className="relative h-full w-full">
      {inGame ? (
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
      )}
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
