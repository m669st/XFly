import { emit, diag } from './state'

function relayLocale(): void {
  // The market has to be a two-letter country the catalog knows. Splitting the locale
  // on '-' is not that: es-419 (Latin America) yields "419", zh-Hant-TW yields "Hant",
  // and the catalog answers both with 404s — which is an empty library forever, and
  // exactly what the first non-two-part-locale users hit. Intl knows how to find the
  // region subtag properly; anything that still isn't two letters falls back to US.
  const raw = navigator.language || 'en-US'
  let market = 'US'
  try {
    const region = new Intl.Locale(raw).maximize().region || ''
    if (/^[A-Z]{2}$/.test(region)) market = region
  } catch {
    /* an unparseable locale is a fallback, not a failure */
  }
  const candidate = document.documentElement.lang || raw
  // The catalog is equally strict about language: it wants ll-CC. A locale it does
  // not recognise turns every products call into a 400.
  const language = /^[a-z]{2,3}-[A-Z]{2}$/.test(candidate) ? candidate : 'en-US'
  diag('tokens', `locale: market=${market} language=${language} (from ${raw})`)
  emit({ type: 'tokens' as any, tokens: { market, language } } as any)
}

export function harvestTokens(): void {
  relayLocale()

  const scan = () => {
    try {
      const raw = localStorage.getItem('xboxcom_xbl_user_info')
      if (!raw) return false
      const info = JSON.parse(raw)
      const gssv = info?.tokens?.['http://gssv.xboxlive.com/']?.token
      const xsts = info?.tokens?.['http://xboxlive.com']
      const tokens: Record<string, unknown> = {}
      if (info?.xuid) tokens.xuid = String(info.xuid)
      if (gssv) tokens.gsToken = gssv
      if (xsts?.token && xsts?.userHash) tokens.xbl3 = `XBL3.0 x=${xsts.userHash};${xsts.token}`
      if (Object.keys(tokens).length) emit({ type: 'tokens' as any, tokens } as any)

      const gt = info?.gamertag || info?.displayClaims?.gtg
      if (gt) emit({ type: 'profile' as any, profile: { gamertag: gt } } as any)

      diag(
        'tokens',
        `xbl_user_info found: keys=[${Object.keys(info || {}).join(',')}] ` +
          `gsToken=${gssv ? 'yes' : 'no'} xbl3=${tokens.xbl3 ? 'yes' : 'no'} gamertag=${gt ? 'yes' : 'NO'}`,
      )
      return true
    } catch (e) {
      diag('tokens', `xbl_user_info unreadable: ${e}`)
      return false
    }
  }
  scan()
}
