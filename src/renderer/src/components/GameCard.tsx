import { useStore, type GameTile } from '../store'
import { useFocus } from '../lib/focus'

export function GameCard({
  tile,
  wide,
  onSelect,
  onPress,
}: {
  tile: GameTile
  wide?: boolean
  onSelect?: (t: GameTile) => void
  onPress?: (t: GameTile) => void
}): JSX.Element {
  const { props } = useFocus({
    onEnterPress: () => onPress?.(tile),
    onFocus: () => onSelect?.(tile),
  })

  // The card is marked if this title — or any of its editions — takes a keyboard and
  // mouse. A living-room player scanning the shelf can see which games their desk
  // setup suits without opening each one.
  const mkbIds = useStore((s) => s.mkbIds)
  const hasMkb =
    mkbIds.has(tile.productId) || !!tile.editions?.some((e) => mkbIds.has(e.productId))

  return (
    <button
      {...props}
      onClick={() => {
        onSelect?.(tile)
        onPress?.(tile)
      }}
      onMouseEnter={() => onSelect?.(tile)}
      className={`focusable group relative w-full overflow-hidden rounded-xl bg-bg-2 text-left shadow-card ${
        wide ? 'aspect-[16/9]' : 'aspect-[3/4]'
      }`}
      title={tile.title}
    >
      {tile.art ? (
        <img
          src={wide && tile.hero ? tile.hero : tile.art}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full w-full place-items-center p-2 text-center text-xs text-ink-3">{tile.title}</div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
      {hasMkb && (
        <div
          className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-md bg-black/55 text-white/85 backdrop-blur-sm"
          title="Keyboard &amp; mouse"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="1" y="5" width="14" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
            <path
              d="M3.5 7.3h.01M6 7.3h.01M8.5 7.3h.01M11 7.3h.01M4.5 9.6h5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 p-2.5">
        <div className="line-clamp-2 text-[11px] font-semibold leading-tight text-white">{tile.title}</div>
      </div>
    </button>
  )
}
