import { create } from 'zustand'

export interface GameTile {
  productId: string
  titleId?: string
  title: string
  art?: string
  hero?: string

  edition?: string

  editions?: GameTile[]
}

export interface Profile {
  gamertag?: string
  avatarUrl?: string
  gamerscore?: string

  name?: string
}

export interface Stats {
  width: number
  height: number
  fps: number
  bitrateMbps: number
  rttMs: number | null
  packetsLost: number

  jitterMs: number
  freezes: number
  bufferbloat: boolean
  codec: string
}


type View = 'home' | 'library' | 'settings' | 'stream'

interface AppState {
  view: View

  signedIn: boolean | null

  booted: boolean
  profile: Profile | null
  library: GameTile[]
  recent: GameTile[]
  settings: Record<string, unknown>
  streamState: 'idle' | 'loading' | 'starting' | 'playing' | 'ended'

  sessionState: string | null

  regions: Array<{ name: string; isDefault: boolean; baseUri: string }>

  launching: GameTile | null

  selected: GameTile | null
  stats: Stats | null
  proxy: { gate?: string; rewritten?: number; reason?: string } | null

  setView: (v: View) => void
  setAuth: (signedIn: boolean, profile: Profile | null) => void

  mergeProfile: (p: Profile) => void

  setBooted: (v?: boolean) => void
  setLibrary: (l: GameTile[]) => void
  mergeLibrary: (l: GameTile[]) => void
  setRecent: (r: GameTile[]) => void
  setSettings: (s: Record<string, unknown>) => void
  setStreamState: (s: AppState['streamState']) => void
  setSessionState: (s: string | null) => void
  setRegions: (r: AppState['regions']) => void
  setLaunching: (t: GameTile | null) => void
  setSelected: (t: GameTile | null) => void
  setStats: (s: Stats | null) => void
}

export const useStore = create<AppState>((set) => ({
  view: 'home',
  signedIn: null,
  booted: false,
  profile: null,
  library: [],
  recent: [],
  settings: {},
  streamState: 'idle',
  sessionState: null,
  regions: [],
  launching: null,
  selected: null,
  stats: null,
  proxy: null,

  setView: (view) => set({ view }),

  setAuth: (signedIn, profile) =>
    set((s) =>
      signedIn
        ? {
            signedIn,
            profile: profile ?? s.profile,

            ...(s.signedIn ? {} : { booted: false }),
          }
        : { signedIn, profile: null, library: [], recent: [], selected: null, view: 'home' as const },
    ),


  mergeProfile: (p) =>
    set((s) => {
      const known = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== ''))
      return Object.keys(known).length ? { profile: { ...s.profile, ...known } } : {}
    }),

  setBooted: (v = true) => set({ booted: v }),
  setLibrary: (library) => set({ library }),
  mergeLibrary: (incoming) =>
    set((s) => {
      const seen = new Set(s.library.map((t) => t.productId))
      const add = incoming.filter((t) => !seen.has(t.productId))
      return add.length ? { library: [...s.library, ...add] } : {}
    }),
  setRecent: (recent) => set({ recent }),
  setSettings: (settings) => set({ settings }),
  setStreamState: (streamState) => set({ streamState, ...(streamState === 'playing' ? { sessionState: null } : {}) }),
  setSessionState: (sessionState) => set({ sessionState }),
  setRegions: (regions) => set({ regions }),
  setLaunching: (launching) => set({ launching }),
  setSelected: (selected) => set({ selected }),
  setStats: (stats) => set({ stats }),
}))
