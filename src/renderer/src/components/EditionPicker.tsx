import { useEffect } from 'react'
import { motion } from 'framer-motion'
import type { GameTile } from '../store'
import { useFocus, FocusContext, setFocus } from '../lib/focus'
import { sfxBack } from '../lib/sfx'
import { t } from '../lib/i18n'

export function EditionPicker({
  game,
  onPick,
  onCancel,
}: {
  game: GameTile
  onPick: (t: GameTile) => void
  onCancel: () => void
}): JSX.Element {
  const { focusKey, props } = useFocus({
    focusKey: 'EDITIONS',
    isFocusBoundary: true,
    trackChildren: true,
  })

  useEffect(() => {
    setFocus('EDITIONS')
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        sfxBack()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <FocusContext.Provider value={focusKey}>
      <motion.div
        {...props}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 z-30 grid place-items-center bg-void/92 backdrop-blur-xl"
      >
        <motion.div
          initial={{ scale: 0.96, y: 8 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="w-[min(30rem,90vw)] rounded-2xl border border-line bg-bg-1 p-7"
        >
          <div className="flex items-center gap-4">
            {game.art && (
              <img src={game.art} decoding="async" className="h-20 w-15 rounded-lg object-cover" />
            )}
            <div className="min-w-0">
              <h2 className="font-display text-xl font-bold leading-tight tracking-tight">{game.title}</h2>
              <p className="mt-1 text-[12.5px] text-ink-3">{t.edition.question}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2">
            {game.editions?.map((e) => (
              <Option key={e.productId} tile={e} onPress={() => onPick(e)} />
            ))}
          </div>

          <button
            onClick={() => {
              sfxBack()
              onCancel()
            }}
            className="mt-4 w-full text-center text-[12px] text-ink-3 transition hover:text-white/70"
          >
            {t.edition.cancel}
          </button>
        </motion.div>
      </motion.div>
    </FocusContext.Provider>
  )
}

function Option({ tile, onPress }: { tile: GameTile; onPress: () => void }): JSX.Element {
  const { focused, props } = useFocus({ onEnterPress: onPress })
  const newer = tile.edition !== 'Xbox One'
  return (
    <button
      {...props}
      onClick={onPress}
      className={`focusable flex items-center justify-between gap-4 rounded-xl border px-4 py-3.5 text-left transition ${
        focused ? 'border-velocity bg-xbox/20' : 'border-line bg-bg-2 hover:bg-bg-3'
      }`}
    >
      <div>
        <div className="text-[14px] font-semibold">{tile.edition ?? t.edition.standard}</div>
        <div className="mt-0.5 text-[11.5px] text-ink-3">
          {newer ? t.edition.newer : t.edition.older}
        </div>
      </div>
      {newer && (
        <span className="shrink-0 rounded-md bg-xbox px-2 py-1 font-mono text-[9.5px] uppercase tracking-wider text-white">
          {t.edition.recommended}
        </span>
      )}
    </button>
  )
}
