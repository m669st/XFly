const TITLES = [
  ['Assassin\'s Creed Mirage', '#C2601F', '#3A1405'],
  ['Call of Duty: Vanguard', '#2C4A6E', '#0A1220'],
  ['Forza Horizon 5', '#5E2233', '#150609'],
  ['Halo Infinite', '#1E5C34', '#04140A'],
  ['Starfield', '#4A3A78', '#100C1E'],
  ['Sea of Thieves', '#6E5518', '#1A1204'],
  ['Gears 5', '#3A3A3A', '#0A0A0A'],
  ['Hi-Fi Rush', '#8A3A6E', '#1E0A18'],
] as const

function art(from: string, to: string, w: number, h: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
    `</linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const tiles = TITLES.map(([title, a, b], i) => ({
  productId: `DEV${i}`,
  titleId: `DEV${i}`,
  title,
  art: art(a, b, 300, 400),
  hero: art(a, b, 1920, 1080),
}))

export function installDevBridge(): void {
  const noop = (): void => {}
  const settings: Record<string, unknown> = {
    resolutionAlias: '1080HQ',
    targetBitrateMbps: 20,
    videoEnhancer: 'xfly',
    deblock: 3,
    dering: 2,
    claritySharpen: 1,
    clarityBoost: 1,
    clarityAdaptive: true,
    streamRegion: 'auto',
    vibration: true,
    micDefaultOn: false,
  }

  let pushAuth: ((s: unknown) => void) | null = null
  const account = { gamertag: 'DevTester', gamerscore: '13370', name: 'Dev Tester' }

  ;(window as any).xfly = {
    onAuthState: (cb: (s: unknown) => void) => {
      pushAuth = cb
      setTimeout(() => cb({ signedIn: true, profile: account, resolved: true }), 600)
      return noop
    },
    authState: async () => ({ signedIn: false, resolved: false }),
    signIn: () => setTimeout(() => pushAuth?.({ signedIn: true, profile: account, resolved: true }), 400),
    signOut: async () => pushAuth?.({ signedIn: false, resolved: true }),
    onEngineEvent: () => noop,
    getSettings: async () => settings,
    setSetting: async (k: string, v: unknown) => {
      settings[k] = v
      return settings
    },
    api: async (spec: any) => {
      if (spec?.kind === 'peoplePublic') {
        return {
          ok: true,
          status: 200,
          data: { people: [{ gamertag: account.gamertag, displayPicRaw: art('#107C10', '#0B0C0B', 64, 64) }] },
        }
      }
      if (spec?.kind === 'profile') {
        return {
          ok: true,
          status: 200,
          data: {
            profileUsers: [
              {
                settings: [
                  { id: 'Gamertag', value: account.gamertag },
                  { id: 'GameDisplayName', value: account.name },
                  { id: 'Gamerscore', value: account.gamerscore },
                ],
              },
            ],
          },
        }
      }
      return { ok: false, status: 0, data: null }
    },
    gpu: async () => ({
      vendor: 'nvidia' as const,
      label: 'NVIDIA RTX',
      name: 'NVIDIA GeForce RTX 5050 Laptop GPU',
      driver: '',
      idle: false,
    }),
    engineCommand: noop,
    showStream: noop,
    showLauncher: noop,
    minimize: noop,
    maximizeToggle: noop,
    close: noop,
    dumpLog: async () => 'dev',
    openRecording: noop,
  }

  return void setTimeout(() => {
    void import('../store').then(({ useStore }) => {
      useStore.getState().setRecent(tiles.slice(0, 6) as any)
      useStore.getState().mergeLibrary(tiles as any)
      useStore.getState().setRegions([
        { name: 'WestEurope', isDefault: true, baseUri: 'https://weu.core.gssv-play-prod.xboxlive.com' },
        { name: 'UkSouth', isDefault: false, baseUri: 'https://uks.core.gssv-play-prod.xboxlive.com' },
      ])
    })
  }, 700)
}
