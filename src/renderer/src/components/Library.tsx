import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore, type GameTile } from '../store'
import { GameCard } from './GameCard'
import { Screen } from './Screen'
import { EditionPicker } from './EditionPicker'
import { t, fmt } from '../lib/i18n'
import { useFocus, FocusContext } from '../lib/focus'
import { STORE_COLLECTIONS, loadCollection, groupEditions, type Collection } from '../lib/xbox'

export function Library(): JSX.Element {
  const library = useStore((s) => s.library)
  const setSelected = useStore((s) => s.setSelected)
  const setView = useStore((s) => s.setView)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Collection[]>([])
  const [asking, setAsking] = useState<GameTile | null>(null)

  const games = useMemo(() => groupEditions(library), [library])

  useEffect(() => {
    let live = true
    for (const id of STORE_COLLECTIONS) {
      void loadCollection(id)
        .then((c) => {
          if (c && live) setRows((r) => (r.some((x) => x.id === c.id) ? r : [...r, c]))
        })
        .catch(() => {})
    }
    return () => {
      live = false
    }
  }, [])

  const filtered = useMemo(
    () => (q ? games.filter((t) => t.title.toLowerCase().includes(q.toLowerCase())) : []),
    [games, q],
  )

  const choose = (t: GameTile): void => {
    setSelected(t)
    setView('home')
  }

  const pick = (t: GameTile): void => {
    if (t.editions?.length) setAsking(t)
    else choose(t)
  }

  const ordered = STORE_COLLECTIONS.map((id) => rows.find((r) => r.id === id)).filter(
    (r): r is Collection => !!r,
  )

  return (
    <Screen
      title={t.nav.library}
      count={games.length ? fmt(t.library.count, { n: games.length }) : undefined}
      actions={<Search value={q} onChange={setQ} />}
    >
      <AnimatePresence>
        {asking && (
          <EditionPicker
            key={asking.productId}
            game={asking}
            onPick={(t) => {
              setAsking(null)
              choose(t)
            }}
            onCancel={() => setAsking(null)}
          />
        )}
      </AnimatePresence>
      {q ? (
        <>
          <Grid tiles={filtered} focusKey="LIBRARY_SEARCH" onPick={pick} />
          {filtered.length === 0 && (
            <div className="py-24 text-center text-sm text-ink-3">{fmt(t.library.noResults, { q })}</div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-9">
          {ordered.map((c, i) => (
            <Row key={c.id} collection={c} index={i} onPick={pick} />
          ))}
          {games.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-[15px] font-bold tracking-tight">{t.library.allGames}</h2>
              <Grid tiles={games} focusKey="LIBRARY_ALL" onPick={pick} />
            </section>
          )}
          {games.length === 0 && ordered.length === 0 && (
            <div className="py-24 text-center text-sm text-ink-3">{t.home.loadingLibrary}</div>
          )}
        </div>
      )}
    </Screen>
  )
}

function Row({
  collection,
  index,
  onPick,
}: {
  collection: Collection
  index: number
  onPick: (t: GameTile) => void
}): JSX.Element {
  const { focusKey, props } = useFocus({
    focusKey: `ROW_${collection.id}`,
    trackChildren: true,
    saveLastFocusedChild: true,
  })

  return (
    <FocusContext.Provider value={focusKey}>
      <motion.section
        {...props}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: Math.min(index, 4) * 0.06, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="mb-3">
          <h2 className="font-display text-[15px] font-bold tracking-tight">{collection.title}</h2>
          {collection.description && (
            <p className="mt-0.5 text-[12px] text-ink-3">{collection.description}</p>
          )}
        </div>
        <div className="-mx-2 -my-3 flex gap-3.5 overflow-x-auto px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {collection.tiles.map((t) => (
            <div key={t.productId} className="w-[8.5rem] shrink-0">
              <GameCard tile={t} onPress={onPick} />
            </div>
          ))}
        </div>
      </motion.section>
    </FocusContext.Provider>
  )
}

function useProgressive<T>(items: T[], { after = 450, chunk = 24 } = {}): T[] {
  const [n, setN] = useState(0)

  useEffect(() => {
    let cancelled = false
    let raf = 0
    let shown = 0

    const step = (): void => {
      if (cancelled) return
      shown = Math.min(items.length, shown + chunk)
      setN(shown)
      if (shown < items.length) raf = requestAnimationFrame(step)
    }

    setN(0)
    const t = setTimeout(step, after)

    return () => {
      cancelled = true
      clearTimeout(t)
      cancelAnimationFrame(raf)
    }
  }, [items.length, after, chunk])

  return useMemo(() => items.slice(0, n), [items, n])
}

function Grid({
  tiles,
  focusKey: key,
  onPick,
}: {
  tiles: GameTile[]
  focusKey: string
  onPick: (t: GameTile) => void
}): JSX.Element {
  const { focusKey, props } = useFocus({ focusKey: key, trackChildren: true, saveLastFocusedChild: true })
  const shown = useProgressive(tiles)
  return (
    <FocusContext.Provider value={focusKey}>
      <div {...props} className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-4">
        {shown.map((t) => (
          <GameCard key={t.productId} tile={t} onPress={onPick} />
        ))}
      </div>
    </FocusContext.Provider>
  )
}

function Search({ value, onChange }: { value: string; onChange: (v: string) => void }): JSX.Element {
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return
      if (document.activeElement === input.current) return
      input.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2">
      <span className="text-ink-3">⌕</span>
      <input
        ref={input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t.library.search}
        className="w-52 bg-transparent text-[12.5px] outline-none placeholder:text-ink-3"
        style={{ userSelect: 'text' }}
      />
      {value && (
        <button onClick={() => onChange('')} className="text-ink-3 hover:text-white">
          ✕
        </button>
      )}
    </div>
  )
}
