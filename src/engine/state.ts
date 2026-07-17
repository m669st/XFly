import { ipcRenderer } from 'electron'
import { IPC, type EngineEvent } from '../shared/ipc'
import { DEFAULT_SETTINGS } from '../shared/constants'


export const engine = {
  settings: { ...DEFAULT_SETTINGS } as Record<string, any>,
  pc: null as RTCPeerConnection | null,
  video: null as HTMLVideoElement | null,

  gsToken: '',

  /**
   * The live session's own URL, from the play response.
   *
   * Leaving the page does not end a cloud session — the console stays allocated and
   * keeps streaming until it times out. Quitting for real means DELETEing this.
   */
  sessionUrl: '',

  /**
   * The Authorization header the page itself uses on this session.
   *
   * Not the same thing as gsToken: every login/user call mints a new one and
   * overwrites ours, so by the time the user quits, the token we hold is not the
   * token that opened the session — and the DELETE comes back 401. This is copied
   * from the page's own session traffic, which by definition still works.
   */
  sessionAuth: '',

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
