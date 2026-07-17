import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { t } from '../lib/i18n'
import { Launching } from './Launching'
import { useFocus, setFocus } from '../lib/focus'

export function StreamHud(): JSX.Element {
  const stats = useStore((s) => s.stats)
  const streamState = useStore((s) => s.streamState)
  const open = useStore((s) => s.hudOpen)
  const [hint, setHint] = useState(false)

  // The menu answers to a button combination and nothing else — there is no icon to
  // stumble onto. A player who is never told is a player who has no way out, so the
  // stream announces it once and then leaves.
  useEffect(() => {
    if (streamState !== 'playing') return
    setHint(true)
    const id = setTimeout(() => setHint(false), 7000)
    return () => clearTimeout(id)
  }, [streamState])

  return (
    <div className="pointer-events-none fixed inset-0 z-20">
      {streamState !== 'playing' && <Launching />}

      {stats && streamState === 'playing' && !open && (
        <div className="absolute left-4 top-4 flex items-center gap-3">
          <div className="glass flex items-center gap-3 rounded-lg px-3 py-1.5 font-mono text-[11px] text-white/80">
            <span>{stats.width}×{stats.height}</span>
            <span>{stats.fps}fps</span>
            <span className={stats.bitrateMbps < 8 ? 'text-red-400' : 'text-accent'}>{stats.bitrateMbps}Mbps</span>
            {stats.rttMs != null && <span className={stats.rttMs > 150 ? 'text-yellow-400' : ''}>{stats.rttMs}ms</span>}
            <span>{stats.codec.replace('video/', '')}</span>
          </div>
          {stats.bufferbloat && (
            <div className="glass rounded-lg border border-yellow-500/40 px-3 py-1.5 text-[11px] text-yellow-300">
              ⚠ {t.hud.unstable}
            </div>
          )}
        </div>
      )}

      {hint && !open && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-fadeIn">
          <div className="glass flex items-center gap-2 rounded-full px-4 py-2 text-[12px] text-white/80">
            <Chip>View</Chip>
            <span className="text-white/35">+</span>
            <Chip>Menu</Chip>
            <span className="ml-1">{t.hud.menuHint}</span>
          </div>
        </div>
      )}

      {open && <Menu />}
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <span className="rounded bg-black/45 px-1.5 py-0.5 font-mono text-[10px] text-white/75">{children}</span>
  )
}

function Menu(): JSX.Element {
  const profile = useStore((s) => s.profile)
  const launching = useStore((s) => s.launching)
  const selected = useStore((s) => s.selected)
  const stats = useStore((s) => s.stats)
  const game = launching ?? selected

  useEffect(() => {
    setFocus('HUD_RESUME')
  }, [])

  const resume = (): void => {
    useStore.getState().setHudOpen(false)
    window.xfly.showStream()
  }

  const quit = (): void => {
    useStore.getState().setHudOpen(false)
    window.xfly.engineCommand({ type: 'disconnect' })
    window.xfly.showLauncher()
  }

  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/75 animate-fadeIn">
      <div className="glass w-[440px] space-y-5 rounded-2xl p-6">
        <div className="flex items-center gap-3">
          {profile?.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" className="h-12 w-12 rounded-full bg-white/10" />
          ) : (
            <div className="h-12 w-12 rounded-full bg-white/10" />
          )}
          <div className="min-w-0">
            <div className="truncate font-semibold">{profile?.gamertag ?? profile?.name ?? ''}</div>
            {profile?.gamerscore && <div className="text-xs text-ink-3">{profile.gamerscore} G</div>}
          </div>
        </div>

        {game && (
          <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
            {game.art && <img src={game.art} alt="" className="h-14 w-14 rounded-lg object-cover" />}
            <div className="min-w-0">
              <div className="truncate font-medium">{game.title}</div>
              {stats && (
                <div className="font-mono text-[11px] text-ink-3">
                  {stats.width}×{stats.height} · {stats.fps}fps · {stats.bitrateMbps}Mbps
                </div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-2 pt-1">
          <MenuButton id="HUD_RESUME" onPress={resume} className="bg-accent text-white shadow-glow hover:brightness-110">
            {t.hud.resume}
          </MenuButton>
          <MenuButton id="HUD_QUIT" onPress={quit} className="bg-red-500/80 text-white hover:bg-red-500">
            {t.hud.quitGame}
          </MenuButton>
        </div>

        <p className="text-center text-[11px] text-white/40">{t.hud.shortcutHint}</p>
      </div>
    </div>
  )
}

function MenuButton({
  id,
  onPress,
  className,
  children,
}: {
  id: string
  onPress: () => void
  className: string
  children: React.ReactNode
}): JSX.Element {
  const { props } = useFocus({ focusKey: id, onEnterPress: onPress })
  return (
    <button {...props} onClick={onPress} className={`focusable w-full rounded-xl py-3 font-semibold ${className}`}>
      {children}
    </button>
  )
}
