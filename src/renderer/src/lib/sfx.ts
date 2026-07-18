let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a)
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]

// A warm, in-tune palette so successive cues feel musical rather than random — a low A
// major set. Console UI sits lower and rounder than a phone's bright chimes.
const MID = [329.63, 369.99, 440.0, 493.88, 554.37]

interface Bus {
  master: GainNode
  hall: ConvolverNode
}

let bus: Bus | null = null
function graph(a: AudioContext): Bus {
  if (bus) return bus
  // Everything lands on a master bus through a soft limiter — it glues the layered
  // voices and keeps the bass-heavy cues from clipping.
  const master = a.createGain()
  master.gain.value = 0.9
  const comp = a.createDynamicsCompressor()
  comp.threshold.value = -12
  comp.knee.value = 22
  comp.ratio.value = 3.2
  comp.attack.value = 0.003
  comp.release.value = 0.2
  master.connect(comp).connect(a.destination)

  // A short, tight room. Console UI cues are largely dry and tactile — the reverb is a
  // trace of space, not the phone-like wash the old set had. Bigger cues send more.
  const len = Math.floor(a.sampleRate * 1.4)
  const buf = a.createBuffer(2, len, a.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      const tt = i / len
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - tt, 3.4)
    }
  }
  const hall = a.createConvolver()
  hall.buffer = buf
  const wet = a.createGain()
  wet.gain.value = 0.5
  hall.connect(wet).connect(master)

  bus = { master, hall }
  return bus
}

interface Tone {
  freq: number
  type?: OscillatorType
  at?: number
  attack?: number
  dur: number
  gain: number
  detune?: number
  glideFrom?: number
  glide?: number
  cutoff?: number
  cutoffTo?: number
  q?: number
  send?: number
}

function tone(a: AudioContext, o: Tone): void {
  const g = graph(a)
  const t0 = a.currentTime + (o.at ?? 0)
  const osc = a.createOscillator()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(o.glideFrom ?? o.freq, t0)
  if (o.glideFrom) osc.frequency.exponentialRampToValueAtTime(o.freq, t0 + (o.glide ?? 0.1))
  if (o.detune) osc.detune.setValueAtTime(o.detune, t0)

  let node: AudioNode = osc
  if (o.cutoff) {
    const f = a.createBiquadFilter()
    f.type = 'lowpass'
    f.Q.value = o.q ?? 0.7
    f.frequency.setValueAtTime(o.cutoff, t0)
    if (o.cutoffTo) f.frequency.exponentialRampToValueAtTime(o.cutoffTo, t0 + o.dur * 0.7)
    osc.connect(f)
    node = f
  }

  const amp = a.createGain()
  const atk = o.attack ?? 0.008
  amp.gain.setValueAtTime(0.0001, t0)
  amp.gain.exponentialRampToValueAtTime(o.gain, t0 + atk)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
  node.connect(amp)
  amp.connect(g.master)
  if (o.send) {
    const s = a.createGain()
    s.gain.value = o.send
    amp.connect(s)
    s.connect(g.hall)
  }

  osc.start(t0)
  osc.stop(t0 + o.dur + 0.05)
}

// The console-button weight — a short sub-sine with a fast downward pitch drop, fully
// dry. This low-end body under a cue is what makes the set feel physical rather than
// glassy; it's the difference the user heard between a phone and a console.
function thump(a: AudioContext, o: { freq?: number; drop?: number; dur?: number; gain: number; at?: number }): void {
  const f = o.freq ?? 120
  const dur = o.dur ?? 0.12
  tone(a, {
    freq: f * (o.drop ?? 0.5),
    glideFrom: f,
    glide: dur * 0.6,
    type: 'sine',
    gain: o.gain,
    dur,
    at: o.at,
    attack: 0.002,
    send: 0,
  })
}

// A warm, rounded UI tick — a filtered tone whose lowpass closes as it decays, so it
// lands soft and tactile instead of ringing. Mostly dry.
function pip(
  a: AudioContext,
  o: { freq: number; gain: number; dur: number; at?: number; type?: OscillatorType; cutoff?: number; send?: number },
): void {
  const cutoff = o.cutoff ?? 1600
  tone(a, {
    freq: o.freq,
    type: o.type ?? 'sine',
    gain: o.gain,
    dur: o.dur,
    at: o.at,
    attack: 0.004,
    cutoff,
    cutoffTo: cutoff * 0.6,
    send: o.send ?? 0.08,
  })
}

// A warm, detuned pad — three voices a few cents apart through a lowpass, for chords
// and swells.
function pad(
  a: AudioContext,
  o: {
    freq: number
    gain: number
    dur: number
    at?: number
    attack?: number
    detune?: number
    cutoff?: number
    send?: number
  },
): void {
  const det = o.detune ?? 8
  const cutoff = o.cutoff ?? 1400
  for (const d of [-det, 0, det]) {
    tone(a, {
      freq: o.freq,
      type: 'sawtooth',
      detune: d,
      gain: o.gain / 2.4,
      dur: o.dur,
      at: o.at,
      attack: o.attack ?? 0.4,
      cutoff,
      cutoffTo: cutoff * 1.6,
      send: o.send ?? 0.4,
    })
  }
}

// A choir/strings-like swell — many detuned voices, each with its own gentle vibrato,
// under a lowpass that opens as it blooms. This is the warm, vocal wash the PS5 boot
// lands on; the vibrato is what keeps it alive rather than a flat pad.
function choir(
  a: AudioContext,
  o: {
    freq: number
    gain: number
    dur: number
    at?: number
    attack?: number
    release?: number
    cutoff?: number
    send?: number
  },
): void {
  const g = graph(a)
  const t0 = a.currentTime + (o.at ?? 0)
  const dur = o.dur
  const attack = o.attack ?? 0.7
  const release = o.release ?? 1.0
  const cutoff = o.cutoff ?? 1500

  const lp = a.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 0.6
  lp.frequency.setValueAtTime(cutoff * 0.6, t0)
  lp.frequency.linearRampToValueAtTime(cutoff, t0 + dur * 0.5)

  const amp = a.createGain()
  const sustainEnd = Math.max(t0 + attack + 0.02, t0 + dur - release)
  amp.gain.setValueAtTime(0.0001, t0)
  amp.gain.exponentialRampToValueAtTime(o.gain, t0 + attack)
  amp.gain.setValueAtTime(o.gain, sustainEnd)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

  lp.connect(amp)
  amp.connect(g.master)
  const s = a.createGain()
  s.gain.value = o.send ?? 0.6
  amp.connect(s)
  s.connect(g.hall)

  for (const dt of [-9, -4.5, 0, 4.5, 9]) {
    const osc = a.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = o.freq
    osc.detune.value = dt
    const vib = a.createOscillator()
    vib.frequency.value = 4.6 + Math.random()
    const vg = a.createGain()
    vg.gain.value = 5
    vib.connect(vg).connect(osc.detune)
    osc.connect(lp)
    osc.start(t0)
    osc.stop(t0 + dur + 0.06)
    vib.start(t0)
    vib.stop(t0 + dur + 0.06)
  }
}

// Filtered noise — air and swishes, with an optional sweep.
function air(
  a: AudioContext,
  o: {
    dur: number
    gain: number
    at?: number
    cutoff?: number
    cutoffTo?: number
    type?: BiquadFilterType
    q?: number
    send?: number
  },
): void {
  const g = graph(a)
  const t0 = a.currentTime + (o.at ?? 0)
  const len = Math.floor(a.sampleRate * o.dur)
  const buf = a.createBuffer(1, len, a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  const src = a.createBufferSource()
  src.buffer = buf
  const f = a.createBiquadFilter()
  f.type = o.type ?? 'bandpass'
  f.Q.value = o.q ?? 0.9
  f.frequency.setValueAtTime(o.cutoff ?? 4000, t0)
  if (o.cutoffTo) f.frequency.exponentialRampToValueAtTime(o.cutoffTo, t0 + o.dur * 0.9)
  const amp = a.createGain()
  amp.gain.setValueAtTime(0.0001, t0)
  amp.gain.exponentialRampToValueAtTime(o.gain, t0 + 0.006)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
  src.connect(f).connect(amp)
  amp.connect(g.master)
  if (o.send) {
    const s = a.createGain()
    s.gain.value = o.send
    amp.connect(s)
    s.connect(g.hall)
  }
  src.start(t0)
  src.stop(t0 + o.dur + 0.02)
}

// --- the cues -----------------------------------------------------------------
// Warm, low, dry and physical — a console's feedback, not a phone's chimes. Each cue
// carries a little sub weight and lands on a different in-tune note each time.

export function sfxMove(): void {
  const a = audio()
  if (!a) return
  const f = pick(MID) * (1 + rand(-0.004, 0.004))
  pip(a, { freq: f, gain: rand(0.03, 0.042), dur: rand(0.05, 0.075), type: 'triangle', cutoff: 2400, send: 0.06 })
  thump(a, { freq: 150, drop: 0.5, dur: 0.05, gain: 0.018 })
}

export function sfxSelect(): void {
  const a = audio()
  if (!a) return
  // The signature confirm — a warm tone over its own octave-down body and a deep sub,
  // largely dry. A solid "boop", not a bright ding.
  const root = pick([329.63, 392.0, 440.0])
  pip(a, { freq: root, gain: 0.055, dur: 0.17, type: 'triangle', cutoff: 2200, send: 0.12 })
  pip(a, { freq: root * 0.5, gain: 0.05, dur: 0.22, type: 'sine', cutoff: 1400, send: 0.1 })
  thump(a, { freq: 190, drop: 0.42, dur: 0.18, gain: 0.055 })
}

export function sfxBack(): void {
  const a = audio()
  if (!a) return
  const root = pick([277.18, 246.94])
  pip(a, { freq: root, gain: 0.05, dur: 0.14, type: 'triangle', cutoff: 1600, send: 0.1 })
  pip(a, { freq: root * 0.75, gain: 0.045, dur: 0.24, at: 0.05, type: 'sine', cutoff: 1200, send: 0.1 })
  thump(a, { freq: 140, drop: 0.45, dur: 0.16, gain: 0.05 })
}

export function sfxLaunch(): void {
  const a = audio()
  if (!a) return
  // A deep, powerful rise into the game — sub foundation, a warm chord swelling up, a
  // trace of airy shimmer on top. Grounded, not a bell arpeggio.
  tone(a, { freq: 110, glideFrom: 55, glide: 0.7, type: 'sine', gain: 0.075, dur: 1.4, attack: 0.05, send: 0.14 })
  pad(a, { freq: 110, gain: 0.05, dur: 1.6, at: 0.05, attack: 0.2, cutoff: 900, send: 0.32 })
  pad(a, { freq: 164.81, gain: 0.045, dur: 1.6, at: 0.1, attack: 0.25, cutoff: 1200, send: 0.34 })
  pad(a, { freq: 220, gain: 0.04, dur: 1.5, at: 0.15, attack: 0.3, cutoff: 1600, send: 0.36 })
  air(a, { dur: 1.0, gain: 0.013, cutoff: 2000, cutoffTo: 6000, type: 'bandpass', q: 0.7, at: 0.3, send: 0.4 })
  thump(a, { freq: 200, drop: 0.3, dur: 0.4, gain: 0.06, at: 0.02 })
}

export function sfxStartup(): void {
  const a = audio()
  if (!a) return
  // PS5-style boot, in the order the console does it: a deep bass rise you can feel, a
  // long dreamy note, an airy whoosh sweeping up, a rising four-note synth ditty in
  // perfect fourths ("landing from space"), then a wide choir chord blooming in as the
  // logo would — twinkles lifting off the top. The boot you hear once.

  // deep bass foundation — two notes rising low enough to feel in the chest
  tone(a, { freq: 55, glideFrom: 36.7, glide: 1.7, type: 'sine', gain: 0.09, dur: 3.6, attack: 0.5, send: 0.14 })
  tone(a, {
    freq: 82.41,
    glideFrom: 55,
    glide: 1.9,
    type: 'triangle',
    gain: 0.045,
    dur: 3.6,
    attack: 0.8,
    cutoff: 700,
    cutoffTo: 1500,
    send: 0.2,
  })

  // the long dreamy opening note
  choir(a, { freq: 220, gain: 0.03, dur: 3.4, at: 0.1, attack: 0.95, release: 1.4, cutoff: 1400, send: 0.55 })

  // an airy whoosh sweeping up into the bloom
  air(a, { dur: 1.1, gain: 0.02, cutoff: 300, cutoffTo: 6500, type: 'bandpass', q: 0.6, at: 0.75, send: 0.5 })

  // the four-note synth ditty — perfect-fourth flavoured, rising
  const ditty = [440, 587.33, 659.25, 880]
  ditty.forEach((f, i) =>
    tone(a, {
      freq: f,
      type: 'triangle',
      gain: 0.028,
      dur: 1.1,
      at: 1.0 + i * 0.26,
      attack: 0.02,
      cutoff: 3000,
      cutoffTo: 1500,
      send: 0.5,
    }),
  )

  // the choir chord blooming as the logo fades in — wide, warm, vocal (A major, open)
  const chord = [220, 329.63, 440]
  chord.forEach((f, i) =>
    choir(a, { freq: f, gain: 0.026, dur: 2.6, at: 1.45 + i * 0.12, attack: 0.7, release: 1.2, cutoff: 1700, send: 0.6 }),
  )

  // distant twinkles lifting off the top
  const tw = [1318.51, 1760, 2217.46]
  tw.forEach((f, i) => tone(a, { freq: f, type: 'sine', gain: 0.01, dur: 1.4, at: 1.9 + i * 0.16, attack: 0.02, send: 0.55 }))
}

export function sfxShutdown(): void {
  const a = audio()
  if (!a) return
  // Powering down, the boot in reverse: the choir settles and resolves down a perfect
  // fourth, an airy whoosh falls, and the sub descends into the dark with one last
  // far-off twinkle.
  const chordA = [440, 329.63, 220]
  chordA.forEach((f, i) =>
    choir(a, { freq: f, gain: 0.03, dur: 1.9, at: i * 0.05, attack: 0.07, release: 1.2, cutoff: 1700, send: 0.55 }),
  )
  const chordB = [329.63, 246.94, 164.81]
  chordB.forEach((f, i) =>
    choir(a, { freq: f, gain: 0.03, dur: 1.6, at: 0.7 + i * 0.05, attack: 0.25, release: 1.0, cutoff: 1400, send: 0.6 }),
  )

  // a descending whoosh
  air(a, { dur: 1.2, gain: 0.017, cutoff: 5000, cutoffTo: 400, type: 'bandpass', q: 0.6, at: 0.3, send: 0.5 })

  // the sub descending into the dark
  tone(a, { freq: 55, glideFrom: 110, glide: 1.3, type: 'sine', gain: 0.08, dur: 2.1, attack: 0.04, send: 0.18 })
  tone(a, {
    freq: 36.7,
    glideFrom: 82.41,
    glide: 1.5,
    type: 'triangle',
    gain: 0.045,
    dur: 2.2,
    attack: 0.08,
    cutoff: 800,
    send: 0.14,
  })

  // one last faint twinkle
  tone(a, { freq: 1318.51, type: 'sine', gain: 0.009, dur: 1.2, at: 0.9, attack: 0.02, send: 0.55 })
}

export function sfxOpen(): void {
  const a = audio()
  if (!a) return
  // A warm low swish with a soft tick — stepping into Library or Settings.
  air(a, { dur: 0.35, gain: 0.017, cutoff: 400, cutoffTo: 2200, type: 'bandpass', q: 0.9, send: 0.2 })
  pip(a, { freq: 392, gain: 0.045, dur: 0.14, type: 'triangle', cutoff: 1800, send: 0.12 })
  thump(a, { freq: 150, drop: 0.45, dur: 0.14, gain: 0.04 })
}

// The startup chime is a first-launch moment only. Home remounts and replays its
// opening after a game, but the chime does not — it plays exactly once per run.
let bootChimed = false
export function sfxStartupOnce(): void {
  if (bootChimed) return
  bootChimed = true
  sfxStartup()
}
