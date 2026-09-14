import { useEffect, useState } from 'react'
import type { DepartmentConfig } from './departments'

interface Props {
  department: DepartmentConfig
  onDone: () => void
  minimal?: boolean // just show logo while waiting (no progress bar)
}

export default function LoadingScreen({ onDone, minimal, department }: Props) {
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState(0)

  const phases = [
    'Autenticando credenciais…',
    'Carregando indicadores…',
    'Preparando o painel…',
    'Quase lá…',
  ]

  useEffect(() => {
    if (minimal) return
    const steps = [
      { target: 30, delay: 120 },
      { target: 65, delay: 80 },
      { target: 85, delay: 60 },
      { target: 100, delay: 40 },
    ]

    let current = 0
    let stepIndex = 0

    const tick = () => {
      const step = steps[stepIndex]
      if (!step) return

      if (current < step.target) {
        current += 1
        setProgress(current)

        const newPhase = current < 30 ? 0 : current < 65 ? 1 : current < 85 ? 2 : 3
        setPhase(newPhase)

        setTimeout(tick, step.delay + Math.random() * 30)
      } else {
        stepIndex++
        if (stepIndex < steps.length) {
          setTimeout(tick, 180)
        } else {
          setTimeout(onDone, 400)
        }
      }
    }

    setTimeout(tick, 200)
  }, [onDone])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        zIndex: 9999,
      }}
    >
      {/* Glow backdrop */}
      <div style={{
        position: 'absolute',
        width: 400,
        height: 400,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(200,168,75,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Logo */}
      <div style={{
        animation: 'fadeInUp 0.6s ease both',
        marginBottom: 48,
      }}>
        <img
          src={department.logo}
          alt={department.name}
          style={{ width: 260, objectFit: 'contain', display: 'block' }}
        />
      </div>

      {/* Progress bar container */}
      <div style={{
        width: 280,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        animation: 'fadeInUp 0.6s ease 0.2s both',
        opacity: minimal ? 0 : 1,
      }}>
        {/* Track */}
        <div style={{
          width: '100%',
          height: 3,
          background: 'var(--surface2)',
          borderRadius: 99,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${progress}%`,
            background: 'linear-gradient(90deg, var(--accent), var(--accent2))',
            borderRadius: 99,
            transition: 'width 0.1s ease',
            boxShadow: '0 0 8px rgba(200,168,75,0.5)',
          }} />
        </div>

        {/* Status text + percentage */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <span style={{
            fontSize: 11,
            color: 'var(--muted)',
            letterSpacing: '0.04em',
            transition: 'opacity 0.3s',
          }}>
            {phases[phase]}
          </span>
          <span className="mono" style={{
            fontSize: 11,
            color: 'var(--accent)',
            fontWeight: 600,
          }}>
            {progress}%
          </span>
        </div>
      </div>

      {/* Decorative dots */}
      <div style={{
        position: 'absolute',
        bottom: 40,
        display: 'flex',
        gap: 6,
        animation: 'fadeInUp 0.6s ease 0.4s both',
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'var(--border)',
            animation: `pulse 1.2s ease ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.4); background: var(--accent); }
        }
      `}</style>
    </div>
  )
}
