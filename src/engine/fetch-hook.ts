import { engine, emit, log, diag } from './state'
import { rec, redactText, headersToObject } from './record'
import { wantedAlias } from './datachannel'
import { OS_NAME, XBOX_PLAY_URL, pickStreamLocale } from '../shared/constants'

/** Where the page reports on the player. None of it is needed to stream a game. */
const BLOCKED_HOSTS = [
  'https://arc.msn.com',
  'https://browser.events.data.microsoft.com',
  'https://dc.services.visualstudio.com',
  'https://mscom.demdex.net',
]

export function patchFetch(): void {
  const native = window.fetch
  if ((native as any).__xfly) return

  const patched: typeof fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    const method = (init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase()

    // Reporting endpoints. Silencing the telemetry provider stops the page asking, but
    // these are called from elsewhere too, so the door is shut here as well. Answered
    // rather than rejected: a caller that throws on a failed beacon is a caller that
    // breaks the page over something nobody needed.
    for (const host of BLOCKED_HOSTS) {
      if (url.startsWith(host)) {
        return new Response('{}', { status: 200, statusText: 'OK' })
      }
    }

    // Every call the page makes against a live session carries a header that works.
    // Keep the last one: it is what lets us delete the session on the way out.
    if (/\/sessions\/cloud\/[0-9a-f-]{36}/i.test(url)) {
      try {
        const h = input instanceof Request ? new Headers(input.headers) : new Headers(init?.headers)
        const auth = h.get('Authorization')
        if (auth) engine.sessionAuth = auth
      } catch {
        /* nothing to learn from this one */
      }
    }

    if (/\/sessions\/cloud\/play$/.test(url) && method === 'POST') {
      try {
        const req = input instanceof Request ? input : new Request(input, init)
        // A request body can only be read once. The no-spoof retry below needs its own
        // untouched copy — reusing `req` (or `input`) after it has been sent throws
        // "Request object that has already been used", which is what was swallowing the
        // real error and leaving the launch spinning.
        const retryReq = req.clone()
        const body = await req.clone().json()
        {
          const osName = OS_NAME
          body.settings = body.settings || {}
          body.settings.osName = osName

          const locale = pickStreamLocale(navigator.languages?.length ? navigator.languages : [navigator.language])
          if (locale) {
            body.settings.locale = locale
            diag('session', `game language: ${locale} (this machine asked for ${(navigator.languages || [navigator.language]).join(', ')})`)
          } else {
            diag('session', `game language: left as "${body.settings.locale ?? '(unset)'}" — xCloud has none of ${(navigator.languages || [navigator.language]).join(', ')}`)
          }

          const headers = new Headers(req.headers)
          diag('session', `device info (from the SDK, untouched): ${headers.get('x-ms-device-info') ?? '(none — the SDK sent none)'}`)
          emit({ type: 'stream.state', state: 'loading' })
          emit({ type: 'session.play', titleId: body.titleId || '', sessionPath: '' })
          void probeWaitTimes(String(body.titleId || ''), native)
          const spoofed = await native(new Request(req, { headers, body: JSON.stringify(body) }))
          diag('session', `POST /sessions/cloud/play (osName=${osName}) -> ${spoofed.status}`)
          if (spoofed.ok) {
            // Where this session lives, so we can delete it later. Without it, quitting
            // only walks the page back and the console keeps running.
            try {
              const path = (await spoofed.clone().json())?.sessionPath
              if (path) {
                // sessionPath comes back without a leading slash ("v5/sessions/cloud/<id>").
                // Resolving that against the play URL nests it under the directory the
                // play call lives in — /v5/sessions/cloud/v5/sessions/cloud/<id> — which
                // 404s, leaving the console allocated. Anchor it to the origin instead.
                engine.sessionUrl = `${new URL(url).origin}/${String(path).replace(/^\/+/, '')}`
                emit({ type: 'session.play', titleId: body.titleId || '', sessionPath: path })
                diag('session', `session at ${String(path).replace(/[0-9A-F-]{36}/i, '<session>')}`)
              }
            } catch {
              /* no sessionPath in the body — quit falls back to leaving the page */
            }
            rec('http', {
              method,
              url: url.replace(/[0-9A-F-]{36}/i, '<session>'),
              status: spoofed.status,
              reqBody: redactText(JSON.stringify(body)),
              resBody: redactText(await spoofed.clone().text().catch(() => '')),
            })
            return spoofed
          }
          const why = await spoofed.clone().text().catch(() => '')
          let code = ''
          try {
            code = JSON.parse(why)?.code || ''
          } catch {
            /* body was not json */
          }

          // The account does not own this game. No amount of retrying changes that —
          // the device spoof was never the problem. Tell our launcher so it can turn
          // the user around at the loading screen instead of letting xCloud grind
          // through its own retries into an error page.
          if (code === 'NoEntitlement') {
            diag('session', `play denied: not entitled to ${body.titleId || 'title'}`)
            emit({ type: 'play.denied', reason: 'notEntitled' })
            // Get off the failed launch route. xCloud's router wedges on the error
            // page — measured: the very next launch reported "ROUTER DID NOT NAVIGATE"
            // and stayed on the game the account did not own. Returning to /play lets
            // the following pick start clean.
            setTimeout(() => location.assign(XBOX_PLAY_URL), 300)
            return spoofed
          }

          diag('session', `play rejected (${spoofed.status}) ${why.slice(0, 300)} — retrying WITHOUT device spoof`)
          const plain = await native(retryReq)
          diag('session', `POST /sessions/cloud/play (no spoof) -> ${plain.status}`)
          return plain
        }
      } catch (e) {
        log('warn', `play spoof failed: ${e}`)
      }
    }

    if (/\/sdp$/.test(url.split('?')[0]) && method === 'POST') {
      try {
        const req = input instanceof Request ? input : new Request(input, init)
        const raw = await req.clone().text()
        const capped = capOfferSdp(raw)
        if (capped) {
          return native(new Request(req, { body: capped }))
        }
      } catch (e) {
        log('warn', `sdp cap failed, sending the original: ${e}`)
      }
    }

    const isAuthCall = /(user|xsts)\.auth\.xboxlive\.com|\/v2\/login\/user$/.test(url)
    let resp: Response
    try {
      resp = await native(input as any, init)
      if (isAuthCall) diag('auth', `${method} ${url.replace(/^https?:\/\//, '').split('?')[0]} -> ${resp.status}`)
    } catch (e) {
      if (isAuthCall) diag('auth', `${method} ${url.replace(/^https?:\/\//, '').split('?')[0]} -> FAILED: ${e}`)
      throw e
    }

    if (/\/state(\?|$)/.test(url) && resp.ok) {
      try {
        const j = await resp.clone().json()
        if (j?.state) emit({ type: 'session.state', state: String(j.state) })
      } catch { /* */ }
    }

    const isSessionCall = /\/v\d\/sessions\/cloud|\/(state|connect|configuration|sdp|ice|keepalive)(\?|$)/.test(url)
    if (isSessionCall) {
      const path = url.replace(/^https?:\/\/[^/]+/, '')
      if (resp.ok) {
        diag('session', `${method} ${path} -> ${resp.status}`)
      } else {
        const why = await resp.clone().text().catch(() => '')
        diag('session', `${method} ${path} -> ${resp.status} ${resp.statusText} ${why.slice(0, 300)}`)
      }
      try {
        let reqBody = ''
        if (method !== 'GET' && method !== 'HEAD') {
          const r = input instanceof Request ? input.clone() : new Request(input as any, init)
          reqBody = await r.text().catch(() => '')
        }
        rec('http', {
          method,
          url: url.replace(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i, '<session>'),
          status: resp.status,
          reqHeaders: headersToObject(new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))),
          reqBody: reqBody ? redactText(reqBody) : undefined,
          resHeaders: headersToObject(resp.headers),
          resBody: redactText(await resp.clone().text().catch(() => '')),
        })
      } catch { /* recording must never break the session */ }
    }

    if (/\/configuration$/.test(url.split('?')[0]) && method === 'GET') {
      try {
        const text = await resp.clone().text()
        if (text) {
          const obj = JSON.parse(text)
          const overrides = JSON.parse(obj.clientStreamingConfigOverrides || '{}') || {}

          overrides.inputConfiguration = overrides.inputConfiguration || {}
          overrides.inputConfiguration.enableVibration = engine.settings.vibration !== false

          overrides.inputConfiguration.useUnreliableInput = false

          const wasPoll = overrides.inputConfiguration.pollGamepadsIntervalMs
          const wasWorker = overrides.inputConfiguration.useIntervalWorkerThreadForInput
          overrides.inputConfiguration.pollGamepadsIntervalMs = 4
          overrides.inputConfiguration.useIntervalWorkerThreadForInput = true
          diag(
            'lever',
            `input: poll ${wasPoll ?? '(unset, default 4)'} -> 4ms (250 Hz), ` +
              `worker thread ${wasWorker ?? '(unset)'} -> true`,
          )

          const alias = wantedAlias()
          if (alias) {
            overrides.videoConfiguration = overrides.videoConfiguration || {}
            overrides.videoConfiguration.userRequestedResolutionAlias = alias
            diag('lever', `configuration: userRequestedResolutionAlias = "${alias}"`)
          }

          rec('config.rewritten', overrides)
          diag('lever', `configuration sent: ${JSON.stringify(overrides.inputConfiguration)}`)

          obj.clientStreamingConfigOverrides = JSON.stringify(overrides)
          const body = JSON.stringify(obj)
          const clone = new Response(body, { status: resp.status, statusText: resp.statusText, headers: resp.headers })
          ;(clone as any).json = () => Promise.resolve(obj)
          ;(clone as any).text = () => Promise.resolve(body)
          emit({ type: 'stream.state', state: 'starting' })
          return clone
        }
      } catch (e) {
        log('warn', `configuration hook failed: ${e}`)
      }
    }

    if (/catalog\.gamepass\.com\/v3\/(products|alternateIdProducts)/.test(url) && resp.ok) {
      try {
        const j = await resp.clone().json()
        const products = j?.Products || j?.products
        const count = Array.isArray(products) ? products.length : products ? Object.keys(products).length : 0
        if (count) emit({ type: 'catalog' as any, products } as any)
      } catch { /* */ }
    }

    try {
      if (/\/v2\/login\/user$/.test(url) && method === 'POST' && resp.ok) {
        const text = await resp.clone().text()
        const j = JSON.parse(text)
        diag('auth', `login/user keys: [${Object.keys(j || {}).join(',')}]`)
        if (j?.gsToken) {
          const regions: any[] = j?.offeringSettings?.regions || []
          emit({ type: 'regions', regions: regions.map((r) => ({ name: r.name, isDefault: !!r.isDefault, baseUri: r.baseUri })) } as any)
          engine.gsToken = j.gsToken
          engine.regions = regions.map((r) => ({
            name: String(r.name), baseUri: String(r.baseUri),
            isDefault: !!r.isDefault, fallbackPriority: r.fallbackPriority,
          }))

          diag('region', `offered (allowRegionSelection=${!!j?.offeringSettings?.allowRegionSelection}): ${regions
            .map((r) => `${regionCode(r)}[${r.name}]${r.isDefault ? '*' : ''}p${r.fallbackPriority ?? '?'}`)
            .join(' ')}`)
          rec('regions', { allowRegionSelection: !!j?.offeringSettings?.allowRegionSelection, regions: engine.regions })

          const want = String(engine.settings.streamRegion ?? 'auto')
          let chosen = regions.find((r: any) => r.isDefault) || regions[0]
          if (want !== 'auto') {
            const pick = regions.find((r: any) => regionCode(r) === want)
            if (pick && pick !== chosen) {
              for (const r of regions) r.isDefault = r === pick
              chosen = pick
              diag('lever', `region: ${regionCode(chosen)} (was default: ${regions.map(regionCode).join(',')})`)
              const body = JSON.stringify(j)
              const clone = new Response(body, { status: resp.status, statusText: resp.statusText, headers: resp.headers })
              ;(clone as any).json = () => Promise.resolve(j)
              ;(clone as any).text = () => Promise.resolve(body)
              relayTokens({ gsToken: j.gsToken, region: regionCode(chosen) })
              return clone
            }
            if (!pick) diag('lever', `region "${want}" not offered; available: ${regions.map(regionCode).join(',')}`)
          }

          emit({ type: 'log', level: 'info', msg: `gsToken captured (region=${regionCode(chosen)})` } as any)
          relayTokens({ gsToken: j.gsToken, region: regionCode(chosen) })
        }
      } else if (/xsts\.auth\.xboxlive\.com\/xsts\/authorize$/.test(url) && method === 'POST' && resp.ok) {
        const j = await resp.clone().json()
        const claims = j?.DisplayClaims?.xui?.[0]

        if (claims?.gtg) emit({ type: 'profile' as any, profile: { gamertag: claims.gtg } } as any)
        if (claims?.xid) relayTokens({ xuid: String(claims.xid) })

        let relyingParty = ''
        try {
          const r = input instanceof Request ? input.clone() : new Request(input as any, init)
          relyingParty = String(JSON.parse(await r.text())?.RelyingParty ?? '')
        } catch { /* body already consumed or not JSON */ }

        if (claims?.uhs && j?.Token && relyingParty === 'http://xboxlive.com') {
          relayTokens({ xbl3: `XBL3.0 x=${claims.uhs};${j.Token}` })
          diag('tokens', `xbl3 captured for ${relyingParty}${claims.gtg ? ` (gamertag ${claims.gtg})` : ''}`)
        } else if (claims?.uhs && j?.Token) {
          diag('tokens', `xsts token for "${relyingParty || '(unknown)'}" — not the profile audience, ignored`)
        }
      }
    } catch { /* */ }

    return resp
  } as typeof fetch
  ;(patched as any).__xfly = true
  window.fetch = patched
}

function capOfferSdp(rawBody: string): string | null {
  const alias = String(engine.settings.resolutionAlias ?? 'Auto')
  if (alias !== '1080' && alias !== '1080HQ') return null

  const inner = JSON.parse(rawBody)
  if (typeof inner !== 'string') return null
  const msg = JSON.parse(inner)
  if (msg?.messageType !== 'offer' || typeof msg.sdp !== 'string') return null
  if (msg.sdp.includes('a=imageattr')) {
    diag('lever', 'sdp: offer already carries imageattr — left alone')
    return null
  }

  msg.sdp = msg.sdp.replace(
    /a=fmtp:(\w+)([^\n]*)/g,
    'a=fmtp:$1$2\na=imageattr:$1 recv [x=[0:1920],y=[0:1080],fps=[0:60]]\r',
  )
  diag('lever', `sdp: capped the offer to 1920x1080@60 via imageattr (alias "${alias}")`)
  rec('lever.imageattr', { alias, sdp: msg.sdp })
  return JSON.stringify(JSON.stringify(msg))
}

function regionCode(r: any): string {
  return r?.baseUri?.match(/\/\/(\w+)\./)?.[1] ?? String(r?.name ?? '?')
}

async function probeWaitTimes(titleId: string, native: typeof fetch): Promise<void> {
  if (!titleId || !engine.gsToken || engine.regions.length < 2) return
  const started = performance.now()
  const results = await Promise.all(
    engine.regions.map(async (r) => {
      const url = `${r.baseUri.replace(/\/+$/, '')}/v1/waittime/${titleId}`
      try {
        const resp = await native(url, { method: 'GET', headers: { Authorization: `Bearer ${engine.gsToken}` } })
        if (!resp.ok) return `${regionCode(r)}=HTTP${resp.status}`
        const j = await resp.json()
        const secs = j?.estimatedTotalWaitTimeInSeconds ?? j?.estimatedProvisioningTimeInSeconds
        rec('waittime', { region: regionCode(r), body: j })
        // Only the region we are actually playing on is worth telling the user about;
        // the rest are here to make the log worth reading.
        if (r.isDefault && typeof secs === 'number') emit({ type: 'waittime', seconds: secs })
        return `${regionCode(r)}=${secs ?? JSON.stringify(j)}s${r.isDefault ? '*' : ''}`
      } catch {
        return `${regionCode(r)}=err`
      }
    })
  )
  diag('region', `wait times for ${titleId} (${Math.round(performance.now() - started)}ms): ${results.join(' ')}`)
}

function relayTokens(tokens: Record<string, unknown>): void {
  try {
    const info = JSON.parse(localStorage.getItem('xboxcom_xbl_user_info') || '{}')
    const xuid = info?.xuid
    emit({ type: 'tokens' as any, tokens: { ...tokens, xuid } } as any)
  } catch {
    emit({ type: 'tokens' as any, tokens } as any)
  }
}
