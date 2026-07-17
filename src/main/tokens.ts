import { ipcMain, session } from 'electron'
import { IPC } from '@shared/ipc'
import { XBOX_PARTITION } from '@shared/constants'
import { diagWrite } from './diag'
import type { XFlyWindow } from './window'

export interface Tokens {
  xbl3?: string
  gsToken?: string
  region?: string
  market?: string
  language?: string
  xuid?: string
  profile?: {
    gamertag?: string
    displayName?: string
    avatarUrl?: string
    gamerscore?: string
  }
}

const tokens: Tokens = {}

const PROFILE_RELYING_PARTY = 'http://xboxlive.com'
const XBOX_TOKEN_COOKIE_PREFIX = 'XBXXtk'

function decodeMaybe(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export type AccountCookieState = 'none' | 'stale' | 'ok'

export async function hydrateFromXboxCookies(): Promise<AccountCookieState> {
  try {
    const all = await session.fromPartition(XBOX_PARTITION).cookies.get({ domain: '.xbox.com' })
    const wanted = XBOX_TOKEN_COOKIE_PREFIX + PROFILE_RELYING_PARTY
    const anyXboxToken = all.some((c) => c.name.startsWith(XBOX_TOKEN_COOKIE_PREFIX))
    const cookie = all.find((c) => decodeMaybe(c.name) === wanted)
    if (!cookie) {
      const found = all.filter((c) => c.name.startsWith(XBOX_TOKEN_COOKIE_PREFIX)).map((c) => decodeMaybe(c.name))
      diagWrite('tokens', `no cookie for ${wanted}; xbox tokens present: [${found.join(', ')}]`)
      return anyXboxToken ? 'stale' : 'none'
    }

    const data = JSON.parse(decodeMaybe(cookie.value))
    const td = data?.tokenData
    if (!td?.token || !td?.userHash) {
      diagWrite('tokens', `cookie ${wanted} has no token/userHash (fields: ${Object.keys(td ?? {}).join(',')})`)
      return 'stale'
    }
    if (td.expiration && new Date(td.expiration).getTime() < Date.now()) {
      diagWrite('tokens', `cookie ${wanted} expired at ${td.expiration}`)
      return 'stale'
    }

    tokens.xbl3 = `XBL3.0 x=${td.userHash};${td.token}`
    if (td.userXuid) tokens.xuid = String(td.userXuid)
    if (td.userGamertag) tokens.profile = { ...tokens.profile, gamertag: String(td.userGamertag) }
    diagWrite(
      'tokens',
      `xbl3 from cookie (audience ${PROFILE_RELYING_PARTY})` +
        `${td.userGamertag ? `, gamertag ${td.userGamertag}` : ', no gamertag in it'}`,
    )
    return 'ok'
  } catch (e) {
    diagWrite('tokens', `xbox cookie read failed: ${e}`)
    return 'stale'
  }
}

export function getTokens(): Tokens {
  return tokens
}

export function clearTokens(): void {
  for (const key of Object.keys(tokens)) delete (tokens as Record<string, unknown>)[key]
  diagWrite('auth', 'tokens cleared')
}

export function ingestEngineEvent(event: any): void {
  if (!event || typeof event !== 'object') return
  if (event.type === 'tokens') {
    Object.assign(tokens, event.tokens ?? {})
  } else if (event.type === 'profile') {
    tokens.profile = { ...tokens.profile, ...event.profile }
  }
}

let authResolved = false
let probeTimer: ReturnType<typeof setTimeout> | null = null

export interface AuthState {
  signedIn: boolean
  profile?: unknown
  resolved: boolean
}

let lastAuth: AuthState = { signedIn: false, resolved: false }

export function currentAuthState(): AuthState {
  return lastAuth
}

export function pushAuthState(win: XFlyWindow): void {
  authResolved = true
  if (probeTimer) {
    clearTimeout(probeTimer)
    probeTimer = null
  }
  lastAuth = {
    signedIn: !!tokens.gsToken,
    profile: tokens.profile,
    resolved: true,
  }
  win.overlay.webContents.send(IPC.authState, lastAuth)
}

const AUTH_PROBE_MS = 12_000

export function startAuthProbe(win: XFlyWindow): void {
  if (authResolved || probeTimer) return
  probeTimer = setTimeout(() => {
    probeTimer = null
    if (!authResolved) {
      diagWrite('auth', `no session after ${AUTH_PROBE_MS}ms — treating as signed out`)
      pushAuthState(win)
    }
  }, AUTH_PROBE_MS)
}

export function registerTokenCapture(win: XFlyWindow): void {
  ipcMain.on('__tokens_updated', () => pushAuthState(win))
}
