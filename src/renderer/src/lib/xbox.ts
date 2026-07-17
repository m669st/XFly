import { useStore, type GameTile, type Profile } from '../store'

type ApiResult = { ok: boolean; status: number; data: any }

async function call(spec: unknown): Promise<ApiResult> {
  return (await window.xfly.api(spec)) as ApiResult
}

const norm = (u?: string): string | undefined => (u ? (u.startsWith('//') ? 'https:' + u : u) : undefined)

export function productsToTiles(products: any): GameTile[] {
  const entries: Array<[string, any]> = Array.isArray(products)
    ? products.map((p) => [p?.ProductId || p?.productId, p])
    : Object.entries(products || {})

  const tiles: GameTile[] = []
  for (const [pid, p] of entries) {
    if (!pid || !p) continue
    if (p.Streamability && p.Streamability.WithGPU !== true) continue
    const title = p.ProductTitle || p.LocalizedProperties?.[0]?.ProductTitle
    if (!title) continue
    const art = norm(p.Image_Poster?.URL || p.Image_Tile?.URL)
    const hero = norm(p.Image_TitledHero?.URL || p.Image_Hero?.URL)
    if (!art && !hero) continue
    tiles.push({ productId: pid, titleId: p.XCloudTitleId, title, art: art || hero, hero })
  }
  return tiles
}

const EDITION =
  /\s*(?:[-–—:]\s*)?(?:for\s+)?\(?\s*Xbox\s+(One|Series\s*X\s*\|\s*S|Series\s*S\s*\|\s*X)\s*\)?(?:\s+(?:Edition|Version))?\s*$/i

export function editionOf(title: string): { base: string; edition?: string } {
  const m = title.match(EDITION)
  if (!m || m.index === undefined) return { base: title.trim() }
  return { base: title.slice(0, m.index).trim(), edition: /one/i.test(m[1]) ? 'Xbox One' : 'Xbox Series X|S' }
}

export function groupEditions(tiles: GameTile[]): GameTile[] {
  const groups = new Map<string, GameTile[]>()
  const order: string[] = []
  for (const t of tiles) {
    const { base } = editionOf(t.title)
    const key = base.toLowerCase()
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)!.push(t)
  }

  return order.map((key) => {
    const group = groups.get(key)!
    const { base, edition } = editionOf(group[0].title)
    if (group.length === 1) return { ...group[0], title: base || group[0].title, edition }
    const editions = group
      .map((t) => ({ ...t, edition: editionOf(t.title).edition }))
      .sort((a, b) => (a.edition === 'Xbox One' ? 1 : 0) - (b.edition === 'Xbox One' ? 1 : 0))
    return { ...editions[0], title: base, edition: undefined, editions }
  })
}

const CLOUD_COLLECTIONS = [
  '3aa7a358-f15b-476b-af7e-134a250c08a0',
  'e78d9a61-5ef4-43af-b400-edba1250b18e',
  'af206485-e87d-4624-9007-cb7f6d0cc42e',
  '06323672-b8c8-43cc-b0de-32d5a9834749',
  '31ff2361-2772-4622-849b-f4f1abb4ad1b',
  '6a589fa0-d493-472b-8e20-3813699d7056',
  '1bf84c2b-0643-4591-893f-d9edb703f692',
  '66ec875c-a391-44f5-9a54-a28bd6f976ce',
]

function siglProductIds(data: any): string[] {
  const arr: any[] = Array.isArray(data) ? data : data?.items || []
  return arr.map((x) => x?.id).filter((id) => typeof id === 'string' && id.length > 4)
}

export const STORE_COLLECTIONS = [
  '6a589fa0-d493-472b-8e20-3813699d7056',
  '06323672-b8c8-43cc-b0de-32d5a9834749',
  '31ff2361-2772-4622-849b-f4f1abb4ad1b',
  '66ec875c-a391-44f5-9a54-a28bd6f976ce',
  '3aa7a358-f15b-476b-af7e-134a250c08a0',
]

/**
 * Stream your own games — the titles the account actually owns and can stream,
 * as opposed to the hundreds in the Game Pass catalogue. Empty for an account
 * that has never bought a cloud-enabled game, and loadCollection returns null in
 * that case, so it simply does not appear rather than showing an empty shelf.
 */
export const SYOG_COLLECTION = 'e4c1d680-2c70-45e4-a38d-8a292c68c700'

/**
 * The games xCloud lists as playing natively with a keyboard and mouse. Most cloud
 * titles expect a pad and only fake keyboard support; this is the shortlist that
 * genuinely takes one, so the card can say so.
 */
const NATIVE_MKB_COLLECTION = '8fa264dd-124f-4af3-97e8-596fcdf4b486'

export async function loadMkbIds(): Promise<Set<string>> {
  const res = await call({ kind: 'collection', id: NATIVE_MKB_COLLECTION }).catch(() => null)
  if (!res?.ok) return new Set()
  return new Set(siglProductIds(res.data))
}

export interface Collection {
  id: string
  title: string
  description?: string
  tiles: GameTile[]
  /** How many the collection holds in total, so a row knows whether "Show all" is worth offering. */
  total: number
}

export async function loadCollection(
  id: string,
  limit = 24,
  titleOverride?: string,
): Promise<Collection | null> {
  const res = await call({ kind: 'collection', id }).catch(() => null)
  if (!res?.ok) return null
  const arr: any[] = Array.isArray(res.data) ? res.data : res.data?.items || []
  const meta = arr[0] && !arr[0].id ? arr[0] : null
  const allIds = siglProductIds(arr)
  const ids = allIds.slice(0, limit)
  if (!ids.length) return null

  // The catalogue endpoint takes a bounded batch, so a full shelf is fetched in
  // chunks and stitched back into the collection's own order.
  const byId = new Map<string, GameTile>()
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150)
    const products = await call({ kind: 'products', productIds: chunk }).catch(() => null)
    if (products?.data?.Products) {
      for (const t of productsToTiles(products.data.Products)) byId.set(t.productId, t)
    }
  }
  const tiles = groupEditions(ids.map((pid) => byId.get(pid)).filter((t): t is GameTile => !!t))
  if (!tiles.length) return null

  // The override wins because our own label is translated; the API's meta.title comes
  // back in the account's market language, which is not always the app's.
  return {
    id,
    title: titleOverride || meta?.title || 'Oyunlar',
    description: meta?.description,
    tiles,
    total: allIds.length,
  }
}

export async function loadLibrary(onBatch?: (tiles: GameTile[]) => void): Promise<GameTile[]> {
  const idSet = new Set<string>()
  const results = await Promise.all(
    CLOUD_COLLECTIONS.map((id) => call({ kind: 'collection', id }).catch(() => null)),
  )
  for (const r of results) {
    if (r?.ok) siglProductIds(r.data).forEach((id) => idSet.add(id))
  }
  if (!idSet.size) {
    const titles = await call({ kind: 'cloudTitles' }).catch(() => null)
    const list: any[] = titles?.data?.results || titles?.data?.titles || []
    list.forEach((t) => {
      const pid = t.details?.productId || t.productId
      if (pid) idSet.add(pid)
    })
  }
  const ids = [...idSet]
  if (!ids.length) return []

  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += 150) chunks.push(ids.slice(i, i + 150))

  const all: GameTile[] = []
  await Promise.all(
    chunks.map(async (chunk) => {
      const products = await call({ kind: 'products', productIds: chunk }).catch(() => null)
      if (!products?.data?.Products) return
      const tiles = productsToTiles(products.data.Products)
      all.push(...tiles)
      onBatch?.(tiles)
    }),
  )
  return all
}

export async function loadRecent(): Promise<GameTile[]> {
  const mru = await call({ kind: 'recentlyPlayed' }).catch(() => null)
  const list: any[] = mru?.data?.results || mru?.data?.titles || []
  const ids = list.map((t) => t.details?.productId || t.productId).filter(Boolean).slice(0, 12)
  if (!ids.length) return []
  const products = await call({ kind: 'products', productIds: ids }).catch(() => null)
  if (!products?.data?.Products) return []
  const tiles = productsToTiles(products.data.Products)
  const order = new Map(ids.map((id, i) => [id, i]))
  return tiles.sort((a, b) => (order.get(a.productId) ?? 99) - (order.get(b.productId) ?? 99))
}

export async function loadProfile(known?: Profile): Promise<Profile> {
  const out: Profile = { ...known }

  const res = await call({ kind: 'profile' }).catch(() => null)
  const settings: any[] = res?.data?.profileUsers?.[0]?.settings || []
  const get = (id: string): string | undefined => settings.find((s) => s.id === id)?.value || undefined
  const gamertag = get('Gamertag') ?? out.gamertag
  const name = get('GameDisplayName')

  if (gamertag) out.gamertag = gamertag
  if (get('GameDisplayPicRaw')) out.avatarUrl = get('GameDisplayPicRaw')
  if (get('Gamerscore')) out.gamerscore = get('Gamerscore')
  if (name && name !== gamertag) out.name = name

  if (!out.avatarUrl && out.gamertag) {
    const pub = await call({ kind: 'peoplePublic', gamertag: out.gamertag }).catch(() => null)
    const person = pub?.data?.people?.[0]
    if (person?.displayPicRaw) out.avatarUrl = person.displayPicRaw
    if (person?.gamertag && !out.gamertag) out.gamertag = person.gamertag
  }

  return out
}

export function launch(tile: GameTile): void {
  useStore.getState().setLaunching(tile)
  window.xfly.engineCommand({ type: 'launch', productId: tile.productId, title: tile.title })
}
