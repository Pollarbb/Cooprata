import UserManagement from './UserManagement'
import { useState } from 'react'
import type { AppUser } from './auth'
import type { DepartmentConfig } from './departments'
import { supabase } from '../utils/supabaseClient'

interface Props {
  department: DepartmentConfig
  currentUser: AppUser
  onBack: () => void
  onUserUpdate: (user: AppUser) => void
}

export default function ProfilePage({ department, currentUser, onBack, onUserUpdate }: Props) {
  const [name, setName] = useState(currentUser.username)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true); setMessage('')
    try {
      const { error } = await supabase.auth.updateUser({ data: { display_name: name.trim() } })
      if (error) throw error
      onUserUpdate({ ...currentUser, username: name.trim() })
      setMessage('Nome atualizado.')
    } catch { setMessage('Não foi possível salvar. Tente novamente.') }
    finally { setBusy(false) }
  }
  return <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: 24 }}>
    <header style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 32 }}>
      <img src={department.logo} alt={department.name} style={{ width: 170 }} />
      <button onClick={onBack}>← Voltar</button>
    </header>
    <section style={{ maxWidth: 560, margin: '0 auto', padding: 28, borderRadius: 16, background: 'var(--surface)' }}>
      <h1 style={{ fontSize: 22, marginBottom: 24 }}>Meu perfil</h1>
      <p style={{ marginBottom: 12 }}>{currentUser.email}</p>
      <p style={{ color: 'var(--muted)', marginBottom: 24 }}>{department.name} · {currentUser.role === 'admin' ? 'Administrador' : currentUser.role === 'editor' ? 'Editor' : 'Visualização'}</p>
      <form onSubmit={save}>
        <label htmlFor="profile-name">Nome de exibição</label>
        <input id="profile-name" required maxLength={80} value={name} onChange={e => setName(e.target.value)} style={{ display: 'block', padding: 12, margin: '12px 0', background: 'var(--surface2)', borderRadius: 8, width: '100%' }} />
        <button disabled={busy || !name.trim()} style={{ padding: '10px 20px', borderRadius: 8, background: 'var(--accent)', color: '#111' }}>{busy ? 'Salvando…' : 'Salvar nome'}</button>
      </form>
      <p role="status" style={{ marginTop: 16 }}>{message}</p>
      {currentUser.role === 'admin' && <UserManagement department={department.key} />}
    </section>
  </main>
}