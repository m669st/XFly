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

interface Tone {
  freq: number
  to?: number
  dur: number
  gain: number
  type?: OscillatorType
}

let space: ConvolverNode | null = null
function room(a: AudioContext): ConvolverNode {
  if (space) return space
  const len = Math.floor(a.sampleRate * 0.18)
  const buf = a.createBuffer(2, len, a.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6)
  }
  space = a.createConvolver()
  space.buffer = buf
  const wet = a.createGain()
  wet.gain.value = 0.14
  space.connect(wet).connect(a.destination)
  return space
}

function transient(a: AudioContext, t: number, gain: number): void {
  const len = Math.floor(a.sampleRate * 0.005)
  const buf = a.createBuffer(1, len, a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
  const src = a.createBufferSource()
  src.buffer = buf

  const hp = a.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 2200

  const amp = a.createGain()
  amp.gain.value = gain
  src.connect(hp).connect(amp)
  amp.connect(a.destination)
  amp.connect(room(a))
  src.start(t)
}

function play({ freq, to, dur, gain, type = 'sine' }: Tone): void {
  const a = audio()
  if (!a) return
  const t = a.currentTime
  const osc = a.createOscillator()
  const amp = a.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur)

  amp.gain.setValueAtTime(0.0001, t)
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.006)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  osc.connect(amp)
  amp.connect(a.destination)
  amp.connect(room(a))

  transient(a, t, gain * 0.45)

  osc.start(t)
  osc.stop(t + dur + 0.02)
}

export function sfxMove(): void {
  play({ freq: 880, to: 1180, dur: 0.045, gain: 0.035, type: 'triangle' })
}

export function sfxSelect(): void {
  play({ freq: 660, to: 990, dur: 0.09, gain: 0.06, type: 'triangle' })
}

export function sfxBack(): void {
  play({ freq: 520, to: 340, dur: 0.1, gain: 0.05, type: 'triangle' })
}

export function sfxLaunch(): void {
  play({ freq: 392, to: 784, dur: 0.34, gain: 0.055, type: 'triangle' })
  setTimeout(() => play({ freq: 587, to: 1175, dur: 0.3, gain: 0.04, type: 'sine' }), 70)
}
