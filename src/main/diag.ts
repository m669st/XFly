import { app, shell } from 'electron'
import { appendFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { redactText } from './redact'

const ring: string[] = []
const RING_MAX = 5000

export function diagPath(): string {
  return join(app.getPath('userData'), 'xfly-debug.log')
}

export function diagInit(): void {
  try {
    writeFileSync(diagPath(), '')
  } catch {
    /* logging must never break the app */
  }
  diagWrite('boot', `XFly — electron ${process.versions.electron}, chrome ${process.versions.chrome}, ${process.platform}`)
  diagWrite('boot', `log file: ${diagPath()}`)
}

export function diagWrite(tag: string, msg: string): void {
  const line = `${new Date().toISOString().slice(11, 23)} ${tag} | ${redactText(msg)}`
  ring.push(line)
  if (ring.length > RING_MAX) ring.shift()
  try {
    appendFileSync(diagPath(), line + '\n')
  } catch {
    /* ignore */
  }
  try {
    process.stdout.write(line + '\n')
  } catch {
    /* no console attached (packaged build) */
  }
}

export function diagDump(): string {
  return ring.join('\n')
}

export function diagOpen(): void {
  void shell.openPath(diagPath())
}
