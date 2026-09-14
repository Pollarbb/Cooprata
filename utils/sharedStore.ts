// Shared app data — Supabase KV for persistence + Realtime for live sync
// Every call is namespaced per department so Supermercado and
// Agropecuária never read or overwrite each other's data.

import { dbGet, dbSet } from './supabaseClient'

export interface SharedAppData {
  kpis?: unknown
  // Per-store period data: { [store]: { [period]: { [indicator]: value } } }
  // Legacy flat shape { [period]: { [indicator]: value } } is also accepted
  periodData?: Record<string, unknown>
  metas?: Record<string, Record<string, string>>
  settings?: Record<string, unknown>
  deletedIds?: string[]
  /** @deprecated superseded by fileNames */
  fileName?: string | null
  fileNames?: Record<string, string | null>
  active?: string | null
  layout?: Record<string, unknown>   // AllLayouts: period → { order, sizes }
}

export interface SharedNamespace {
  sharedKey: string
  channelName: string
}

// ── Realtime broadcast ────────────────────────────────────────────
// Poll through authenticated database requests so every refresh is checked by RLS.
// Public broadcast channels must never carry dashboard values.
export function subscribeToSync(ns: SharedNamespace, callback: (data: SharedAppData) => void): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout>
  let previous = ''
  async function refresh() {
    try {
      const data = await fetchSharedData(ns)
      const serialized = JSON.stringify(data)
      if (!stopped && data && serialized !== previous) { previous = serialized; callback(data) }
    } finally {
      if (!stopped) timer = setTimeout(refresh, 15000)
    }
  }
  timer = setTimeout(refresh, 15000)
  return () => { stopped = true; clearTimeout(timer) }
}
// ── Persistence ───────────────────────────────────────────────────
export async function fetchSharedData(ns: SharedNamespace): Promise<SharedAppData | null> {
  try {
    const data = await dbGet(ns.sharedKey)
    return (data as SharedAppData) ?? null
  } catch (e) {
    console.warn('[sharedStore] fetchSharedData failed:', e)
    return null
  }
}

function deepMergeMetas(
  existing: Record<string, Record<string, string>>,
  incoming: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
  const metas = { ...existing }
  for (const [id, periods] of Object.entries(incoming)) {
    metas[id] = { ...(existing[id] ?? {}), ...periods }
  }
  return metas
}

// Awaitable write + broadcast. Throws if DB write fails.
export async function pushSharedDataNow(ns: SharedNamespace, incoming: SharedAppData): Promise<void> {
  let existing: SharedAppData = {}
  existing = ((await dbGet(ns.sharedKey)) as SharedAppData) ?? {}
  const metas = deepMergeMetas(existing.metas ?? {}, incoming.metas ?? {})
  const merged = { ...existing, ...incoming, metas }

  // Persist to Supabase
  await dbSet(ns.sharedKey, merged)

  // Broadcast to connected viewers (fire-and-forget)

}

// Fire-and-forget convenience wrapper
export function pushSharedData(ns: SharedNamespace, incoming: SharedAppData): void {
  ;(async () => {
    try { await pushSharedDataNow(ns, incoming) }
    catch (e) { console.warn('[sharedStore] pushSharedData failed:', e) }
  })()
}

export function pushMetas(ns: SharedNamespace, metas: Record<string, Record<string, string>>): void {
  pushSharedData(ns, { metas })
}
