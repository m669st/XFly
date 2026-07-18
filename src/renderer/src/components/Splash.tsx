import { motion } from 'framer-motion'
import { Mark } from './Mark'

export function Splash({ status }: { status: string }): JSX.Element {
  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-void"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      // The backdrop holds black on the way out; only the mark and bar fade. What's
      // underneath is Home, opening on its own black — so the darkness is unbroken and
      // the light rises out of it rather than cutting in.
      exit={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(420px 300px at 50% 44%, rgba(16,124,16,0.16), transparent 70%)',
        }}
      />
      <motion.div
        className="relative flex flex-col items-center gap-7"
        exit={{ opacity: 0, scale: 0.97, y: -6 }}
        transition={{ duration: 0.8, ease: 'easeInOut' }}
      >
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
      </motion.div>
    </motion.div>
  )
}
