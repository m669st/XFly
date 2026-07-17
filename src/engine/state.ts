import { ipcRenderer } from 'electron'
import { IPC, type EngineEvent } from '../shared/ipc'
import { DEFAULT_SETTINGS } from '../shared/constants'


export const engine = {
  settings: { ...DEFAULT_SETTINGS } as Record<string, any>,
  pc: null as RTCPeerConnection | null,
  video: null as HTMLVideoElement | null,

  gsToken: '',

  regions: [] as OfferedRegion[],

  launcherVisible: true,
}

export interface OfferedRegion {
  name: string
  baseUri: string
  isDefault: boolean

  fallbackPriority?: number
}

export function emit(event: EngineEvent): void {
  try {
    ipcRenderer.send(IPC.engineEvent, event)
  } catch {
    /* not in electron (dev) */
  }
}

export function log(level: 'info' | 'warn' | 'error', msg: string): void {
  emit({ type: 'log', level, msg })
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : 'log'](`[XFly] ${msg}`)
}


export function diag(tag: string, msg: string): void {
  emit({ type: 'log', level: 'info', msg: `${tag}: ${msg}` })
  // eslint-disable-next-line no-console
  console.log(`[XFly:${tag}] ${msg}`)
}
