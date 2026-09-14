import supermercadoLogo from './imports/Ativo_34Logo_dourada.png'
import agropecuariaLogo from './imports/agropecuaria-logo-dourada.png'
// Department registry — each department gets its own isolated data:
// separate localStorage keys, separate Supabase KV entry, separate
// realtime channel, and a separate store_id prefix in the `indicators`
// table so uploads never collide across departments.

export type DepartmentKey = 'supermercado' | 'agropecuaria'

export interface DepartmentConfig {
  key: DepartmentKey
  logo: string
  name: string
  tagline: string
  icon: string
  storagePrefix: string
  sharedKey: string
  channelName: string
  storeIdPrefix: string
  multiStore: boolean
}

export const DEPARTMENTS: Record<DepartmentKey, DepartmentConfig> = {
  supermercado: {
    key: 'supermercado',
    logo: supermercadoLogo,
    name: 'Supermercados Cooprata',
    tagline: 'Painel de Performance do supermercado',
    icon: '🛒',
    storagePrefix: '',
    sharedKey: 'painel_appdata',
    channelName: 'painel-broadcast',
    storeIdPrefix: '',
    multiStore: true,
  },
  agropecuaria: {
    key: 'agropecuaria',
    logo: agropecuariaLogo,
    name: 'Loja Agropecuária',
    tagline: 'Painel de Performance da loja agropecuária',
    icon: '🌾',
    storagePrefix: 'agro_',
    sharedKey: 'painel_appdata_agro',
    channelName: 'painel-broadcast-agro',
    storeIdPrefix: 'AGRO_',
    multiStore: false,
  },
}

export const DEPARTMENT_LIST: DepartmentConfig[] = Object.values(DEPARTMENTS)
