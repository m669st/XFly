import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore, type GameTile } from '../store'
import { launch } from '../lib/xbox'
import { useFocus, FocusContext, setFocus } from '../lib/focus'
import { sfxLaunch } from '../lib/sfx'
import { ambientFrom } from '../lib/theme'
import { DEFAULT_TARGET, aimAt, irisFor } from '../lib/light'
import { useBeamSpring } from '../lib/useAim'
import { Mark } from './Mark'
import { GameCard } from './GameCard'
import { Account } from './Account'
import { Particles } from './Particles'
import { Spotlight } from './Spotlight'
import { t } from '../lib/i18n'

export function Home(): JSX.Element {
  const recent = useStore((s) => s.recent)
  const library = useStore((s) => s.library)
  const signedIn = useStore((s) => s.signedIn)
  const setView = useStore((s) => s.setView)
  const selected = useStore((s) => s.selected)
  const setSelected = useStore((s) => s.setSelected)
  const view = useStore((s) => s.view)

  const rail = recent.length ? recent : library.slice(0, 12)
  const [ambient, setAmbient] = useState('16, 124, 16')
  const [account, setAccount] = useState(false)

  const game = selected ?? rail[0] ?? null

  const [target, setTarget] = useState({ ...DEFAULT_TARGET, w: 0.3 })
  const titleEl = useRef<HTMLHeadingElement | null>(null)

  const measure = useCallback(() => {
    const el = titleEl.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    const next = {
      x: (r.left + r.width / 2) / window.innerWidth,
      y: (r.top + r.height / 2) / window.innerHeight,
      w: r.width / window.innerWidth,
    }
    setTarget((p) =>
      Math.abs(p.x - next.x) < 5e-4 && Math.abs(p.y - next.y) < 5e-4 && Math.abs(p.w - next.w) < 5e-4
        ? p
        : next,
    )
  }, [])

  const ro = useRef<ResizeObserver | null>(null)
  const titleRef = useCallback(
    (el: HTMLHeadingElement | null) => {
      ro.current?.disconnect()
      ro.current = null
      titleEl.current = el
      if (!el) return
      measure()
      ro.current = new ResizeObserver(measure)
      ro.current.observe(el)
    },
    [measure],
  )
  useEffect(() => () => ro.current?.disconnect(), [])

  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  const reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const targetAim = aimAt(target.x, target.y, window.innerWidth, window.innerHeight)
  const beam = useBeamSpring(
    {
      aim: targetAim,
      iris: irisFor(
        target.w * window.innerWidth,
        target.x,
        target.y,
        window.innerWidth,
        window.innerHeight,
      ),
    },
    !reduced,
  )

  const titleLight = {
    cssAngle: (180 - (targetAim * 180) / Math.PI).toFixed(1),
    sx: (Math.tan(targetAim) * 9).toFixed(1),
    sy: 9,
  }

  useEffect(() => {
    if (!game) return
    let live = true
    void ambientFrom(game.hero || game.art).then((a) => live && setAmbient(a.rgb))
    return () => {
      live = false
    }
  }, [game?.productId])

  useEffect(() => {
    if (view !== 'home' || !rail.length) return
    setFocus(useStore.getState().selected ? 'HOME_PLAY' : 'HOME_RAIL')
  }, [view, rail.length > 0])

  useEffect(() => {
    const onShoulder = (e: Event): void => {
      if (account) return
      const side = (e as CustomEvent<'LB' | 'RB'>).detail
      setView(side === 'LB' ? 'library' : 'settings')
    }
    window.addEventListener('xfly-shoulder', onShoulder)
    return () => window.removeEventListener('xfly-shoulder', onShoulder)
  }, [account])

  return (
    <div className="xfly-grain xfly-vignette relative h-full w-full overflow-hidden bg-void">
      <AnimatePresence mode="popLayout">
        {game && (
          <motion.div
            key={game.productId}
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0"
          >
            {(game.hero || game.art) && (
              <img src={game.hero || game.art} className="xfly-drift h-full w-full object-cover" />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(96deg, rgba(0,0,0,0.94) 4%, rgba(0,0,0,0.68) 38%, rgba(0,0,0,0.12) 72%),
                       linear-gradient(0deg, rgba(0,0,0,0.92) 2%, transparent 46%)`,
        }}
      />
      <Ambient rgb={ambient} />
      <Spotlight rgb={ambient} beam={beam} />
      <Particles rgb={ambient} beam={beam} />

      <div className="relative flex h-full flex-col justify-between">
        <header className="flex items-start justify-between px-10 pt-7">
          <div className="flex items-center gap-2.5">
            <Mark size={22} />
            <span className="font-display text-[15px] font-bold tracking-tight">
              X<span className="text-xbox-lift">Fly</span>
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <CornerButton label={t.nav.library} hint="LB" onPress={() => setView('library')} />
            <CornerButton label={t.nav.settings} hint="RB" onPress={() => setView('settings')} />
            {signedIn && <AccountChip onPress={() => setAccount(true)} />}
            <QuitButton />
          </div>
        </header>

        <div className="px-10">
          <AnimatePresence mode="wait">
            {game && (
              <motion.div
                key={game.productId}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="max-w-[46%]"
              >
                <div className="flex items-center gap-2.5">
                  <span className="h-0.5 w-5 bg-velocity" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-velocity">
                    {recent.length ? t.home.continue : t.home.play}
                  </span>
                </div>
                <h1
                  ref={titleRef}
                  className="mt-3 w-fit font-display text-[clamp(28px,3.6vw,52px)] font-bold leading-none tracking-[-0.035em]"
                  style={{
                    backgroundImage: `linear-gradient(${titleLight.cssAngle}deg, #ffffff 0%, #ffffff 34%, rgba(255,255,255,0.86) 58%, rgba(214,220,214,0.68) 100%)`,
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    color: 'transparent',
                    filter: `drop-shadow(0 2px 1px rgba(0,0,0,0.55)) drop-shadow(${titleLight.sx}px ${titleLight.sy}px 22px rgba(0,0,0,0.5)) drop-shadow(0 0 26px rgba(${ambient}, 0.28))`,
                  }}
                >
                  {game.title}
                </h1>
                <PlayButton tile={game} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Rail tiles={rail} onSelect={setSelected} />
      </div>

      <AnimatePresence>
        {account && (
          <Account
            key="account"
            onClose={() => {
              setAccount(false)
              setFocus('HOME_ACCOUNT')
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function Ambient({ rgb }: { rgb: string }): JSX.Element {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ background: `radial-gradient(1100px 620px at 88% 22%, rgba(${rgb}, 0.30), transparent 66%)` }}
    />
  )
}

/**
 * The way out of XFly.
 *
 * It used to live at the bottom of Settings → Advanced, which is a strange place to
 * put the one thing every session ends with. Up here it is where a window's close
 * button would be, and a pad reaches it in the same breath as everything else.
 */
function QuitButton(): JSX.Element {
  const quit = (): void => window.xfly.close()
  const { props, focused } = useFocus({ focusKey: 'HOME_QUIT', onEnterPress: quit })

  return (
    <button
      {...props}
      onClick={quit}
      aria-label={t.settings.quitButton}
      className={`focusable grid h-[30px] w-[30px] place-items-center rounded-lg border transition ${
        focused
          ? 'border-red-400/70 bg-red-500/25 text-white'
          : 'border-white/10 bg-white/[0.06] text-white/45 hover:text-white'
      }`}
    >
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    </button>
  )
}

function AccountChip({ onPress }: { onPress: () => void }): JSX.Element {
  const profile = useStore((s) => s.profile)
  const { props } = useFocus({ focusKey: 'HOME_ACCOUNT', onEnterPress: onPress })
  return (
    <button
      {...props}
      onClick={onPress}
      className="focusable flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] py-1.5 pl-1.5 pr-3.5 text-xs backdrop-blur-xl transition hover:bg-white/[0.14]"
    >
      {profile?.avatarUrl ? (
        <img src={profile.avatarUrl} className="h-5 w-5 rounded-full object-cover" />
      ) : (
        <span className="h-5 w-5 rounded-full bg-gradient-to-br from-xbox-lift to-xbox" />
      )}
      <span className="text-white/85">{profile?.gamertag ?? t.account.fallbackName}</span>
    </button>
  )
}

function PlayButton({ tile }: { tile: GameTile }): JSX.Element {
  const start = (): void => {
    sfxLaunch()
    launch(tile)
  }
  const { props } = useFocus({ focusKey: 'HOME_PLAY', onEnterPress: start })
  return (
    <button
      {...props}
      onClick={start}
      className="focusable mt-5 inline-flex items-center gap-2.5 rounded-full bg-xbox px-7 py-3 font-display text-[15px] font-bold text-white shadow-glow"
    >
      <span className="text-xs">▶</span> {t.home.play}
    </button>
  )
}

function Rail({ tiles, onSelect }: { tiles: GameTile[]; onSelect: (t: GameTile) => void }): JSX.Element {
  const { focusKey, props } = useFocus({
    focusKey: 'HOME_RAIL',
    trackChildren: true,
    saveLastFocusedChild: true,
  })

  const toPlay = (): void => {
    setFocus('HOME_PLAY')
  }

  if (!tiles.length) {
    return (
      <div className="px-10 pb-8 pt-6 text-sm text-ink-3">{t.home.loadingLibrary}</div>
    )
  }

  return (
    <FocusContext.Provider value={focusKey}>
      <div {...props} className="px-10 pb-8">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-white/45">
          {t.home.recent}
        </div>
        <div className="-mx-2 -my-3 flex gap-3.5 overflow-x-auto px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tiles.map((t) => (
            <div key={t.productId} className="w-[9.5rem] shrink-0">
              <GameCard tile={t} onSelect={onSelect} onPress={toPlay} />
            </div>
          ))}
        </div>
      </div>
    </FocusContext.Provider>
  )
}

function CornerButton({
  label,
  hint,
  onPress,
}: {
  label: string
  hint?: string
  onPress: () => void
}): JSX.Element {
  const { props } = useFocus({ onEnterPress: onPress })
  return (
    <button
      {...props}
      onClick={onPress}
      className="focusable flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-4 py-2 text-[12.5px] font-semibold text-white/90 backdrop-blur-xl hover:bg-white/[0.14]"
    >
      {hint && (
        <span className="grid h-[15px] w-[15px] place-items-center rounded bg-black/45 font-mono text-[9px] text-white/75">
          {hint}
        </span>
      )}
      {label}
    </button>
  )
}
