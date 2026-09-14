import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://bjvkxphdbjaacgrztucg.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_O58SC6rvMzdmjibsrMQxSw_fFU604ex'

// Singleton guard — prevents multiple GoTrueClient instances on HMR
const W = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : {}
if (!W.__painelSecureSupabase) {
  W.__painelSecureSupabase = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'cooprata-auth-v2', storage: typeof window !== 'undefined' ? window.sessionStorage : undefined } },
  )
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = W.__painelSecureSupabase as SupabaseClient<any>

// ── kv_store (app state: metas, settings, deletedIds) ────────────
const KV_TABLE = 'kv_store_bc8e9323'

export async function dbGet(key: string): Promise<unknown> {
  const { data, error } = await supabase
    .from(KV_TABLE)
    .select('value')
    .eq('key', key)
    .maybeSingle()
  if (error) throw error
  return (data as { value: unknown } | null)?.value ?? null
}

export async function dbSet(key: string, value: unknown): Promise<void> {
  const { error } = await supabase.from(KV_TABLE).upsert({ key, value })
  if (error) throw error
}

// ── indicators (Excel data: store × period × indicator) ──────────
export interface IndicatorRecord {
  store_id: string        // "L1", "L2", "L3"
  period: string          // "2026-01", "2026-07", etc.
  indicator_name: string  // "Faturamento", "Ticket Médio", etc.
  value: number | null
}

const INDICATORS_TABLE = 'indicators'
const CHUNK_SIZE = 500

export async function upsertIndicators(records: IndicatorRecord[]): Promise<void> {
  if (records.length === 0) return
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const { error } = await supabase
      .from(INDICATORS_TABLE)
      .upsert(records.slice(i, i + CHUNK_SIZE), { onConflict: 'store_id,period,indicator_name' })
    if (error) throw error
  }
}

export async function fetchIndicators(storeId: string, period: string): Promise<IndicatorRecord[]> {
  const { data, error } = await supabase
    .from(INDICATORS_TABLE)
    .select('store_id,period,indicator_name,value')
    .eq('store_id', storeId)
    .eq('period', period)
  if (error) throw error
  return (data as IndicatorRecord[]) ?? []
}

export async function fetchIndicatorsForStore(storeId: string): Promise<IndicatorRecord[]> {
  const { data, error } = await supabase
    .from(INDICATORS_TABLE)
    .select('store_id,period,indicator_name,value')
    .eq('store_id', storeId)
    .order('period', { ascending: true })
  if (error) throw error
  return (data as IndicatorRecord[]) ?? []
}
