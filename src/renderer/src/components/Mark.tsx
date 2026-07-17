export function Mark({ size = 40, mono = false }: { size?: number; mono?: boolean }): JSX.Element {
  const id = `xfly-wing-${size}-${mono ? 'm' : 'c'}`
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      {!mono && (
        <defs>
          <linearGradient id={id} x1="12" y1="88" x2="89" y2="11" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#0C5E0C" />
            <stop offset="0.55" stopColor="#16A116" />
            <stop offset="1" stopColor="#9BF00B" />
          </linearGradient>
        </defs>
      )}
      <polygon points="21.05,11.15 47.88,37.98 37.98,47.88 11.15,21.05" fill={mono ? 'currentColor' : '#107C10'} opacity={mono ? 0.8 : 1} />
      <polygon points="62.02,52.12 88.85,78.95 78.95,88.85 52.12,62.02" fill={mono ? 'currentColor' : '#107C10'} opacity={mono ? 0.8 : 1} />
      <polygon points="11.84,76.84 90.66,5.80 94.20,9.34 23.16,88.16" fill={mono ? 'currentColor' : `url(#${id})`} />
    </svg>
  )
}

export function Lockup({ size = 28 }: { size?: number }): JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <Mark size={size} />
      <span className="font-display font-bold tracking-tight" style={{ fontSize: size * 0.86 }}>
        X<span className="text-xbox-lift">Fly</span>
      </span>
    </div>
  )
}
