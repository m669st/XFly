import type { GameTile } from '../store'
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
      <div className="absolute inset-x-0 bottom-0 p-2.5">
        <div className="line-clamp-2 text-[11px] font-semibold leading-tight text-white">{tile.title}</div>
      </div>
    </button>
  )
}
