import type { DepartmentKey } from './departments'
import { supabase } from '../utils/supabaseClient'

export type AppRole = 'admin' | 'editor' | 'viewer'
export interface AppUser {
  id: string
  username: string
  email: string
  role: AppRole
  department: DepartmentKey
  createdAt: string
}

export function canEditDashboard(user: AppUser): boolean {
  return user.role === 'editor' || user.role === 'admin'
}

export async function initAuth(): Promise<void> {
  // Remove legacy plaintext credentials. No legacy session authorizes access.
  for (const key of ['painel_session', 'painel_users_cache', 'painel_remember',
    'painel_remember_supermercado', 'painel_remember_agropecuaria']) {
    localStorage.removeItem(key)
  }
}

export async function getSession(department: DepartmentKey): Promise<AppUser | null> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw new Error('Não foi possível verificar sua sessão.')
  if (!sessionData.session) return null
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  const { data: membership, error: accessError } = await supabase
    .from('dashboard_memberships').select('role')
    .eq('user_id', data.user.id).eq('department', department).maybeSingle()
  if (accessError) throw new Error('Não foi possível consultar suas permissões. Tente novamente.')
  if (!membership || !['admin', 'editor', 'viewer'].includes(membership.role)) return null
  return {
    id: data.user.id, email: data.user.email ?? '',
    username: data.user.user_metadata?.display_name || data.user.email || 'Usuário',
    role: membership.role, department, createdAt: data.user.created_at,
  }
}

export async function login(email: string, password: string, department: DepartmentKey): Promise<AppUser> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error('Não foi possível entrar. Confira seu e-mail e senha.')
  try {
    const user = await getSession(department)
    if (!user) throw new Error('Seu usuário não tem acesso a este departamento.')
    return user
  } catch (error) {
    await supabase.auth.signOut({ scope: 'local' })
    throw error
  }
}

export async function logout(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) throw new Error('Não foi possível sair. Tente novamente.')
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('painel_') || key.startsWith('agro_painel_')) localStorage.removeItem(key)
  }
}