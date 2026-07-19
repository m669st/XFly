import { net } from 'electron'
import { getTokens } from './tokens'
import { diagWrite } from './diag'

export type ApiSpec =
  | { kind: 'cloudTitles' }
  | { kind: 'recentlyPlayed' }
  | { kind: 'products'; productIds: string[] }
  | { kind: 'collection'; id: string }
  | { kind: 'profile' }
  /**
   * The account photo, without an account.
   *
   * peoplehub-public needs no token at all — measured: 200, with just
   * Accept-Language and the contract version. It only understands the gt(...)
   * form; xuid(...) is rejected with "Invalid owner name in URI". So this is
   * reachable the moment the gamertag is known, which is the token exchange,
   * and it does not care whether the authorised profile call ever worked.
   */
  | { kind: 'peoplePublic'; gamertag: string }
  | { kind: 'raw'; url: string; method?: string; auth?: 'xbl3' | 'gssv' | 'none'; body?: unknown; headers?: Record<string, string> }

function gssvHost(region?: string): string {
  return `https://${region || 'weu'}.core.gssv-play-prod.xboxlive.com`
}

let cvSeq = 0
function newMsCv(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let base = ''
  for (let i = 0; i < 22; i++) base += chars[Math.floor(Math.random() * chars.length)]
  return `${base}.${++cvSeq}`
}

export async function apiRequest(spec: ApiSpec): Promise<unknown> {
  const t = getTokens()
  const market = t.market || 'US'
  const language = t.language || 'en-US'

  let url = ''
  let method = 'GET'
  let auth: 'xbl3' | 'gssv' | 'none' = 'none'
  let body: unknown
  const headers: Record<string, string> = {}

  switch (spec.kind) {
    case 'cloudTitles':
      if (!t.region || !t.gsToken) return { ok: false, status: 0, data: null }
      url = `${gssvHost(t.region)}/v2/titles`
      auth = 'gssv'
      break
    case 'recentlyPlayed':
      if (!t.region || !t.gsToken) return { ok: false, status: 0, data: null }
      url = `${gssvHost(t.region)}/v2/titles/mru?mr=30`
      auth = 'gssv'
      break
    case 'products':
      url = `https://catalog.gamepass.com/v3/products?market=${market}&language=${language}&hydration=RemoteHighSapphire0`
      method = 'POST'
      auth = 'none'
      body = { Products: spec.productIds }
      break
    case 'collection':
      url =
        `https://catalog.gamepass.com/sigls/v3?id=${spec.id}&market=${market}&language=${language}` +
        `&subscriptionContext=none&platformContext=${encodeURIComponent('Cloud:XGPUWEB')}`
      auth = 'none'
      break
    case 'profile':
      url = 'https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag,GameDisplayName,GameDisplayPicRaw,Gamerscore'
      auth = 'xbl3'
      headers['x-xbl-contract-version'] = '3'
      break
    case 'peoplePublic':
      url = `https://peoplehub-public.xboxlive.com/people/gt(${encodeURIComponent(spec.gamertag)})`
      auth = 'none'
      headers['x-xbl-contract-version'] = '3'
      headers['Accept-Language'] = language
      break
    case 'raw':
      url = spec.url
      method = spec.method || 'GET'
      auth = spec.auth || 'none'
      body = spec.body
      Object.assign(headers, spec.headers || {})
      break
  }

  if (auth === 'gssv' && t.gsToken) headers['Authorization'] = `Bearer ${t.gsToken}`
  if (auth === 'xbl3' && t.xbl3) headers['Authorization'] = t.xbl3
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  headers['Accept'] = 'application/json'

  if (url.includes('catalog.gamepass.com')) {
    headers['calling-app-name'] = 'Xbox Cloud Gaming Web'
    headers['calling-app-version'] = '29.19.17'
    headers['ms-cv'] = newMsCv()
    headers['Referer'] = 'https://www.xbox.com/'
  }

  const fire = (u: string): Promise<Response> =>
    net.fetch(u, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

  // A body can only be read once, so read it here and let the emptiness check and the
  // final parse share the same text.
  const fireRead = async (u: string): Promise<{ r: Response; txt: string }> => {
    const r = await fire(u)
    return { r, txt: await r.text() }
  }

  let { r: res, txt: text } = await fireRead(url)

  // The catalog fails a library three ways, and all of them look the same to the user:
  // a screen that never loads. An unfamiliar market or language is rejected outright
  // (400/404); a busy one times out (5xx); and — the one that hid for a while — some
  // markets that DO exist (Taiwan, Hong Kong, Turkey) answer 200 with an empty
  // catalogue. So: a server error gets one retry, and anything still unanswered — a
  // rejection, a timeout, or an empty 200 — is tried once more as the US store in
  // English. A library in the wrong language beats no library, and US always answers.
  if (url.includes('catalog.gamepass.com')) {
    if (res.status >= 500) {
      await new Promise((r) => setTimeout(r, 900))
      ;({ r: res, txt: text } = await fireRead(url))
      diagWrite('api', `${spec.kind} retried after 5xx -> ${res.status}`)
    }
    const emptyCatalog = (t2: string): boolean => {
      try {
        const j = JSON.parse(t2)
        if (Array.isArray(j)) return j.filter((x) => x && x.id).length === 0
        const p = j?.Products || j?.products
        if (p) return (Array.isArray(p) ? p.length : Object.keys(p).length) === 0
      } catch {
        /* unparseable — not our call to force a fallback on */
      }
      return false
    }
    const rejected = res.status === 400 || res.status === 404 || res.status >= 500 || (res.ok && emptyCatalog(text))
    if (rejected && (market !== 'US' || language !== 'en-US')) {
      const us = url
        .replace(`market=${market}`, 'market=US')
        .replace(`language=${language}`, 'language=en-US')
      ;({ r: res, txt: text } = await fireRead(us))
      diagWrite('api', `${spec.kind} market=${market} empty/failed — US fallback -> ${res.status}`)
    }
  }

  if (!res.ok) {
    const had =
      auth === 'none' ? 'n/a' : auth === 'xbl3' ? (t.xbl3 ? 'sent' : 'MISSING') : t.gsToken ? 'sent' : 'MISSING'
    diagWrite('api', `${spec.kind} -> ${res.status} ${res.statusText} (auth=${auth}, token=${had})`)
  }

  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) }
  } catch {
    return { ok: res.ok, status: res.status, data: text }
  }
}
