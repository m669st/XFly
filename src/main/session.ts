import { session, type Session } from 'electron'
import { BYPASS_SERVER_IPS, XBOX_PARTITION, type BypassRegion } from '@shared/constants'
import { settings } from './settings'
import { diagWrite } from './diag'

const LOGIN_URL_FILTER = {
  urls: [
    '*://*.gssv-play-prod.xboxlive.com/v2/login/user',
    '*://*.gssv-play-prodxhome.xboxlive.com/v2/login/user',
    '*://xgpuweb.gssv-play-prod.xboxlive.com/*',
  ],
}

let bound = false

let currentUserAgent = ''

let onRegionBlocked: (() => void) | null = null
export function setOnRegionBlocked(cb: () => void): void {
  onRegionBlocked = cb
}

/**
 * Whether to disguise the login's origin.
 *
 * We never guess the country — the OS locale is the display language, not where the
 * user is (a Turkish player on an English Windows reads as "US"), and getting that
 * wrong either strands people who need the bypass or forces it on people who don't. A
 * forced bypass is its own bug: the console is provisioned as the spoofed country and
 * games ship that country's languages (a German player got Cyberpunk in English and
 * Japanese only).
 *
 * So the service itself decides. Sign in as yourself; if login is refused for region
 * (403), turn the bypass on and reload — once. That answer is remembered, so it
 * happens at most once per machine. The user can still force it off entirely.
 */
function bypassOn(): boolean {
  const region = settings.get('bypassRegion') as BypassRegion
  return region !== 'off' && !!settings.get('_bypassActive' as never)
}

export function setupXboxSession(userAgent: string): Session {
  const ses = session.fromPartition(XBOX_PARTITION)
  setXboxUserAgent(userAgent)

  if (!bound) {
    bound = true

    ses.webRequest.onBeforeSendHeaders(LOGIN_URL_FILTER, (details, callback) => {
      const region = settings.get('bypassRegion') as BypassRegion
      const ip = BYPASS_SERVER_IPS[region]
      const headers = details.requestHeaders
      if (bypassOn() && ip && /\/v2\/login\/user$|xgpuweb/.test(details.url)) {
        headers['X-Forwarded-For'] = ip
      }
      headers['User-Agent'] = currentUserAgent
      callback({ requestHeaders: headers })
    })

    ses.webRequest.onCompleted(LOGIN_URL_FILTER, (details) => {
      if (!/\/v2\/login\/user$/.test(details.url)) return
      const region = settings.get('bypassRegion') as BypassRegion
      // 403 is the service saying "not in your region". Turn the disguise on and let
      // the caller reload — but only if it isn't already on, so a bypass that still
      // gets a 403 can't loop.
      if (details.statusCode === 403 && region !== 'off' && !settings.get('_bypassActive' as never)) {
        settings.set('_bypassActive' as never, true as never)
        diagWrite('auth', `login refused for region — turning on the ${region} bypass and reloading`)
        onRegionBlocked?.()
      }
    })
  }

  return ses
}

export function setXboxUserAgent(ua: string): void {
  if (currentUserAgent === ua) return
  currentUserAgent = ua
  session.fromPartition(XBOX_PARTITION).setUserAgent(ua)
  diagWrite('boot', `user agent: ${ua}`)
}

export function xboxUserAgent(): string {
  return currentUserAgent
}

export function getXboxSession(): Session {
  return session.fromPartition(XBOX_PARTITION)
}

export async function clearXboxSession(): Promise<void> {
  const ses = session.fromPartition(XBOX_PARTITION)
  await ses.clearStorageData()
  await ses.clearCache()
  diagWrite('auth', 'signed out: xbox session storage cleared')
}
