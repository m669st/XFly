const SAFE_PARAMS = new Set([
  'action',
  'bk',
  'client_id',
  'client_info',
  'code_challenge_method',
  'error',
  'error_description',
  'error_subcode',
  'issuer',
  'jshs',
  'lc',
  'locale_hint',
  'mkt',
  'msproxy',
  'npc',
  'prompt',
  'redirect_uri',
  'returnUrl',
  'response_mode',
  'response_type',
  'sandboxId',
  'scope',
  'tenant',
  'ui_locales',
  'uiflavor',
  'x-client-SKU',
  'x-client-Ver',
])

const MAX_VALUE = 60

function scrubQuery(qs: string): string {
  if (!qs) return ''
  return qs
    .split('&')
    .map((pair) => {
      if (!pair) return pair
      const eq = pair.indexOf('=')
      if (eq < 0) return SAFE_PARAMS.has(pair) ? pair : `${pair}`
      const key = pair.slice(0, eq)
      if (!SAFE_PARAMS.has(key)) return `${key}=<redacted>`
      const value = pair.slice(eq + 1)
      return `${key}=${value.length > MAX_VALUE ? value.slice(0, MAX_VALUE) + '…' : value}`
    })
    .join('&')
}

export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw)
    const q = scrubQuery(u.search.slice(1))
    const f = scrubQuery(u.hash.slice(1))
    return `${u.host}${u.pathname}${q ? '?' + q : ''}${f ? '#' + f : ''}`
  } catch {
    return redactText(raw)
  }
}

const HOME = /([A-Za-z]:\\Users\\)[^\\/\n"']+/g
const HOME_POSIX = /(\/(?:home|Users)\/)[^/\n"']+/g
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

export function redactText(s: string): string {
  return s
    .replace(EMAIL, '<email>')
    .replace(HOME, '$1<user>')
    .replace(HOME_POSIX, '$1<user>')
}
