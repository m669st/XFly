import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore, type GameTile } from '../store'
import { GameCard } from './GameCard'
import { Screen } from './Screen'
import { EditionPicker } from './EditionPicker'
import { t, fmt } from '../lib/i18n'
import { Osc } from './Osc'
import { useFocus, FocusContext, setFocus } from '../lib/focus'
import {
  STORE_COLLECTIONS,
  SYOG_COLLECTION,
  LEAVING_SOON_COLLECTION,
  loadCollection,
  groupEditions,
  type Collection,
} from '../lib/xbox'

// The synthetic "all games" shelf, distinct from any real collection id.
const ALL_ID = '__all__'

export function Library(): JSX.Element {
  const library = useStore((s) => s.library)
  const setSelected = useStore((s) => s.setSelected)
  const setView = useStore((s) => s.setView)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Collection[]>([])
  const [syog, setSyog] = useState<Collection | null>(null)
  const [leaving, setLeaving] = useState<Collection | null>(null)
  const [asking, setAsking] = useState<GameTile | null>(null)
  // The full-grid view a "Show all" opens onto. Null means the shelves are showing.
  const [detail, setDetail] = useState<{ title: string; tiles: GameTile[] } | null>(null)

  const games = useMemo(() => groupEditions(library), [library])

  // In the detail grid, B goes back to the shelves rather than all the way home.
  useEffect(() => {
    if (!detail) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.stopPropagation()
        e.preventDefault()
        setDetail(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [detail])

  const showAll = async (c: Collection): Promise<void> => {
    // A row only holds its first slice. If the collection has more, fetch the rest
    // before opening the grid so "Show all" actually shows all of it.
    if (c.id === ALL_ID || c.total <= c.tiles.length) {
      setDetail({ title: c.title, tiles: c.tiles })
      return
    }
    setDetail({ title: c.title, tiles: c.tiles })
    const override =
      c.id === syog?.id ? t.library.owned : c.id === leaving?.id ? t.library.leavingSoon : undefined
    const full = await loadCollection(c.id, 1000, override).catch(() => null)
    if (full) setDetail({ title: c.title, tiles: full.tiles })
  }

  useEffect(() => {
    let live = true
    // The account's own games first — it either fills or it returns null and the
    // shelf never renders. Either way it is asked for before the catalogue rows.
    void loadCollection(SYOG_COLLECTION, 24, t.library.owned)
      .then((c) => live && setSyog(c))
      .catch(() => {})
    void loadCollection(LEAVING_SOON_COLLECTION, 24, t.library.leavingSoon)
      .then((c) => live && setLeaving(c))
      .catch(() => {})
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

  const [osc, setOsc] = useState(false)

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

  // The whole library as one more shelf, so "All games" reads and behaves like every
  // other row instead of an endless grid pinned to the bottom.
  const allGames: Collection | null =
    games.length > 0 ? { id: ALL_ID, title: t.library.allGames, tiles: games.slice(0, 24), total: games.length } : null

  return (
    <>
    <Screen
      title={detail ? detail.title : t.nav.library}
      count={
        detail
          ? fmt(t.library.count, { n: detail.tiles.length })
          : games.length
            ? fmt(t.library.count, { n: games.length })
            : undefined
      }
      actions={detail ? undefined : <Search value={q} onChange={setQ} onOpen={() => setOsc(true)} />}
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
      {detail ? (
        <div className="flex flex-col gap-4">
          <BackButton onPress={() => setDetail(null)} />
          <Grid tiles={detail.tiles} focusKey="LIBRARY_DETAIL" onPick={pick} />
        </div>
      ) : q ? (
        <>
          <Grid tiles={filtered} focusKey="LIBRARY_SEARCH" onPick={pick} />
          {filtered.length === 0 && (
            <div className="py-24 text-center text-sm text-ink-3">{fmt(t.library.noResults, { q })}</div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-9">
          {syog && <Row collection={syog} index={0} onPick={pick} onShowAll={showAll} accent />}
          {ordered.map((c, i) => (
            <Row key={c.id} collection={c} index={i + (syog ? 1 : 0)} onPick={pick} onShowAll={showAll} />
          ))}
          {leaving && <Row collection={leaving} index={ordered.length + 1} onPick={pick} onShowAll={showAll} warn />}
          {allGames && <Row collection={allGames} index={ordered.length + 2} onPick={pick} onShowAll={showAll} />}
          {games.length === 0 && ordered.length === 0 && (
            <div className="py-24 text-center text-sm text-ink-3">{t.home.loadingLibrary}</div>
          )}
        </div>
      )}
    </Screen>

    {osc && (
      <Osc
        value={q}
        onChange={setQ}
        onClose={() => {
          setOsc(false)
          // Hand focus back by name. The keys the pad was standing on are about to
          // unmount, and spatial navigation has nowhere to fall back to — the whole
          // screen goes unselectable until something claims focus again.
          setFocus('LIBRARY_SEARCH_BOX')
        }}
      />
    )}
    </>
  )
}

function Row({
  collection,
  index,
  onPick,
  onShowAll,
  accent,
  warn,
}: {
  collection: Collection
  index: number
  onPick: (t: GameTile) => void
  onShowAll: (c: Collection) => void
  // The account's own shelf. Marked so it reads as "yours" rather than as one more
  // catalogue row it happens to sit above.
  accent?: boolean
  // A shelf of things about to disappear. Amber so it reads as a deadline.
  warn?: boolean
}): JSX.Element {
  const { focusKey, props } = useFocus({
    focusKey: `ROW_${collection.id}`,
    trackChildren: true,
    saveLastFocusedChild: true,
  })

  // Worth offering only when the row is hiding some of the shelf behind it.
  const more = collection.total > collection.tiles.length

  return (
    <FocusContext.Provider value={focusKey}>
      <motion.section
        {...props}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: Math.min(index, 4) * 0.06, ease: [0.16, 1, 0.3, 1] }}
        className={accent ? 'rounded-2xl bg-gradient-to-b from-xbox/[0.08] to-transparent p-4 -mx-4' : undefined}
      >
        <div className="mb-3 flex items-center gap-2">
          {accent && (
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="text-xbox-lift" aria-hidden="true">
              <path d="M2 4.5h12M2 8h12M2 11.5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          )}
          {warn && (
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="text-amber-400" aria-hidden="true">
              <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.4" />
              <path d="M8 4.8v3.6M8 10.8v.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          )}
          <div className="min-w-0">
            <h2 className={`font-display text-[15px] font-bold tracking-tight ${warn ? 'text-amber-300' : ''}`}>{collection.title}</h2>
            {collection.description && (
              <p className="mt-0.5 text-[12px] text-ink-3">{collection.description}</p>
            )}
          </div>
          {more && <ShowAll onPress={() => onShowAll(collection)} />}
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

function ShowAll({ onPress }: { onPress: () => void }): JSX.Element {
  const { props, focused } = useFocus({ onEnterPress: onPress })
  return (
    <button
      {...props}
      onClick={onPress}
      className={`focusable ml-auto shrink-0 rounded-full border px-3 py-1 text-[11.5px] font-semibold transition ${
        focused ? 'border-velocity bg-xbox/20 text-white' : 'border-white/12 text-ink-2 hover:text-white'
      }`}
    >
      {t.library.showAll} →
    </button>
  )
}

function BackButton({ onPress }: { onPress: () => void }): JSX.Element {
  const { props, focused } = useFocus({ focusKey: 'LIBRARY_DETAIL_BACK', onEnterPress: onPress })
  useEffect(() => {
    setFocus('LIBRARY_DETAIL_BACK')
  }, [])
  return (
    <button
      {...props}
      onClick={onPress}
      className={`focusable flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-semibold transition ${
        focused ? 'border-velocity bg-xbox/[0.13] text-white' : 'border-white/10 bg-white/[0.05] text-ink-2 hover:text-white'
      }`}
    >
      <span className="grid h-[15px] w-[15px] place-items-center rounded bg-black/45 font-mono text-[9px]">B</span>
      {t.nav.back}
    </button>
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

function Search({
  value,
  onChange,
  onOpen,
}: {
  value: string
  onChange: (v: string) => void
  // A pad has no keys. Pressing A here brings up ones it can reach.
  onOpen: () => void
}): JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const { props, focused } = useFocus({ focusKey: 'LIBRARY_SEARCH_BOX', onEnterPress: onOpen })

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
    <div
      {...props}
      onClick={onOpen}
      className={`focusable flex items-center gap-2 rounded-full border px-4 py-2 transition ${
        focused ? 'border-velocity bg-xbox/[0.13]' : 'border-white/10 bg-white/[0.05]'
      }`}
    >
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
