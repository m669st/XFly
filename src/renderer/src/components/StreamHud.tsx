import { useState } from 'react'
import { useStore } from '../store'
import { t } from '../lib/i18n'
import { Launching } from './Launching'

export function StreamHud(): JSX.Element {
  const stats = useStore((s) => s.stats)
  const streamState = useStore((s) => s.streamState)
  const [open, setOpen] = useState(false)

  return (
    <div className="pointer-events-none fixed inset-0 z-20">
      {streamState !== 'playing' && <Launching />}

      {stats && streamState === 'playing' && (
        <div className="pointer-events-auto absolute left-4 top-4 flex items-center gap-3">
          <button
            onClick={() => setOpen((o) => !o)}
            className="glass rounded-lg px-3 py-1.5 text-xs font-semibold text-accent shadow-glow"
          >
            XFly ▾
          </button>
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

      {open && (
        <div className="pointer-events-auto absolute left-4 top-16 w-72 animate-fadeIn">
          <QuickPanel onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}

function QuickPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const settings = useStore((s) => s.settings)
  const set = async (k: string, v: unknown) => {
    const all = await window.xfly.setSetting(k, v)
    useStore.getState().setSettings(all)
  }
  return (
    <div className="glass space-y-3 rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{t.hud.quickSettings}</span>
        <button onClick={onClose} className="text-white/50 hover:text-white">✕</button>
      </div>
      <label className="block text-xs text-white/70">
        {t.settings.sharpen}
        <input
          type="range" min={0} max={5} value={(settings.claritySharpen as number) ?? 2}
          onChange={(e) => set('claritySharpen', Number(e.target.value))}
          className="mt-1 w-full accent-accent"
        />
      </label>
      <label className="block text-xs text-white/70">
        {t.settings.clarityBoost}
        <input
          type="range" min={0} max={5} value={(settings.clarityBoost as number) ?? 1}
          onChange={(e) => set('clarityBoost', Number(e.target.value))}
          className="mt-1 w-full accent-accent"
        />
      </label>
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => { window.xfly.engineCommand({ type: 'disconnect' }); window.xfly.showLauncher() }}
          className="flex-1 rounded-lg bg-white/10 py-2 text-xs hover:bg-white/20"
        >
          ← {t.hud.backToMenu}
        </button>
        <button
          onClick={() => { window.xfly.engineCommand({ type: 'disconnect' }); window.xfly.showLauncher() }}
          className="flex-1 rounded-lg bg-red-500/80 py-2 text-xs font-semibold hover:bg-red-500"
        >
          {t.hud.disconnect}
        </button>
      </div>
    </div>
  )
}
