import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../store'
import { useFocus, FocusContext, setFocus } from '../lib/focus'
import { sfxBack } from '../lib/sfx'
import { t } from '../lib/i18n'

export function Account({ onClose }: { onClose: () => void }): JSX.Element {
  const profile = useStore((s) => s.profile)
  const [leaving, setLeaving] = useState(false)

  const { focusKey, props } = useFocus({
    focusKey: 'ACCOUNT',
    isFocusBoundary: true,
    trackChildren: true,
  })

  useEffect(() => {
    setFocus('ACCOUNT_CLOSE')
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        sfxBack()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const signOut = (): void => {
    if (leaving) return
    setLeaving(true)
    void window.xfly.signOut()
  }

  return (
    <FocusContext.Provider value={focusKey}>
      <motion.div
        {...props}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 z-30 bg-void/80 backdrop-blur-xl"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-9 top-[4.6rem] w-[min(21rem,90vw)] rounded-2xl border border-line bg-bg-1/95 p-6 shadow-2xl"
        >
          <div className="flex items-center gap-4">
            {profile?.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                decoding="async"
                className="h-16 w-16 shrink-0 rounded-full border border-white/10 object-cover"
              />
            ) : (
              <span className="h-16 w-16 shrink-0 rounded-full bg-gradient-to-br from-xbox-lift to-xbox" />
            )}
            <div className="min-w-0">
              <div className="truncate font-display text-lg font-bold leading-tight tracking-tight">
                {profile?.gamertag ?? t.account.fallbackName}
              </div>
              {profile?.name && <div className="mt-0.5 truncate text-[12.5px] text-ink-3">{profile.name}</div>}
            </div>
          </div>

          {profile?.gamerscore && (
            <div className="mt-5 flex gap-2">
              <Fact label={t.account.gamerscore} value={formatScore(profile.gamerscore)} />
            </div>
          )}

          <div className="mt-5 flex flex-col gap-2">
            <PanelButton
              focusKey="ACCOUNT_SIGNOUT"
              label={leaving ? t.account.signingOut : t.account.signOut}
              onPress={signOut}
            />
            <PanelButton focusKey="ACCOUNT_CLOSE" label={t.account.close} onPress={onClose} />
          </div>
        </motion.div>
      </motion.div>
    </FocusContext.Provider>
  )
}

function formatScore(v: string): string {
  const n = Number(v)
  return Number.isFinite(n) ? n.toLocaleString() : v
}

function Fact({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex-1 rounded-xl border border-line bg-bg-2 px-3.5 py-2.5">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.13em] text-white/40">{label}</div>
      <div className="mt-1 truncate font-display text-[15px] font-bold">{value}</div>
    </div>
  )
}

function PanelButton({
  focusKey,
  label,
  onPress,
}: {
  focusKey: string
  label: string
  onPress: () => void
}): JSX.Element {
  const { focused, props } = useFocus({ focusKey, onEnterPress: onPress })
  return (
    <button
      {...props}
      onClick={onPress}
      className={`focusable rounded-xl border px-4 py-2.5 text-[13.5px] font-semibold transition ${
        focused ? 'border-velocity bg-xbox/20' : 'border-line bg-bg-2 hover:bg-bg-3'
      }`}
    >
      {label}
    </button>
  )
}
