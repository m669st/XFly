export const APP_NAME = 'XFly'

export const XBOX_PLAY_URL = 'https://www.xbox.com/en-US/play'
export const XBOX_ORIGIN = 'https://www.xbox.com'

export const XBOX_PARTITION = 'persist:xbox'

export const VSR_MAX_INPUT = { width: 2560, height: 1440 }

export const TIZEN_TV_USER_AGENT =
  'Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) 149.0.0.0/7.0 TV Safari/537.36 FC4A1DA2-711C-4E9C-BC7F-047AF8A672EA'

export const EDGE_DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'

export const BYPASS_SERVER_IPS = {
  off: '',
  us: '143.244.47.65',
  br: '169.150.198.66',
  jp: '138.199.21.239',
  kr: '121.125.60.151',
  pl: '45.134.212.66',
} as const
export type BypassRegion = keyof typeof BYPASS_SERVER_IPS

export type OsName = 'windows' | 'tizen' | 'android' | 'webOS' | 'xboxOS' | 'kepler'
export const OS_NAME: OsName = 'tizen'

export const STREAM_LOCALES = [
  'ar-SA', 'bg-BG', 'cs-CZ', 'da-DK', 'de-DE', 'el-GR', 'en-GB', 'en-US', 'es-ES', 'es-MX',
  'fi-FI', 'fr-FR', 'he-IL', 'hu-HU', 'it-IT', 'ja-JP', 'ko-KR', 'nb-NO', 'nl-NL', 'pl-PL',
  'pt-BR', 'pt-PT', 'ro-RO', 'ru-RU', 'sk-SK', 'sv-SE', 'th-TH', 'tr-TR', 'zh-CN', 'zh-TW',
] as const

export function pickStreamLocale(preferred: readonly string[]): string | null {
  const supported = STREAM_LOCALES as readonly string[]
  for (const want of preferred) {
    const hit = supported.find((l) => l.toLowerCase() === want.toLowerCase())
    if (hit) return hit
  }
  for (const want of preferred) {
    const lang = want.split('-')[0].toLowerCase()
    const hit = supported.find((l) => l.split('-')[0].toLowerCase() === lang)
    if (hit) return hit
  }
  return null
}

export const GSSV_HOSTS = /(^|\.)gssv-play-prod\.xboxlive\.com$/
export const XBOX_LOGIN_PATH = /\/v2\/login\/user$/

export const DEFAULT_SETTINGS = {
  streamRegion: 'auto' as string,
  bypassRegion: 'jp' as BypassRegion,
  resolutionAlias: 'Auto' as 'Auto' | '720' | '720HQ' | '1080' | '1080HQ' | '1440',
  targetBitrateMbps: 20,
  videoEnhancer: 'xfly' as 'xfly' | 'vsr' | 'off',
  deblock: 3, // 0 off .. 5 — smooth steps on the coding grid, keep real edges
  dering: 2, // 0 off .. 5 — bilateral pass for mosquito noise around edges
  clarityBoost: 3,
  claritySharpen: 1, // 0 off .. 5 (adaptive sharpen — after cleanup, not instead of it)
  clarityAdaptive: true, // scale sharpen down when bitrate collapses
  vibration: true,
  micDefaultOn: false,
  hideXboxChrome: true,
} as const
