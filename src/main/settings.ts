import Store from 'electron-store'
import { DEFAULT_SETTINGS } from '@shared/constants'

export type Settings = typeof DEFAULT_SETTINGS & Record<string, unknown>

const store = new Store<Settings>({
  name: 'xfly-settings',
  defaults: { ...DEFAULT_SETTINGS } as Settings,
})

{
  const VALID = ['Auto', '720', '720HQ', '1080', '1080HQ', '1440']
  const stored = store.get('resolutionAlias' as never) as unknown
  if (typeof stored === 'string' && !VALID.includes(stored)) {
    store.set('resolutionAlias' as never, 'Auto' as never)
  }
}

{
  const KEY = '_bitrateFloorV1'
  if (!store.get(KEY as never)) {
    if (!Number(store.get('targetBitrateMbps' as never))) {
      store.set('targetBitrateMbps' as never, 20 as never)
    }
    store.set(KEY as never, true as never)
  }
}

{
  const DEAD = [
    'smoothJitter', 'jitterMaxHoldMs', 'jitterSmoothMs', 'nativeRtcpProxy', 'rembFloorMbps',
    'rtcpAggressive', 'stripTransportCc', 'preferredResolution', 'enableHevc', 'jitterBufferMs',
    'preferCodec', 'streamResolution', 'region',
    'relaxNqi',
  ]
  for (const key of DEAD) store.delete(key as never)
}

export const settings = {
  get<K extends keyof Settings>(key: K): Settings[K] {
    return store.get(key)
  },
  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    store.set(key, value)
  },
  all(): Settings {
    return { ...DEFAULT_SETTINGS, ...store.store } as Settings
  },
  path(): string {
    return store.path
  },
}
