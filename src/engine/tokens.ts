import { emit, diag } from './state'

function relayLocale(): void {
  const language = document.documentElement.lang || navigator.language || 'en-US'
  const market = (navigator.language || 'en-US').split('-')[1] || 'US'
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
