import { diag, log } from './state'

type ModuleFn = (...args: unknown[]) => unknown
type ChunkPayload = [unknown, Record<string, ModuleFn>, unknown?]

export interface Patch {
  name: string
  anchor: string
  apply: (src: string) => string | null
}

const patches: Patch[] = []
let installed = false

export function addPatch(p: Patch): void {
  patches.push(p)
}

export function installPatcher(): void {
  if (installed || !patches.length) return
  installed = true

  const nativeBind = Function.prototype.bind
  Function.prototype.bind = function (this: ModuleFn, ...args: unknown[]) {
    const isChunkCall =
      this.name.length <= 2 &&
      args.length === 2 &&
      args[0] === null &&
      (args[1] === 0 || typeof args[1] === 'function')

    if (!isChunkCall) return nativeBind.apply(this, args as [unknown, ...unknown[]])

    if (typeof args[1] === 'function') {
      Function.prototype.bind = nativeBind
      diag('patcher', 'webpack hooked; Function.prototype.bind restored')
    }

    const org = this
    const wrapped = (a: unknown, payload: ChunkPayload): unknown => {
      try {
        patchChunk(payload)
      } catch (e) {
        log('warn', `patcher: ${e}`)
      }
      return org(a, payload)
    }
    return nativeBind.apply(wrapped, args as [unknown, ...unknown[]])
  } as typeof Function.prototype.bind
}

function rebuild(id: string, src: string): ModuleFn {
  const isExpression = /^\s*(\(|function\b|async\b)/.test(src)
  // eslint-disable-next-line no-new-func
  const built = isExpression
    ? new Function(`return (${src})`)()
    : new Function(`return {${src}}`)()[id]
  if (typeof built !== 'function') throw new Error(`rebuilt module ${id} is not a function`)
  return built as ModuleFn
}

const done = new Set<string>()

function patchChunk(payload: ChunkPayload): void {
  const modules = payload?.[1]
  if (!modules || typeof modules !== 'object') return

  for (const id of Object.keys(modules)) {
    const fn = modules[id]
    if (typeof fn !== 'function') continue

    let src: string | null = null
    for (const p of patches) {
      if (done.has(p.name)) continue
      src ??= fn.toString()
      if (!src.includes(p.anchor)) continue

      const out = p.apply(src)
      if (!out) {
        diag('patcher', `${p.name}: anchor found but the shape changed — NOT patched`)
        done.add(p.name)
        continue
      }
      src = out
      done.add(p.name)
      diag('patcher', `${p.name}: applied to module ${id}`)
    }

    if (src && src !== fn.toString()) {
      try {
        modules[id] = rebuild(id, src)
      } catch (e) {
        log('error', `patcher: rebuilding module ${id} failed, keeping the original: ${e}`)
      }
    }
  }
}
