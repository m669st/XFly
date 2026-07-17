import { addPatch } from './patcher'

function methodAt(src: string, re: RegExp): { start: number; end: number; params: string[] } | null {
  const m = re.exec(src)
  if (!m) return null
  let depth = 0
  let i = src.indexOf('{', m.index)
  const start = i
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return { start, end: i + 1, params: m.slice(1) }
  }
  return null
}

addPatch({
  name: 'localCoOp',
  anchor: 'this.gamepadMappingsToSend=[]',

  apply(src) {
    const changed = methodAt(src, /onGamepadChanged\((\w+),(\w+),(\w+)\)\{/)
    if (!changed) return null
    const index = changed.params[1]

    let body = src.slice(changed.start, changed.end)
    let hits = 0
    const swap = (re: RegExp, to: string): void => {
      body = body.replace(re, (...a) => {
        hits++
        return typeof to === 'string' ? to.replace('$1', a[1] ?? '') : to
      })
    }

    swap(/this\.gamepadStates\.get\(0\)/g, `this.gamepadStates.get(${index})`)
    swap(/GamepadIndex:0/g, `GamepadIndex:${index}`)
    swap(/this\.inputSink\.onGamepadChanged\(0,/g, `this.inputSink.onGamepadChanged(${index},`)
    swap(/this\.gamepadStates\.set\(0,/g, `this.gamepadStates.set(${index},`)
    swap(/this\.gamepadStates\.delete\(0\)/g, `this.gamepadStates.delete(${index})`)
    swap(/0===(\w+)\.GamepadIndex/g, `${index}===$1.GamepadIndex`)

    if (hits !== 9) return null

    let out = src.slice(0, changed.start) + body + src.slice(changed.end)

    const before = out
    out = out.replace(
      /const (\w+)=(\w+)\+(\w+)\.GamepadIndex,(\w+)=0,/,
      (_m, key, source, pad, idx) => `const ${key}=${source}+${pad}.GamepadIndex,${idx}=${pad}.GamepadIndex,`,
    )
    if (out === before) return null

    return out
  },
})
