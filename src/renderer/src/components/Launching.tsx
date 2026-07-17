import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store'
import { ambientFrom } from '../lib/theme'
import { useFocus } from '../lib/focus'
import { t } from '../lib/i18n'
import { Mark } from './Mark'

const STEPS = [
  { key: 'session', label: t.launch.session },
  { key: 'queue', label: t.launch.queue },
  { key: 'console', label: t.launch.console },
  { key: 'connect', label: t.launch.connect },
] as const

function stepIndex(streamState: string, sessionState: string | null): number {
  if (sessionState === 'WaitingForResources' || sessionState === 'Queued') return 1
  if (sessionState === 'Provisioning' || sessionState === 'ReadyToConnect') return 2
  if (sessionState === 'Provisioned' || streamState === 'starting') return 3
  return 0
}

export function Launching(): JSX.Element {
  const streamState = useStore((s) => s.streamState)
  const sessionState = useStore((s) => s.sessionState)
  const game = useStore((s) => s.launching)
  const [ambient, setAmbient] = useState('16, 124, 16')

  useEffect(() => {
    let live = true
    void ambientFrom(game?.hero || game?.art).then((a) => live && setAmbient(a.rgb))
    return () => {
      live = false
    }
  }, [game?.productId])

  const active = stepIndex(streamState, sessionState)
  const queued = sessionState === 'WaitingForResources' || sessionState === 'Queued'

  return (
    // Opaque from the first frame. Fading this in left the overlay see-through for
    // a fifth of a second, and what showed through was xCloud's own launch screen —
    // the Xbox flash between pressing play and the game appearing. The contents
    // below still ease in; only the backdrop is instant.
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      className="pointer-events-auto absolute inset-0 overflow-hidden bg-void"
    >
      {(game?.hero || game?.art) && (
        <motion.img
          src={game.hero || game.art}
          initial={{ scale: 1, opacity: 0.22 }}
          animate={{ scale: [1, 1.1, 1.13], opacity: 0.5 }}
          transition={{
            scale: { duration: 19, times: [0, 0.05, 1], ease: ['circOut', 'linear'] },
            opacity: { duration: 1.1, ease: 'easeOut' },
          }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-black/45" />
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(900px 520px at 50% 55%, rgba(${ambient}, 0.26), transparent 68%)` }}
      />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex h-full flex-col items-center justify-center gap-8 px-10"
      >
        <div className="xfly-breathe">
          <Mark size={64} />
        </div>

        <div className="text-center">
          <AnimatePresence mode="wait">
            <motion.h1
              key={game?.productId ?? 'x'}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="font-display text-[clamp(24px,3vw,40px)] font-bold leading-tight tracking-[-0.03em]"
            >
              {game?.title ?? 'XFly'}
            </motion.h1>
          </AnimatePresence>
        </div>

        <Steps active={active} />

        <WaitTime />

        <AnimatePresence>
          {queued && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="max-w-sm text-center text-[12.5px] leading-relaxed text-white/45"
            >
              {t.launch.queueNote}
            </motion.p>
          )}
        </AnimatePresence>

        <Hint />
        <Cancel />
        <MenuTip />
      </motion.div>
    </motion.div>
  )
}

/**
 * What the region said this launch would take.
 *
 * The number was already being fetched for every region on every launch and only
 * ever reached the log. Here it answers the question the loading screen raises:
 * how long is this going to sit there.
 */
function WaitTime(): JSX.Element | null {
  const seconds = useStore((s) => s.waitSeconds)
  if (seconds == null) return null

  const label =
    seconds >= 90 ? `~${Math.round(seconds / 60)} ${t.launch.waitMinutes}` : `~${seconds}${t.launch.waitSeconds}`

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/40"
    >
      {t.launch.waitEstimate} {label}
    </motion.div>
  )
}

/**
 * Something to read while the console wakes up.
 *
 * One per launch, picked on mount and left alone — a line that swaps under you
 * while you are halfway through it is worse than no line at all.
 */
function Hint(): JSX.Element | null {
  const [line] = useState(() => t.launch.hints[Math.floor(Math.random() * t.launch.hints.length)])
  if (!line) return null

  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.5 }}
      className="max-w-md text-center text-[12.5px] italic leading-relaxed text-white/30"
    >
      {line}
    </motion.p>
  )
}

/** The way back out, shown where the player is already looking. */
function MenuTip(): JSX.Element {
  return (
    <div className="mt-1 flex items-center gap-2 text-[11px] text-white/25">
      <Chip>View</Chip>
      <span>+</span>
      <Chip>Menu</Chip>
      <span className="ml-0.5">{t.hud.menuHint}</span>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <span className="grid h-[15px] min-w-[15px] place-items-center rounded bg-white/[0.08] px-1 font-mono text-[9px] text-white/50">
      {children}
    </span>
  )
}

function Cancel(): JSX.Element {
  const cancel = (): void => {
    window.xfly.engineCommand({ type: 'disconnect' })
    window.xfly.showLauncher()
  }
  const { props, focusSelf } = useFocus({ focusKey: 'LAUNCH_CANCEL', onEnterPress: cancel })

  useEffect(() => {
    focusSelf()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === 'Backspace') cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <button
      {...props}
      onClick={cancel}
      className="focusable mt-2 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-[12px] font-semibold text-white/70 transition hover:bg-white/[0.12] hover:text-white"
    >
      <span className="grid h-[15px] w-[15px] place-items-center rounded bg-black/45 font-mono text-[9px] text-white/75">
        B
      </span>
      {t.launch.cancel}
    </button>
  )
}

function Steps({ active }: { active: number }): JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      {STEPS.map((s, i) => {
        const done = i < active
        const now = i === active
        return (
          <div key={s.key} className="flex items-center gap-2.5">
            <div className="flex flex-col items-center gap-2">
              <div className="relative h-[3px] w-16 overflow-hidden rounded-full bg-white/[0.09]">
                {done && <div className="h-full w-full rounded-full bg-xbox" />}
                {now && <div className="xfly-progress h-full w-1/2 rounded-full bg-velocity" />}
              </div>
              <span
                className={`whitespace-nowrap font-mono text-[9.5px] uppercase tracking-[0.14em] transition-colors ${
                  now ? 'text-velocity' : done ? 'text-white/45' : 'text-white/20'
                }`}
              >
                {s.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
