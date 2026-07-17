import { useEffect, useState } from 'react'
import { Mark } from './Mark'

export function Splash({ status }: { status: string }): JSX.Element {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 250)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      className={`fixed inset-0 z-50 grid place-items-center bg-void transition-opacity duration-500 ${
        show ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(420px 300px at 50% 44%, rgba(16,124,16,0.16), transparent 70%)',
        }}
      />
      <div className="relative flex flex-col items-center gap-7">
        <div className="xfly-breathe">
          <Mark size={104} />
        </div>
        <div className="font-display text-3xl font-bold tracking-tight">
          X<span className="text-xbox-lift">Fly</span>
        </div>
        <div className="flex flex-col items-center gap-4">
          <div className="h-[3px] w-44 overflow-hidden rounded-full bg-white/[0.08]">
            <div className="xfly-progress h-full w-1/3 rounded-full bg-velocity" />
          </div>
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/40">{status}</div>
        </div>
      </div>
    </div>
  )
}
