import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useFocus, setFocus } from '../lib/focus'

/**
 * A keyboard for people who do not have one.
 *
 * The library search has always been there and has always needed a keyboard, which
 * on a couch or a handheld means it may as well not exist. The keys are laid out the
 * way a keyboard is, so the pad walks across them the way a finger would.
 *
 * The glyphs are the labels on purpose: nothing here needs translating, and a row of
 * letters reads the same in every language we ship.
 */
const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm']

// The navigation layer only maps A, B and the d-pad, so these are read here: they
// are shortcuts for this keyboard and mean nothing anywhere else.
const BTN_X = 2 // X / Square — backspace
const BTN_Y = 3 // Y / Triangle — shift
// Options on a DualSense, Menu on an Xbox pad, and the same button on the Legion
// and the handhelds. Standard mapping puts all of them at 9.
const BTN_OPTIONS = 9

export function Osc({
  value,
  onChange,
  onClose,
}: {
  value: string
  onChange: (v: string) => void
  onClose: () => void
}): JSX.Element {
  const [shift, setShift] = useState(false)

  useEffect(() => {
    setFocus('OSC_q')
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // The OSC is for the pad, but if a real keyboard is also plugged in its keys
      // must do the obvious thing here rather than fall through to the library
      // behind — which was turning Backspace into "go home" and leaving Enter dead.
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        onClose()
      } else if (e.key === 'Enter') {
        // The pad's A button arrives here too — the gamepad layer dispatches it as a
        // synthetic Enter (keyCode 0). That one must reach the spatial-navigation layer
        // so it presses the *focused* key (type a letter, backspace, ✓). Only a real
        // keyboard's Enter (a genuine keyCode) means "done" and closes. Swallowing the
        // synthetic one here was closing the keyboard before any letter could be typed.
        if (!e.keyCode) return
        e.stopPropagation()
        e.preventDefault()
        latest.current.onClose()
      } else if (e.key === 'Backspace') {
        e.stopPropagation()
        e.preventDefault()
        latest.current.onChange(latest.current.value.slice(0, -1))
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.stopPropagation()
        latest.current.onChange(latest.current.value + e.key)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // Backspace, shift and done on the pad. Walking to a key to delete one letter is
  // the kind of thing that makes an on-screen keyboard miserable.
  const latest = useRef({ value, onChange, onClose })
  latest.current = { value, onChange, onClose }

  useEffect(() => {
    let raf = 0
    let prevX = false
    let prevY = false
    let prevOptions = false

    const poll = (): void => {
      raf = requestAnimationFrame(poll)
      const pad = Array.from(navigator.getGamepads?.() ?? []).find((p) => p && p.connected)
      if (!pad) return

      const x = !!pad.buttons[BTN_X]?.pressed
      const y = !!pad.buttons[BTN_Y]?.pressed
      const options = !!pad.buttons[BTN_OPTIONS]?.pressed

      if (x && !prevX) latest.current.onChange(latest.current.value.slice(0, -1))
      if (y && !prevY) setShift((s) => !s)
      if (options && !prevOptions) latest.current.onClose()

      prevX = x
      prevY = y
      prevOptions = options
    }

    raf = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 pb-14"
    >
      <div className="glass space-y-2 rounded-2xl p-4">
        <div className="mb-3 min-h-[26px] text-center font-mono text-[15px] tracking-wide text-white">
          {value || <span className="text-white/25">…</span>}
        </div>

        {ROWS.map((row) => (
          <div key={row} className="flex justify-center gap-1.5">
            {[...row].map((ch) => {
              const out = shift ? ch.toUpperCase() : ch
              return (
                <Key key={ch} id={`OSC_${ch}`} onPress={() => onChange(value + out)}>
                  {out}
                </Key>
              )
            })}
          </div>
        ))}

        <div className="flex justify-center gap-1.5 pt-1">
          <Key id="OSC_shift" width="w-14" accent={shift} onPress={() => setShift((s) => !s)}>
            ⇧
          </Key>
          <Key id="OSC_space" width="w-32" onPress={() => onChange(value + ' ')}>
            ␣
          </Key>
          <Key id="OSC_back" width="w-14" onPress={() => onChange(value.slice(0, -1))}>
            ⌫
          </Key>
          <Key id="OSC_clear" width="w-14" onPress={() => onChange('')}>
            ✕
          </Key>
          <Key id="OSC_done" width="w-14" accent onPress={onClose}>
            ✓
          </Key>
        </div>

        <div className="flex justify-center gap-4 pt-2 text-[10px] text-white/35">
          <Hint btn="X">⌫</Hint>
          <Hint btn="Y">⇧</Hint>
          <Hint btn="☰">✓</Hint>
        </div>
      </div>
    </motion.div>
  )
}

function Hint({ btn, children }: { btn: string; children: React.ReactNode }): JSX.Element {
  return (
    <span className="flex items-center gap-1.5">
      <span className="grid h-[15px] w-[15px] place-items-center rounded bg-black/45 font-mono text-[9px] text-white/70">
        {btn}
      </span>
      {children}
    </span>
  )
}

function Key({
  id,
  onPress,
  children,
  width = 'w-9',
  accent,
}: {
  id: string
  onPress: () => void
  children: React.ReactNode
  width?: string
  accent?: boolean
}): JSX.Element {
  const { props, focused } = useFocus({ focusKey: id, onEnterPress: onPress })
  return (
    <button
      {...props}
      onClick={onPress}
      className={`focusable grid h-9 ${width} place-items-center rounded-lg border text-[13px] transition ${
        focused
          ? 'border-velocity bg-xbox/25 text-white'
          : accent
            ? 'border-transparent bg-accent/80 text-white'
            : 'border-white/10 bg-white/[0.06] text-white/80'
      }`}
    >
      {children}
    </button>
  )
}
