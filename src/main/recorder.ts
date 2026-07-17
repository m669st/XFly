import { app, shell } from 'electron'
import { appendFileSync, writeFileSync } from 'fs'
import { join } from 'path'

let t0 = 0
let lines = 0
let pending: string[] = []
let timer: NodeJS.Timeout | null = null

export function recordPath(): string {
  return join(app.getPath('userData'), 'xfly-record.jsonl')
}

function flush(): void {
  timer = null
  if (!pending.length) return
  const batch = pending
  pending = []
  try {
    appendFileSync(recordPath(), batch.join(''))
  } catch {
    /* recording must never break the session */
  }
}

export function recordInit(): void {
  t0 = Date.now()
  lines = 0
  pending = []
  try {
    writeFileSync(recordPath(), '')
  } catch {
    return
  }
  record('meta', {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    platform: process.platform,
    startedAt: new Date().toISOString(),
  })
}

export function record(kind: string, d: unknown): void {
  try {
    pending.push(JSON.stringify({ t: Date.now() - t0, kind, d }) + '\n')
    lines++
    if (!timer) timer = setTimeout(flush, 1000)
  } catch {
    /* a value that will not serialize must not take the session down */
  }
}

export function recordStats(): { path: string; lines: number } {
  return { path: recordPath(), lines }
}

export function recordOpen(): void {
  flush()
  void shell.showItemInFolder(recordPath())
}

app.on('before-quit', flush)
