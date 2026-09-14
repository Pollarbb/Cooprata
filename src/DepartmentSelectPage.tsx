import { useState } from 'react'
import { DEPARTMENT_LIST, type DepartmentKey } from './departments'
import logo from './imports/cooprata-logo-dourada.png'
import supermercadoFoto from './imports/supermercados-perfil.jpg'
import agropecuariaFoto from './imports/agropecuaria-perfil.jpg'
import './DepartmentSelectPage.css'

interface Props { onSelect: (key: DepartmentKey) => void }

export default function DepartmentSelectPage({ onSelect }: Props) {
  const [selected, setSelected] = useState<DepartmentKey>('supermercado')
  return <main className="entry-page">
    <div className="entry-shell">
      <section className="entry-form">
        <img className="entry-logo" src={logo} alt="Cooprata" />
        <div className="entry-content">
          <span className="entry-eyebrow">PORTAL DE GESTÃO</span>
          <h1>Bem-vindo à Cooprata.</h1>
          <p className="entry-description">Tudo pronto para acompanhar seus resultados.<br />Escolha o departamento que deseja acessar.</p>
          <form onSubmit={event => { event.preventDefault(); onSelect(selected) }}>
            <fieldset className="entry-options">
              <legend>Selecione seu departamento</legend>
              {DEPARTMENT_LIST.map(dept => <label key={dept.key} className={`entry-option ${selected === dept.key ? 'is-selected' : ''}`}>
                <input type="radio" name="department" value={dept.key} checked={selected === dept.key} onChange={() => setSelected(dept.key)} />
                <span className="entry-option-icon" aria-hidden="true">{dept.key === 'supermercado' ? <img src={supermercadoFoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : <img src={agropecuariaFoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />}</span>
                <span className="entry-option-text"><strong>{dept.name}</strong><small>{dept.key === 'supermercado' ? 'Vendas, metas e desempenho das lojas' : 'Resultados e indicadores da agropecuária'}</small></span>
                <span className="entry-radio" aria-hidden="true" />
              </label>)}
            </fieldset>
            <button className="entry-submit" type="submit">Continuar <span aria-hidden="true">→</span></button>
            <p className="entry-login-note">Na próxima etapa, entre com seu usuário e senha.</p>
          </form>
        </div>
        <footer className="entry-footer">Cooprata <span>•</span> Juntos, crescemos mais.</footer>
      </section>
      <aside className="entry-art" aria-label="Gestão e acompanhamento de resultados">
        <div className="entry-stairs entry-stairs-top" /><div className="entry-stairs entry-stairs-bottom" />
        <div className="entry-illustration" aria-hidden="true">
          <div className="entry-orbit" />
          <div className="entry-bubble entry-bubble-chart">↗</div>
          <div className="entry-bubble entry-bubble-check">✓</div>
          <div className="entry-chart-card">
            <span className="entry-mock-label">EVOLUÇÃO DOS RESULTADOS</span>
            <div className="entry-mock-heading">Cada mês, uma nova visão.</div>
            <svg className="entry-chart" viewBox="0 0 320 125" fill="none"><defs><linearGradient id="entry-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#c8a84b" stopOpacity=".2"/><stop offset="1" stopColor="#c8a84b" stopOpacity="0"/></linearGradient></defs><path d="M0 100H320M0 60H320M0 20H320" stroke="#414047"/><path d="M0 110C35 110 32 59 69 65S105 100 141 50S192 67 226 37S272 51 320 8V125H0Z" fill="url(#entry-chart-fill)"/><path d="M0 110C35 110 32 59 69 65S105 100 141 50S192 67 226 37S272 51 320 8" stroke="#c8a84b" strokeWidth="3"/><circle cx="226" cy="37" r="6" fill="#c8a84b" stroke="#27272e" strokeWidth="3"/></svg>
            <div className="entry-chart-months"><span>ABR</span><span>MAI</span><span>JUN</span><span>JUL</span><span>AGO</span></div>
          </div>
          <div className="entry-goal-card"><span className="entry-goal-title">Metas em foco</span><div className="entry-goal-ring"><svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-9" /></svg></div><span>Acompanhe.</span><strong>Compare. Evolua.</strong></div>
          <div className="entry-mini-tag"><span /> Uma visão integrada</div>
        </div>
        <div className="entry-art-caption"><h2>Seus resultados.<br />Novas possibilidades.</h2><p>Mais clareza para acompanhar as metas<br />e decidir os próximos passos.</p><div className="entry-dots" aria-hidden="true"><i/><i/><i/></div></div>
      </aside>
    </div>
  </main>
}