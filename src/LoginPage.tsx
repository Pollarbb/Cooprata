import { useState } from 'react'
import { login, type AppUser } from './auth'


import type { DepartmentConfig } from './departments'

interface Props {
  department: DepartmentConfig
  onBack: () => void
  onLogin: (user: AppUser) => void
}



export default function LoginPage({ onLogin, department, onBack }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [busy, setBusy] = useState(false)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const user = await login(username.trim(), password, department.key)
      setPassword('')
      onLogin(user)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível entrar. Tente novamente.')
    } finally { setBusy(false) }
  }
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 360,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '40px 36px 36px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <button type="button" onClick={onBack} style={{ background: 'transparent', border: 0, color: 'var(--muted)', cursor: 'pointer', textAlign: 'left' }}>← Trocar departamento</button>{/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <img
            src={department.logo}
            alt={department.name}
            style={{ width: 240, objectFit: 'contain', display: 'block', marginBottom: 12 }}
          />
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            {department.name} · Faça login para continuar
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', fontWeight: 600 }}>
              E-mail
            </label>
            <input
              type="email" required autoComplete="username"
              autoFocus
              value={username}
              onChange={e => { setUsername(e.target.value); setError('') }}
              placeholder="Digite seu e-mail"
              style={{
                background: 'var(--surface2)',
                border: `1px solid ${error ? 'var(--negative)' : 'var(--border)'}`,
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 13,
                color: 'var(--text)',
                outline: 'none',
                width: '100%',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', fontWeight: 600 }}>
              Senha
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                placeholder="Digite sua senha"
                style={{
                  background: 'var(--surface2)',
                  border: `1px solid ${error ? 'var(--negative)' : 'var(--border)'}`,
                  borderRadius: 8,
                  padding: '10px 36px 10px 12px',
                  fontSize: 13,
                  color: 'var(--text)',
                  outline: 'none',
                  width: '100%',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--muted)', fontSize: 14, padding: 0,
                }}
              >
                {showPass ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              background: 'var(--negative-bg)',
              border: '1px solid var(--negative)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 11,
              color: 'var(--negative)',
            }}>
              ⚠ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !username || !password}
            style={{
              marginTop: 4,
              background: username && password ? 'var(--accent)' : 'var(--surface2)',
              color: username && password ? '#111' : 'var(--muted)',
              border: 'none',
              borderRadius: 8,
              padding: '11px',
              fontSize: 13,
              fontWeight: 700,
              cursor: username && password ? 'pointer' : 'not-allowed',
              letterSpacing: '0.05em',
              transition: 'all 0.15s',
            }}
          >
            {busy ? 'Entrando…' : 'Entrar →'}
          </button>
        </form>
      </div>
    </div>
  )
}
