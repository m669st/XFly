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

export function setupXboxSession(userAgent: string): Session {
  const ses = session.fromPartition(XBOX_PARTITION)
  setXboxUserAgent(userAgent)

  if (!bound) {
    bound = true
    ses.webRequest.onBeforeSendHeaders(LOGIN_URL_FILTER, (details, callback) => {
      const region = settings.get('bypassRegion') as BypassRegion
      const ip = BYPASS_SERVER_IPS[region]
      const headers = details.requestHeaders
      if (ip && /\/v2\/login\/user$|xgpuweb/.test(details.url)) {
        headers['X-Forwarded-For'] = ip
      }
      headers['User-Agent'] = currentUserAgent
      callback({ requestHeaders: headers })
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
