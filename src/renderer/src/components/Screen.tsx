import { motion } from 'framer-motion'
import { useEffect } from 'react'
import { useStore } from '../store'
import { t } from '../lib/i18n'
import { useFocus, FocusContext, setFocus } from '../lib/focus'
import { sfxBack } from '../lib/sfx'

export function Screen({
  title,
  count,
  actions,
  children,
}: {
  title: string
  count?: string
  actions?: React.ReactNode
  children: React.ReactNode
}): JSX.Element {
  const setView = useStore((s) => s.setView)
  const back = (): void => {
    sfxBack()
    setView('home')
  }

  const { focusKey, props } = useFocus({
    focusKey: 'SCREEN',
    isFocusBoundary: true,
    trackChildren: true,
    saveLastFocusedChild: true,
  })

  useEffect(() => {
    setFocus('SCREEN')
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === 'Backspace') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <FocusContext.Provider value={focusKey}>
      <motion.div
        {...props}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
        className="absolute inset-0 z-20 flex flex-col bg-void"
      >
        <header className="flex items-center justify-between gap-6 px-10 pb-2 pt-7">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-[21px] font-bold tracking-tight">{title}</h1>
            {count && <span className="text-sm text-ink-3">· {count}</span>}
          </div>
          <div className="flex items-center gap-2.5">
            {actions}
            <BackButton onPress={back} />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-10 pb-10 pt-3">{children}</div>
      </motion.div>
    </FocusContext.Provider>
  )
}

function BackButton({ onPress }: { onPress: () => void }): JSX.Element {
  const { props } = useFocus({ onEnterPress: onPress })
  return (
    <button
      {...props}
      onClick={onPress}
      className="focusable flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-4 py-2 text-[12.5px] font-semibold text-white/90 hover:bg-white/[0.14]"
    >
      <span className="grid h-[15px] w-[15px] place-items-center rounded bg-black/45 font-mono text-[9px] text-white/75">
        B
      </span>
      {t.nav.back}
    </button>
  )
}
