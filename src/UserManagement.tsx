import { useEffect, useState } from 'react'
import { supabase } from '../utils/supabaseClient'
import { DEPARTMENTS, type DepartmentKey } from './departments'

export default function UserManagement({ department }: { department: DepartmentKey }) {
  const [departments, setDepartments] = useState<DepartmentKey[]>([])
  const [selected, setSelected] = useState(department)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('viewer')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)
  async function invoke(body: Record<string, string>) {
    const { data, error } = await supabase.functions.invoke('manage-users', { body })
    if (error) {
      let detail = ''
      try { detail = (await error.context?.json())?.error ?? '' } catch {}
      throw new Error(detail || 'O serviço de cadastro não está disponível. Confira a publicação da função manage-users no Supabase.')
    }
    if (data?.error) throw new Error(data.error)
    return data
  }
  useEffect(() => {
    let stopped = false
    invoke({ action: 'departments', department }).then(data => {
      if (!stopped) setDepartments(data.departments.filter((key: string) => key in DEPARTMENTS))
    }).catch(error => { if (!stopped) setMessage(error.message) })
    return () => { stopped = true }
  }, [department])
  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setMessage(''); setSuccess(false)
    try {
      await invoke({ action: 'create', department: selected, name: name.trim(), email: email.trim(), password, role })
      setSuccess(true)
      setMessage('Usuário cadastrado! Ele já pode entrar com o e-mail e a senha definidos, no departamento escolhido.')
      setName(''); setEmail(''); setPassword('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível cadastrar.')
    } finally { setBusy(false) }
  }
  const field = { display: 'block', width: '100%', padding: 12, margin: '8px 0 18px', background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8 }
  return <section style={{ marginTop: 32, borderTop: '1px solid var(--border)', paddingTop: 28 }}>
    <h2 style={{ fontSize: 20, marginBottom: 10 }}>Cadastrar usuário</h2>
    <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 22 }}>O novo usuário terá acesso somente ao departamento escolhido. Administradores são definidos separadamente.</p>
    <form onSubmit={create}>
      <fieldset disabled={busy || !departments.length} style={{ border: 0, padding: 0, minWidth: 0 }}>
        <label htmlFor="new-user-name">Nome</label>
        <input id="new-user-name" required maxLength={80} value={name} onChange={e => setName(e.target.value)} style={field} />
        <label htmlFor="new-user-email">E-mail</label>
        <input id="new-user-email" type="email" required maxLength={254} autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} style={field} />
        <label htmlFor="new-user-password">Senha inicial (mínimo de 12 caracteres)</label>
        <input id="new-user-password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} style={field} />
        <label htmlFor="new-user-department">Departamento</label>
        <select id="new-user-department" value={selected} onChange={e => setSelected(e.target.value as DepartmentKey)} style={field}>
          {departments.map(key => <option value={key} key={key}>{DEPARTMENTS[key].name}</option>)}
        </select>
        <label htmlFor="new-user-role">Perfil de acesso</label>
        <select id="new-user-role" value={role} onChange={e => setRole(e.target.value)} style={field}>
          <option value="viewer">Somente visualização</option><option value="editor">Editor — pode alterar indicadores e importar planilhas</option>
        </select>
        <button style={{ padding: '12px 20px', borderRadius: 8, background: 'var(--accent)', color: '#111', cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'Cadastrando…' : 'Cadastrar usuário'}</button>
      </fieldset>
    </form>
    {message && <p role="status" style={{ marginTop: 16, fontSize: 13, lineHeight: 1.7, color: success ? 'var(--positive)' : 'var(--negative)' }}>{message}</p>}
  </section>
}