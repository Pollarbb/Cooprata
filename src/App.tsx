import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, arrayMove, rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import UploadModal, { type UploadResult, type PeriodData, type LojaKey } from './UploadModal'
import EvolucaoPerformance from './EvolucaoPerformance'
import LoginPage from './LoginPage'
import ProfilePage from './ProfilePage'
import LoadingScreen from './LoadingScreen'
import { initAuth, getSession, logout, type AppUser } from './auth'
import { fetchSharedData, pushSharedData, pushSharedDataNow, pushMetas, subscribeToSync, type SharedAppData, type SharedNamespace } from '../utils/sharedStore'
import { fetchIndicators } from '../utils/supabaseClient'
import { labelToPeriod } from './UploadModal'
import type { DepartmentConfig } from './departments'


type YoYDir = 'up' | 'down' | 'neutral'

// ── Layout types (drag-to-reorder + resize) ──────────────────────
type ColSpan = 1 | 2 | 3
interface CardSize { cols: ColSpan }
type PeriodLayout = { order: string[]; sizes: Record<string, CardSize> }
type AllLayouts = Record<string, PeriodLayout>

function parseBR(s: string): number | null {
  const raw = String(s).replace(/[^\d,.-]/g, '')
  if (!raw || raw === '-') return null
  let cleaned: string
  if (raw.includes(',')) {
    // Comma = decimal separator; all periods are thousands separators
    cleaned = raw.replace(/\./g, '').replace(',', '.')
  } else {
    const parts = raw.split('.')
    if (parts.length === 1) {
      cleaned = raw
    } else if (parts.length >= 3) {
      // Multiple periods → all thousands (e.g. "1.500.000")
      cleaned = parts.join('')
    } else {
      // Single period: exactly 3 digits after → thousands ("1.500" = 1500); else decimal
      cleaned = (parts[1]?.length === 3) ? parts.join('') : raw
    }
  }
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

function calcYoY(value: string, meta: string, invert = false): { yoy: string; yoyDir: YoYDir } | null {
  const v = parseBR(value)
  const m = parseBR(meta)
  if (v === null || m === null || m === 0) return null
  const pct = ((v - m) / Math.abs(m)) * 100
  const formatted = pct.toFixed(2).replace('.', ',') + '%'
  const rawDir: YoYDir = pct > 0.001 ? 'up' : pct < -0.001 ? 'down' : 'neutral'
  const dir: YoYDir = invert && rawDir !== 'neutral' ? (rawDir === 'up' ? 'down' : 'up') : rawDir
  return { yoy: formatted, yoyDir: dir }
}

function applyCalc(kpi: KPI): KPI {
  const result = calcYoY(kpi.value, kpi.meta, kpi.invertColors)
  if (!result) return kpi
  return { ...kpi, ...result }
}

type KPIFormat = 'currency' | 'percent' | 'number'

const FORMAT_BY_NAME: [RegExp, KPIFormat][] = [
  // ── Currency ──────────────────────────────────────────────────
  [/faturamento/i,                              'currency'],
  [/lucro\s*(bruto|l[ií]quido)/i,              'currency'],
  [/ticket\s*m[eé]dio/i,                        'currency'],
  [/venda\s*(s\/|sem\s*oferta)/i,               'currency'],
  [/venda\s*(c\/|com\s*oferta)/i,               'currency'],
  [/venda\s*(por|\/|x)\s*m[²2]/i,              'currency'],
  [/check.?out/i,                               'currency'],
  [/r\$\s*[\/\-]?\s*(check|funcionari|funcion)/i,'currency'],
  [/funcionari.*r\$/i,                          'currency'],
  [/estoque\s*(inicial|final|m[eé]dio)/i,       'currency'],
  [/cmv/i,                                      'currency'],
  [/transf/i,                                   'currency'],
  [/imposto/i,                                  'currency'],
  [/dispendio/i,                                'currency'],
  [/dispêndio/i,                                'currency'],
  [/descarte\s*(total|parcial)$/i,              'currency'],

  // ── Percent ───────────────────────────────────────────────────
  [/margem\s*bruta/i,                           'percent'],
  [/margem\s*l[ií]quida/i,                      'percent'],
  [/marg\s*(s\/|sem)/i,                         'percent'],
  [/marg\s*(c\/|com)/i,                         'percent'],
  [/ruptura/i,                                  'percent'],
  [/%\s*cmv/i,                                  'percent'],
  [/cmv.*%/i,                                   'percent'],
  [/%\s*descarte/i,                             'percent'],
  [/descarte.*%/i,                              'percent'],
  [/%\s*custo/i,                                'percent'],
  [/%\s*dispendio/i,                            'percent'],
  [/%\s*dispêndio/i,                            'percent'],
  [/part\s*(venda|v\.?)/i,                      'percent'],  // Part venda s/oferta, Part venda c/oferta
  [/sem\s*venda/i,                              'percent'],

  // ── Number ────────────────────────────────────────────────────
  [/qtd\s*(vendida|itens?)?/i,                  'number'],
  [/quantidade/i,                               'number'],
  [/pme/i,                                      'number'],
  [/giro\s*(do\s*)?estoque/i,                   'number'],
  [/giro\s*de\s*produtos/i,                     'number'],
  [/cesta\s*m[eé]dia/i,                         'number'],
  [/itens?\s*(vendidos?)?\s*[\/x]\s*m[²2]/i,   'number'],
  [/n[uú]mero\s*(de\s*)?cupons?/i,             'number'],
  [/n[oº°]\s*(de\s*)?cupons?/i,               'number'],
  [/cupons?/i,                                  'number'],
  [/produtos\s*(com|sem)\s*(estoque|giro)/i,    'number'],
  [/n\s*(funcionarios|funcionári)/i,            'number'],
  [/funcionarios$/i,                            'number'],
  [/m2\s*supermercado/i,                        'number'],
]

function detectFormat(name: string, value: string): KPIFormat {
  for (const [re, fmt] of FORMAT_BY_NAME) {
    if (re.test(name)) return fmt
  }
  if (/\(R\$\)/i.test(name) || /R\$/i.test(name)) return 'currency'
  if (/\(%\)/i.test(name) || /%/.test(name) || value.trim().endsWith('%')) return 'percent'
  return 'number'
}

function stripSuffix(v: string): string {
  return v.replace(/^\s*R\$\s*/i, '').replace(/\s*%\s*$/, '').trim()
}

function formatBR(value: string, format: KPIFormat): string {
  const n = parseBR(value)
  if (n === null || !isFinite(n)) return value
  if (format === 'currency') {
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  if (format === 'percent') {
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  // Número: sem casas decimais se for inteiro, 2 casas se tiver fração
  if (Number.isInteger(n)) return n.toLocaleString('pt-BR')
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface KPI {
  id: string
  icon: string
  invertColors?: boolean
  format: KPIFormat
  name: string
  value: string
  meta: string
  metaLabel: string
  yoy: string
  yoyDir: YoYDir
  extraLabel?: string
  extraValue?: string
}

const defaultKPIs: KPI[] = [
  { id: 'receita',    icon: '💰', format: 'currency', name: 'Receita Bruta (R$)',       value: '383.846',   meta: '300.000', metaLabel: 'Meta', yoy: '9,8%',   yoyDir: 'up' },
  { id: 'margem_sem', icon: '📉', format: 'percent',  name: 'Margem Sem Oferta',        value: '34,00',     meta: '36,11',   metaLabel: 'Meta', yoy: '3,89%',  yoyDir: 'up' },
  { id: 'lucro',      icon: '🏆', format: 'currency', name: 'Lucro Bruto (R$)',          value: '739.802',   meta: '738.121', metaLabel: 'Meta', yoy: '10,17%', yoyDir: 'up' },
  { id: 'cupons',     icon: '🎟️', format: 'number',   name: 'Cupons',                   value: '32.354',    meta: '35.209',  metaLabel: 'Meta', yoy: '1,08%',  yoyDir: 'up' },
  { id: 'margem_com', icon: '📊', format: 'percent',  name: 'Margem Com Oferta',        value: '13,85',     meta: '18,84',   metaLabel: 'Meta', yoy: '-1,99%', yoyDir: 'down' },
  { id: 'valor_m2',   icon: '📐', format: 'currency', name: 'Valor Venda / M² (R$)',    value: '3.405,49',  meta: '700',     metaLabel: 'Meta', yoy: '9,79%',  yoyDir: 'up', extraLabel: 'M²', extraValue: '3.000' },
  { id: 'qtd_vendida',icon: '📦', format: 'number',   name: 'Qtd. Vendida',             value: '214.378',   meta: '212.091', metaLabel: 'Meta', yoy: '8,15%',  yoyDir: 'up' },
  { id: 'venda_sem',  icon: '💵', format: 'currency', name: 'Venda Sem Oferta (R$)',    value: '2.033.390', meta: '80',      metaLabel: 'Meta', yoy: '3,66%',  yoyDir: 'up' },
  { id: 'itens_m2',   icon: '🔢', format: 'number',   name: 'Itens Vendidos / M²',      value: '9,60',      meta: '10',      metaLabel: 'Meta', yoy: '0,35%',  yoyDir: 'up' },
  { id: 'ticket',     icon: '🎫', format: 'currency', name: 'Ticket Médio (R$)',         value: '73,68',     meta: '74,62',   metaLabel: 'Meta', yoy: '8,6%',   yoyDir: 'up' },
  { id: 'venda_com',  icon: '🏷️', format: 'currency', name: 'Venda Com Oferta (R$)',    value: '350.456',   meta: '20',      metaLabel: 'Meta', yoy: '67,09%', yoyDir: 'up' },
  { id: 'venda_func', icon: '👷', format: 'currency', name: 'Venda / Funcionário (R$)', value: '37.248',    meta: '35.000',  metaLabel: 'Meta', yoy: '9,79%',  yoyDir: 'up', extraLabel: 'Func.', extraValue: '' },
  { id: 'cesta',      icon: '🛒', format: 'number',   name: 'Cesta Média (Qtd.)',        value: '6,63',      meta: '6,63',    metaLabel: 'Meta', yoy: '2,08%',  yoyDir: 'up' },
  { id: 'ruptura',    icon: '⚠️', format: 'percent',  invertColors: true, name: 'Ruptura (%)', value: '2,20', meta: '2,00',  metaLabel: 'Meta', yoy: '0,50%',  yoyDir: 'down' },
  { id: 'sem_venda',  icon: '🚫', format: 'percent',  name: 'Sem Venda',                value: '91,93',     meta: '90,00',   metaLabel: 'Meta', yoy: '1,10%',  yoyDir: 'up' },
  { id: 'devol',      icon: '↩️', format: 'currency', invertColors: true, name: 'Devolução (R$)', value: '12.450', meta: '10.000', metaLabel: 'Meta', yoy: '-3,20%', yoyDir: 'down' },
]

function YoYBadge({ value, dir }: { value: string; dir: YoYDir }) {
  const colors = {
    up:      { bg: 'var(--positive-bg)', color: 'var(--positive)', border: 'var(--positive)' },
    down:    { bg: 'var(--negative-bg)', color: 'var(--negative)', border: 'var(--negative)' },
    neutral: { bg: 'var(--neutral-bg)',  color: 'var(--neutral)',  border: 'var(--neutral)' },
  }
  const c = colors[dir]
  return (
    <span
      className="mono text-[10px] font-semibold px-1.5 py-0.5 rounded"
      style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}
    >
      {dir === 'up' ? '▲' : dir === 'down' ? '▼' : '●'} {value}
    </span>
  )
}

function valueFontSize(value: string, format: KPIFormat): string {
  const formatted = formatBR(stripSuffix(value), format)
  const extra = format === 'currency' ? 3 : format === 'percent' ? 1 : 0
  const len = formatted.length + extra
  if (len <= 7)  return '24px'
  if (len <= 11) return '20px'
  if (len <= 15) return '17px'
  return '15px'
}

const FORMAT_CYCLE: KPIFormat[] = ['number', 'currency', 'percent']
const FORMAT_LABEL: Record<KPIFormat, string> = { number: '#', currency: 'R$', percent: '%' }

function ValueDisplay({ value, format }: { value: string; format: KPIFormat }) {
  const formatted = formatBR(stripSuffix(value), format)
  if (format === 'currency') return <><span style={{ fontSize: '0.6em', opacity: 0.75, marginRight: 2 }}>R$</span>{formatted}</>
  if (format === 'percent')  return <>{formatted}<span style={{ fontSize: '0.6em', opacity: 0.75, marginLeft: 2 }}>%</span></>
  return <>{formatted}</>
}

function EditableKPI({
  kpi, onUpdate, onRemove, readOnly,
}: {
  kpi: KPI
  onUpdate: (updated: KPI, prevMeta?: string) => void
  onRemove: () => void
  readOnly?: boolean
}) {
  const [editing, setEditing] = useState(false)

  const update = (changes: Partial<KPI>) => {
    if (readOnly) return
    const prevMeta = kpi.meta
    const next = { ...kpi, ...changes }
    onUpdate(applyCalc(next), 'meta' in changes ? prevMeta : undefined)
  }

  const cycleFormat = (e: React.MouseEvent) => {
    e.stopPropagation()
    const idx = FORMAT_CYCLE.indexOf(kpi.format)
    update({ format: FORMAT_CYCLE[(idx + 1) % FORMAT_CYCLE.length] })
  }

  return (
    <div
      className="rounded-lg flex flex-col transition-all duration-150"
      style={{
        background: 'var(--surface)',
        border: `1px solid ${editing ? 'var(--accent)' : 'var(--border)'}`,
        minHeight: 130,
        padding: '10px 12px',
        gap: 6,
        cursor: readOnly ? 'default' : 'pointer',
      }}
      onClick={() => { if (!readOnly) setEditing(true) }}
      onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setEditing(false)
      }}
      tabIndex={0}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-sm">{kpi.icon}</span>
          {editing && !readOnly
            ? <input
                className="text-[11px] font-semibold text-white bg-transparent border-none outline-none flex-1"
                value={kpi.name}
                onChange={e => update({ name: e.target.value })}
                onClick={e => e.stopPropagation()}
              />
            : <span className="text-[11px] font-semibold text-white truncate">{kpi.name}</span>
          }
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!readOnly && (
            <button
              title={`Formato: ${FORMAT_LABEL[kpi.format]} — clique para alternar`}
              onClick={cycleFormat}
              className="rounded text-[9px] font-bold w-6 h-5 flex items-center justify-center transition-all"
              style={{
                background: kpi.format === 'currency' ? 'rgba(80,160,80,0.15)' : kpi.format === 'percent' ? 'rgba(80,120,200,0.15)' : 'rgba(80,80,100,0.15)',
                border: `1px solid ${kpi.format === 'currency' ? '#2d7a3a' : kpi.format === 'percent' ? '#3355aa' : 'var(--border)'}`,
                color: kpi.format === 'currency' ? '#4db860' : kpi.format === 'percent' ? '#5577dd' : 'var(--muted)',
                cursor: 'pointer',
              }}
            >
              {FORMAT_LABEL[kpi.format]}
            </button>
          )}
          {editing && !readOnly && (
            <button
              className="text-[9px] px-1.5 py-0.5 rounded"
              style={{ background: 'var(--accent)', color: '#111' }}
              onClick={e => { e.stopPropagation(); setEditing(false) }}
            >
              OK
            </button>
          )}
          {readOnly && (
            <span
              className="text-[9px] px-1 py-0.5 rounded"
              style={{ background: 'rgba(80,80,100,0.12)', color: 'var(--muted)', border: '1px solid var(--border)' }}
            >
              {FORMAT_LABEL[kpi.format]}
            </span>
          )}
        </div>
      </div>

      {/* Main value */}
      <div
        className="mono font-bold flex items-baseline flex-wrap"
        style={{
          color: 'var(--accent2)',
          fontSize: valueFontSize(kpi.value, kpi.format),
          transition: 'font-size 0.15s',
          lineHeight: 1.15,
          padding: '2px 0',
          wordBreak: 'break-all',
        }}
      >
        {editing && !readOnly
          ? <>
              {kpi.format === 'currency' && <span style={{ fontSize: '0.55em', opacity: 0.7, marginRight: 3 }}>R$</span>}
              <input
                className="mono font-bold bg-transparent border-none outline-none flex-1"
                style={{ color: 'var(--accent2)', fontSize: 'inherit', minWidth: 0 }}
                value={stripSuffix(kpi.value)}
                onChange={e => update({ value: e.target.value })}
                onClick={e => e.stopPropagation()}
              />
              {kpi.format === 'percent' && <span style={{ fontSize: '0.55em', opacity: 0.7, marginLeft: 2 }}>%</span>}
            </>
          : <ValueDisplay value={kpi.value} format={kpi.format} />
        }
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px]" style={{ color: 'var(--muted)' }}>Meta</span>
        <span className="mono text-[11px] font-medium" style={{ color: 'var(--text)' }}>
          {readOnly
            ? <span>{kpi.meta || '—'}</span>
            : <input
                className="mono bg-transparent border-none outline-none text-[11px] font-medium"
                style={{ color: 'var(--text)', width: `${Math.max(4, (kpi.meta || '').length + 1)}ch` }}
                placeholder="—"
                value={kpi.meta}
                onChange={e => update({ meta: e.target.value })}
                onClick={e => e.stopPropagation()}
              />
          }
        </span>
        {kpi.extraLabel && (
          <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
            {kpi.extraLabel}{' '}
            <span className="mono text-white">
              {editing && !readOnly
                ? <input
                    className="mono bg-transparent border-none outline-none w-14 text-[10px]"
                    style={{ color: 'var(--text)' }}
                    value={kpi.extraValue ?? ''}
                    onChange={e => update({ extraValue: e.target.value })}
                    onClick={e => e.stopPropagation()}
                  />
                : kpi.extraValue
              }
            </span>
          </span>
        )}
      </div>

      {/* YoY row */}
      <div className="flex items-center justify-between mt-auto" style={{ paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          {calcYoY(kpi.value, kpi.meta) ? 'vs Meta' : 'YoY'}
        </span>
        <div className="flex items-center gap-1">
          {!readOnly && (
            <button
              title="Remover indicador"
              onClick={e => { e.stopPropagation(); onRemove() }}
              className="rounded text-[10px] w-5 h-5 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
              style={{
                background: 'rgba(180,50,50,0.18)',
                border: '1px solid rgba(180,50,50,0.4)',
                color: 'var(--negative)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              ×
            </button>
          )}
          <YoYBadge value={kpi.yoy} dir={kpi.yoyDir} />
          {!readOnly && (
            <button
              title={kpi.invertColors ? 'Inversão ativa: alto = ruim' : 'Normal: alto = bom'}
              onClick={e => { e.stopPropagation(); update({ invertColors: !kpi.invertColors }) }}
              className="rounded text-[10px] w-5 h-5 flex items-center justify-center transition-all"
              style={{
                background: kpi.invertColors ? 'rgba(180,80,80,0.2)' : 'rgba(80,80,100,0.2)',
                border: `1px solid ${kpi.invertColors ? 'var(--negative)' : 'var(--border)'}`,
                color: kpi.invertColors ? 'var(--negative)' : 'var(--muted)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              ⇅
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sortable card wrapper (drag + resize) ────────────────────────
function SortableCard({
  kpi, cols, onUpdate, onRemove, readOnly, onResize, onResetSize,
}: {
  kpi: KPI
  cols: ColSpan
  onUpdate: (updated: KPI, prevMeta?: string) => void
  onRemove: () => void
  readOnly: boolean
  onResize: (id: string, cols: ColSpan) => void
  onResetSize: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: kpi.id })

  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [hovered, setHovered] = useState(false)
  const resizeActive = useRef(false)
  const pendingCols = useRef<ColSpan>(cols)
  const [previewCols, setPreviewCols] = useState<ColSpan | null>(null)

  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      setNodeRef(el)
      wrapperRef.current = el
    },
    [setNodeRef],
  )

  const activeCols = previewCols ?? cols

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const el = wrapperRef.current
    if (!el) return
    const colW = el.getBoundingClientRect().width / cols
    const startX = e.clientX
    const startCols = cols
    resizeActive.current = true
    pendingCols.current = cols

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const newCols = Math.max(1, Math.min(3, Math.round((startCols * colW + dx) / colW))) as ColSpan
      pendingCols.current = newCols
      setPreviewCols(newCols)
    }
    const onUp = () => {
      resizeActive.current = false
      onResize(kpi.id, pendingCols.current)
      setPreviewCols(null)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      ref={setRefs}
      style={{
        gridColumn: `span ${activeCols}`,
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? 'none' : transition,
        opacity: isDragging ? 0.45 : 1,
        position: 'relative',
        minWidth: 0,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Drag handle — appears on hover, editors only */}
      {!readOnly && (
        <div
          {...attributes}
          {...listeners}
          title="Arrastar para reordenar"
          style={{
            position: 'absolute',
            top: 3,
            left: '50%',
            transform: 'translateX(-50%)',
            cursor: isDragging ? 'grabbing' : 'grab',
            color: 'var(--accent)',
            fontSize: 11,
            lineHeight: 1,
            userSelect: 'none',
            zIndex: 12,
            opacity: hovered && !isDragging ? 0.6 : 0,
            transition: 'opacity 0.15s',
            padding: '1px 8px',
            letterSpacing: 2,
          }}
        >
          ⠿
        </div>
      )}

      <EditableKPI
        kpi={kpi}
        onUpdate={onUpdate}
        onRemove={onRemove}
        readOnly={readOnly}
      />

      {/* Resize handle — right edge, editors only */}
      {!readOnly && (
        <div
          onPointerDown={e => e.stopPropagation()}
          onMouseDown={handleResizeMouseDown}
          onDoubleClick={e => { e.stopPropagation(); onResetSize(kpi.id) }}
          title="Arrastar para redimensionar · 2× clique para resetar tamanho"
          style={{
            position: 'absolute',
            top: 0,
            right: -3,
            bottom: 0,
            width: 10,
            cursor: 'ew-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 12,
          }}
        >
          <div
            style={{
              width: 3,
              height: 28,
              borderRadius: 2,
              background: 'var(--accent)',
              opacity: hovered ? 0.35 : 0,
              transition: 'opacity 0.15s',
            }}
          />
        </div>
      )}
    </div>
  )
}

// ── Filter options ───────────────────────────────────────────────
type FilterOption = { label: string; value: string }

const FILTER_OPTIONS: Record<string, FilterOption[]> = {
  oferta: [
    { label: 'Todos',      value: 'todos' },
    { label: 'Com Oferta', value: 'com' },
    { label: 'Sem Oferta', value: 'sem' },
  ],
  loja: [
    { label: 'Todas',  value: 'todos' },
    { label: 'Loja 1', value: 'loja1' },
    { label: 'Loja 2', value: 'loja2' },
    { label: 'Loja 3', value: 'loja3' },
  ],
}

function FilterSelect({ label, options, value, onChange }: {
  label: string; options: FilterOption[]; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: 'var(--muted)' }}>{label}</span>
      <select
        className="text-[11px] rounded px-2 py-1 border"
        style={{ background: 'var(--surface2)', color: 'var(--text)', borderColor: 'var(--border)', minWidth: 80 }}
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ── Sheet helpers ────────────────────────────────────────────────
function normName(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function cleanSheetValue(raw: string): string {
  return raw.replace(/^\s*R\$\s*/i, '').replace(/\s*%\s*$/, '').trim()
}

const ICON_MAP: Record<string, string> = {
  faturamento: '💰', receita: '💰', lucro: '🏆', margem: '📊',
  cupom: '🎟️', ticket: '🎫', venda: '💵', funcionario: '👷',
  estoque: '📦', giro: '🔄', cesta: '🛒', pme: '📅',
  check: '✅', itens: '🔢', descarte: '🗑️', dispendio: '💸',
  despesa: '💸', imposto: '🏛️', qtd: '📦', ruptura: '⚠️',
}

function guessIcon(name: string): string {
  const n = normName(name)
  for (const [key, icon] of Object.entries(ICON_MAP)) {
    if (n.includes(key)) return icon
  }
  return '📊'
}

function applyPeriodToKPIs(
  kpis: KPI[],
  data: Record<string, string>,
  deletedIds: Set<string> = new Set(),
): KPI[] {
  const dataEntries = Object.entries(data)
  const matchedKeys = new Set<string>()

  const updated = kpis.map(kpi => {
    const kpiNorm = normName(kpi.name)
    const match = dataEntries.find(([rowName]) => {
      const rn = normName(rowName)
      return rn === kpiNorm ||
        (rn.length >= 6 && kpiNorm.length >= 6 && (
          kpiNorm.startsWith(rn) || rn.startsWith(kpiNorm)
        ))
    })
    if (!match) return kpi
    matchedKeys.add(match[0])
    const rawValue = cleanSheetValue(match[1])
    return applyCalc({ ...kpi, value: rawValue })
  })

  const usedIds = new Set(updated.map(k => k.id))
  const newKpis: KPI[] = dataEntries
    .filter(([name]) => !matchedKeys.has(name) && !deletedIds.has(`sheet_${normName(name)}`))
    .map(([name, rawVal]) => {
      const value = cleanSheetValue(rawVal)
      const format = detectFormat(name, rawVal)
      let id = `sheet_${normName(name)}`
      let suffix = 2
      while (usedIds.has(id)) { id = `sheet_${normName(name)}_${suffix++}` }
      usedIds.add(id)
      const base: KPI = {
        id,
        icon: guessIcon(name),
        format, name, value,
        meta: '', metaLabel: 'Meta',
        yoy: '0%', yoyDir: 'neutral',
      }
      return applyCalc(base)
    })

  return [...updated, ...newKpis]
}

// ── Persistence ──────────────────────────────────────────────────
// Keys are namespaced per department so Supermercado and Agropecuária
// never share localStorage data. Supermercado keeps the original
// unprefixed keys so existing data isn't lost.
function makeStore(prefix: string) {
  return {
    kpis:       `${prefix}painel_kpis`,
    periodData: `${prefix}painel_period_data`,
    active:     `${prefix}painel_active_period`,
    fileNames:  `${prefix}painel_file_names`,
    settings:   `${prefix}painel_settings`,
    metas:      `${prefix}painel_metas_v2`,
    deleted:    `${prefix}painel_deleted_ids`,
    layout:     `${prefix}painel_layouts`,
  }
}

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback }
  catch { return fallback }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

// ── Per-loja data types ──────────────────────────────────────────
type AllLojaData = Partial<Record<LojaKey, PeriodData>>

function normalizePeriodData(raw: unknown): AllLojaData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const obj = raw as Record<string, unknown>
  if ('loja1' in obj || 'loja2' in obj || 'loja3' in obj) return obj as AllLojaData
  // Legacy flat shape: { [period]: { [kpiName]: value } }
  const firstVal = Object.values(obj)[0]
  if (firstVal && typeof firstVal === 'object' && !Array.isArray(firstVal)) {
    const inner = Object.values(firstVal as object)[0]
    if (typeof inner === 'string') return { loja1: obj as PeriodData }
  }
  return {}
}

function getLojaData(data: AllLojaData, loja: string): PeriodData {
  if (loja === 'todos') {
    const totals: Record<string, Record<string, number>> = {}
    for (const periods of Object.values(data)) {
      for (const [period, rows] of Object.entries(periods ?? {})) {
        const target = totals[period] ??= {}
        for (const [name, value] of Object.entries(rows)) {
          const number = parseBR(value)
          if (number !== null) target[name] = (target[name] ?? 0) + number
        }
      }
    }
    return Object.fromEntries(Object.entries(totals).map(([period, rows]) => [
      period, Object.fromEntries(Object.entries(rows).map(([name, value]) => [name, String(value).replace('.', ',')]))
    ]))
  }
  return data[loja as LojaKey] ?? {}
}

// ── Fixed months ─────────────────────────────────────────────────
const FIXED_MONTHS = ['jan/26','fev/26','mar/26','abr/26','mai/26','jun/26',
                      'jul/26','ago/26','set/26','out/26','nov/26','dez/26']

type CardSettings = { format: KPIFormat; invertColors: boolean }
type SettingsStore = Record<string, CardSettings>
type MetasByPeriod = Record<string, Record<string, string>>

function restoreSettings(kpis: KPI[], store: SettingsStore): KPI[] {
  return kpis.map(k => {
    const s = store[k.id]
    if (!s) return k
    return applyCalc({ ...k, format: s.format, invertColors: s.invertColors })
  })
}

function extractSettings(kpis: KPI[]): SettingsStore {
  const out: SettingsStore = {}
  for (const k of kpis) out[k.id] = { format: k.format, invertColors: !!k.invertColors }
  return out
}

function metaKey(period: string, loja?: string): string {
  return loja && loja !== 'todos' ? `${loja}:${period}` : period
}

function restorePeriodMetas(kpis: KPI[], metas: MetasByPeriod, period: string, loja?: string): KPI[] {
  const key = metaKey(period, loja)
  return kpis.map(k => {
    // prefer loja-specific key, fall back to legacy plain-period key
    const storeMetas = ['loja1', 'loja2', 'loja3'].map(store => parseBR(metas[k.id]?.[metaKey(period, store)] ?? '')).filter((value): value is number => value !== null)
    const meta = loja === 'todos'
      ? (storeMetas.length ? formatBR(String(storeMetas.reduce((sum, value) => sum + value, 0)).replace('.', ','), k.format) : metas[k.id]?.[period] ?? '')
      : metas[k.id]?.[key] ?? metas[k.id]?.[period] ?? ''
    return applyCalc({ ...k, meta })
  })
}

function savePeriodMeta(metas: MetasByPeriod, kpiId: string, period: string, meta: string, loja?: string): MetasByPeriod {
  const key = metaKey(period, loja)
  return { ...metas, [kpiId]: { ...(metas[kpiId] ?? {}), [key]: meta } }
}

const LOJA_BADGE: Record<string, string> = { loja1: 'L1', loja2: 'L2', loja3: 'L3' }

function lojaToStoreId(loja: string, storeIdPrefix: string): string {
  return storeIdPrefix + ({ loja1: 'L1', loja2: 'L2', loja3: 'L3' }[loja] ?? 'L1')
}

/** Same indicator structure as defaultKPIs but with every value/meta blanked
 *  out — used to seed a brand-new department's dashboard with no data. */
function blankKPIs(source: KPI[]): KPI[] {
  return source.map(k => ({
    ...k, value: '', meta: '', yoy: '', yoyDir: 'neutral' as YoYDir, extraValue: k.extraValue !== undefined ? '' : undefined,
  }))
}

// ── App ──────────────────────────────────────────────────────────
export default function App({ department, onSwitchDepartment }: { department: DepartmentConfig; onSwitchDepartment: () => void }) {
  const STORE = department.storagePrefix ? makeStore(department.storagePrefix) : makeStore('')
  const sharedNs: SharedNamespace = { sharedKey: department.sharedKey, channelName: department.channelName }

  const [kpis, setKpis] = useState<KPI[]>(() => {
    const saved = load<KPI[] | null>(STORE.kpis, null)
    const settings = load<SettingsStore>(STORE.settings, {})
    const deletedIds = new Set<string>(load<string[]>(STORE.deleted, []))
    if (saved) {
      const seen = new Set<string>()
      return restoreSettings(saved, settings).filter(k => {
        if (deletedIds.has(k.id) || seen.has(k.id)) return false
        seen.add(k.id)
        return true
      })
    }
    const seed = department.key === 'supermercado' ? defaultKPIs : blankKPIs(defaultKPIs)
    return seed.map(applyCalc)
  })
  const metasByPeriodRef = useRef<MetasByPeriod>(load<MetasByPeriod>(STORE.metas, {}))

  const [authReady, setAuthReady] = useState(false)
  const [authRevision, setAuthRevision] = useState(0)
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  const [allPeriodData, setAllPeriodData] = useState<AllLojaData>(() =>
    normalizePeriodData(load<unknown>(STORE.periodData, {}))
  )
  const periodDataRef = useRef<AllLojaData>(normalizePeriodData(load<unknown>(STORE.periodData, {})))
  const lojaRef = useRef<string>('todos')

  const [activePeriod, setActivePeriod] = useState<string | null>(() => load(STORE.active, null))
  const [activeTab, setActiveTab] = useState<'painel' | 'evolucao'>('painel')
  const [filters, setFilters] = useState({ oferta: 'todos', loja: 'todos' })
  const [fileNames, setFileNames] = useState<Record<string, string | null>>(() => {
    const saved = load<Record<string, string | null>>(STORE.fileNames, {})
    if (Object.keys(saved).length > 0) return saved
    const legacy = load<string | null>('painel_file_name', null)
    return legacy ? { loja1: legacy } : {}
  })
  const [showAddModal, setShowAddModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [newKPI, setNewKPI] = useState<Partial<KPI>>({ icon: '📊', yoyDir: 'up' })
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null)

  // ── Layout (drag order + column span) per period ───────────────
  const [layouts, setLayouts] = useState<AllLayouts>(() => load(STORE.layout, {}))
  const layoutRef = useRef<AllLayouts>(load(STORE.layout, {}))

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  // Init auth + load shared data + Realtime live sync
  useEffect(() => {
    // Helper to apply incoming shared data to all state slices
    function applyShared(shared: SharedAppData) {
      if (Array.isArray(shared.kpis) && (shared.kpis as KPI[]).length > 0) {
        const savedSettings = (shared.settings as SettingsStore) ?? load<SettingsStore>(STORE.settings, {})
        // Use the editor's deletedIds as authoritative — avoids stale local IDs
        // blocking data that was re-uploaded after a clear
        const sharedDeleted = (shared.deletedIds as string[]) ?? []
        const allDeleted = new Set<string>(sharedDeleted)
        const withSettings = restoreSettings(shared.kpis as KPI[], savedSettings)
        const seen = new Set<string>()
        const filtered = withSettings.filter((k: KPI) => {
          if (allDeleted.has(k.id) || seen.has(k.id)) return false
          seen.add(k.id); return true
        })
        setKpis(filtered)
        save(STORE.kpis, filtered)
      }
      if (shared.periodData) {
        const normalized = normalizePeriodData(shared.periodData)
        periodDataRef.current = normalized
        setAllPeriodData(normalized)
        save(STORE.periodData, normalized)
      }
      if (shared.metas) {
        metasByPeriodRef.current = shared.metas
        save(STORE.metas, shared.metas)
      }
      const selectedPeriod = shared.active ?? load<string | null>(STORE.active, null)
      if (selectedPeriod) switchPeriod(selectedPeriod, periodDataRef.current)
      if (shared.settings) save(STORE.settings, shared.settings)
      if (shared.deletedIds) {
        // Save the editor's deletedIds as the new authoritative list
        save(STORE.deleted, shared.deletedIds)
      }
      if (shared.active !== undefined) {
        setActivePeriod(shared.active)
        save(STORE.active, shared.active)
      }
      if (shared.layout && typeof shared.layout === 'object') {
        const incoming = shared.layout as AllLayouts
        layoutRef.current = incoming
        setLayouts(incoming)
        save(STORE.layout, incoming)
      }
      if (shared.fileNames && Object.keys(shared.fileNames).length > 0) {
        setFileNames(shared.fileNames as Record<string, string | null>)
        save(STORE.fileNames, shared.fileNames)
      } else if (shared.fileName) {
        const fn = { loja1: shared.fileName }
        setFileNames(fn)
        save(STORE.fileNames, fn)
      }
    }

    // Realtime: viewers receive live pushes from editor without page refresh
    let disposed = false
    let unsubSync = () => {}

    async function initialize() {
      await initAuth()
      if (disposed) return
      const user = await getSession(department.key)
      setCurrentUser(user)
      setAuthReady(true)
      if (!user) return
      unsubSync = subscribeToSync(sharedNs, applyShared)
      const shared = await fetchSharedData(sharedNs)
      if (!disposed && shared) applyShared(shared)
    }
    void initialize().catch(() => { if (!disposed) { setCurrentUser(null); setAuthReady(true) } })
    return () => { disposed = true; unsubSync() }  }, [authRevision])

  // ── Period switch ─────────────────────────────────────────────
  const switchPeriod = useCallback((periodLabel: string, data: AllLojaData, lojaOverride?: string) => {
    const lojaFilter = lojaOverride ?? lojaRef.current
    const lojaData = getLojaData(data, lojaFilter)

    const resolvedKey =
      (lojaData[periodLabel] !== undefined ? periodLabel : null) ??
      Object.keys(lojaData).find(k => k.toLowerCase() === periodLabel.toLowerCase()) ??
      Object.keys(lojaData).find(k =>
        k.toLowerCase().replace(/[^a-z0-9]/g, '').startsWith(
          periodLabel.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)
        )
      ) ??
      periodLabel

    const periodRows = lojaData[resolvedKey] ?? {}
    const savedSettings = load<SettingsStore>(STORE.settings, {})
    const deletedIds = new Set<string>(load<string[]>(STORE.deleted, []))

    setKpis(prev => {
      const withoutSheet = prev.filter(k => !k.id.startsWith('sheet_'))
      const updated = applyPeriodToKPIs(blankKPIs(withoutSheet), periodRows, deletedIds)
      const withSettings = restoreSettings(updated, savedSettings)
      const withMetas = restorePeriodMetas(withSettings, metasByPeriodRef.current, periodLabel, lojaFilter)
      save(STORE.kpis, withMetas)

      return withMetas
    })
    setActivePeriod(periodLabel)
    save(STORE.active, periodLabel)
  }, [])

  const handleLojaChange = (loja: string) => {
    lojaRef.current = loja
    setFilters(f => ({ ...f, loja }))
    if (activePeriod) switchPeriod(activePeriod, periodDataRef.current, loja)
  }

  // ── KPI mutations ─────────────────────────────────────────────
  const updateKPI = (updated: KPI, prevMeta?: string) => {
    if (activePeriod && prevMeta !== undefined && prevMeta !== updated.meta) {
      metasByPeriodRef.current = savePeriodMeta(
        metasByPeriodRef.current, updated.id, activePeriod, updated.meta, lojaRef.current
      )
      save(STORE.metas, metasByPeriodRef.current)
      pushMetas(sharedNs, metasByPeriodRef.current)
    }
    setKpis(prev => {
      const next = prev.map(k => (k.id === updated.id ? updated : k))
      save(STORE.kpis, next)
      const settings = extractSettings(next)
      save(STORE.settings, settings)
      pushSharedData(sharedNs, { kpis: next, settings })
      return next
    })
  }

  const clearAll = () => {
    setKpis(prev => {
      const cleared = prev.map(k => ({ ...k, value: '', meta: '', yoy: '', yoyDir: 'neutral' as const }))
      save(STORE.kpis, cleared)
      return cleared
    })
    setActivePeriod(null)
    setAllPeriodData({})
    periodDataRef.current = {}
    setFileNames({})
    save(STORE.active, null)
    save(STORE.periodData, {})
    save(STORE.fileNames, {})
    metasByPeriodRef.current = {}
    save(STORE.metas, {})
    save(STORE.deleted, [])
    pushSharedData(sharedNs, { periodData: {}, metas: {}, deletedIds: [], fileNames: {}, active: null })
  }

  const removeKPI = (id: string) => {
    const existing = load<string[]>(STORE.deleted, [])
    const deletedIds = existing.includes(id) ? existing : [...existing, id]
    save(STORE.deleted, deletedIds)
    setKpis(prev => {
      const next = prev.filter(k => k.id !== id)
      save(STORE.kpis, next)
      const settings = extractSettings(next)
      save(STORE.settings, settings)
      pushSharedData(sharedNs, { kpis: next, settings, deletedIds })
      return next
    })
  }

  const confirmDeleteKPI = () => {
    if (!deleteConfirm) return
    removeKPI(deleteConfirm.id)
    setDeleteConfirm(null)
    setDeleteMsg('Indicador removido com sucesso.')
    setTimeout(() => setDeleteMsg(null), 3000)
  }

  const addKPI = () => {
    if (!newKPI.name || !newKPI.value) return
    const base: KPI = {
      id: Date.now().toString(),
      icon: newKPI.icon || '📊',
      name: newKPI.name!,
      value: stripSuffix(newKPI.value!),
      meta: stripSuffix(newKPI.meta || ''),
      metaLabel: newKPI.metaLabel || 'Meta',
      format: detectFormat(newKPI.name!, newKPI.value!),
      yoy: '0%',
      yoyDir: 'neutral',
    }
    const kpi = applyCalc(base)
    setKpis(prev => {
      const next = [...prev, kpi]
      save(STORE.kpis, next)
      const settings = extractSettings(next)
      save(STORE.settings, settings)
      pushSharedData(sharedNs, { kpis: next, settings })
      return next
    })
    setNewKPI({ icon: '📊', yoyDir: 'up' })
    setShowAddModal(false)
  }

  const handleUploadConfirm = (result: UploadResult) => {
    // Supabase upsert already done inside UploadModal — just update local state
    const existing = periodDataRef.current
    let merged: AllLojaData
    const newFileNames = { ...fileNames }
    let focusStore: LojaKey

    if (result.multiLojaData && Object.keys(result.multiLojaData).length > 0) {
      merged = { ...existing }
      for (const [lojaKey, lojaData] of Object.entries(result.multiLojaData)) {
        const k = lojaKey as LojaKey
        merged[k] = { ...(existing[k] ?? {}), ...lojaData }
        newFileNames[k] = result.fileName
      }
      focusStore = (Object.keys(result.multiLojaData)[0] as LojaKey) ?? 'loja1'
    } else {
      const store = result.store === 'unknown' ? 'loja1' : result.store
      merged = { ...existing, [store]: { ...(existing[store] ?? {}), ...result.periodData } }
      newFileNames[store] = result.fileName
      focusStore = store
    }

    periodDataRef.current = merged
    setAllPeriodData(merged)
    setFileNames(newFileNames)
    setShowUploadModal(false)
    save(STORE.periodData, merged)
    save(STORE.fileNames, newFileNames)

    lojaRef.current = focusStore
    setFilters(f => ({ ...f, loja: focusStore }))

    // Compute KPIs synchronously for the last uploaded period
    // (avoids the race condition of two concurrent pushSharedData calls)
    const lastPeriod = result.periods[result.periods.length - 1]?.label
    const targetPeriod = lastPeriod ?? activePeriod
    const lojaData = getLojaData(merged, focusStore)
    const periodRows = (targetPeriod ? lojaData[targetPeriod] : null) ?? {}
    const deletedIds = new Set<string>(load<string[]>(STORE.deleted, []))
    const withoutSheet = kpis.filter(k => !k.id.startsWith('sheet_'))
    const updated = applyPeriodToKPIs(blankKPIs(withoutSheet), periodRows, deletedIds)
    const withSettings = restoreSettings(updated, load<SettingsStore>(STORE.settings, {}))
    const newKpis = targetPeriod
      ? restorePeriodMetas(withSettings, metasByPeriodRef.current, targetPeriod, focusStore)
      : withSettings

    setKpis(newKpis)
    save(STORE.kpis, newKpis)
    if (targetPeriod) {
      setActivePeriod(targetPeriod)
      save(STORE.active, targetPeriod)
    }

    // Single push with the complete new state — no race condition
    pushSharedData(sharedNs, {
      kpis: newKpis,
      periodData: merged,
      metas: metasByPeriodRef.current,
      settings: extractSettings(newKpis),
      deletedIds: load<string[]>(STORE.deleted, []),
      fileNames: newFileNames,
      active: targetPeriod,
    })
  }

  const handlePeriodClick = (label: string) => {
    switchPeriod(label, periodDataRef.current)
  }

  // ── Explicit sync ─────────────────────────────────────────────
  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const loja = lojaRef.current
      if (activePeriod && loja !== 'todos') {
        // 1. Busca dados da tabela indicators
        const storeId = lojaToStoreId(loja, department.storeIdPrefix)
        const period = labelToPeriod(activePeriod)
        const records = await fetchIndicators(storeId, period)

        if (records.length === 0) {
          setSyncMsg({ ok: false, text: `Sem dados para ${LOJA_BADGE[loja] ?? loja} · ${activePeriod}` })
        } else {
          // 2. Monta dataMap com os valores vindos do Supabase
          const dataMap: Record<string, string> = {}
          for (const r of records) {
            if (r.value !== null) dataMap[r.indicator_name] = String(r.value)
          }

          // 3. Calcula os KPIs novos de forma síncrona (sem usar setKpis callback)
          const deletedIds = new Set<string>(load<string[]>(STORE.deleted, []))
          const withoutSheet = kpis.filter(k => !k.id.startsWith('sheet_'))
          const updated = applyPeriodToKPIs(withoutSheet, dataMap, deletedIds)
          const withSettings = restoreSettings(updated, load<SettingsStore>(STORE.settings, {}))
          const newKpis = restorePeriodMetas(withSettings, metasByPeriodRef.current, activePeriod, loja)

          // 4. Aplica localmente
          setKpis(newKpis)
          save(STORE.kpis, newKpis)

          // 5. Pusha para kv_store + broadcast para TODOS os usuários
          //    Inclui os KPIs novos para que viewers vejam o estado atualizado
          await pushSharedDataNow(sharedNs, {
            kpis: newKpis,
            periodData: periodDataRef.current,
            metas: metasByPeriodRef.current,
            settings: extractSettings(newKpis),
            deletedIds: load<string[]>(STORE.deleted, []),
            fileNames,
            active: activePeriod,
          })

          setSyncMsg({ ok: true, text: `${records.length} indicadores sincronizados` })
        }
      } else {
        // loja='todos' ou sem período: não é possível buscar dados específicos do DB
        // Empurrar os kpis atuais poderia sobrescrever dados de outros usuários com defaults
        if (!activePeriod) {
          setSyncMsg({ ok: false, text: 'Selecione um período antes de sincronizar' })
        } else {
          setSyncMsg({ ok: false, text: 'Selecione uma loja específica (Loja 1, 2 ou 3) para sincronizar' })
        }
      }
      setTimeout(() => setSyncMsg(null), 3500)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setSyncMsg({ ok: false, text: `Falha: ${msg}` })
      setTimeout(() => setSyncMsg(null), 5000)
    }
    setSyncing(false)
  }

  // ── Layout handlers (drag order + resize) ────────────────────
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !activePeriod) return
    const cur = layoutRef.current[activePeriod]
    // Build current order (fall back to kpis order if not yet set)
    const base = cur?.order?.length ? cur.order : kpis.map(k => k.id)
    const oldIdx = base.indexOf(String(active.id))
    const newIdx = base.indexOf(String(over.id))
    if (oldIdx === -1 || newIdx === -1) return
    const newOrder = arrayMove([...base], oldIdx, newIdx)
    const newLayouts: AllLayouts = {
      ...layoutRef.current,
      [activePeriod]: { order: newOrder, sizes: cur?.sizes ?? {} },
    }
    layoutRef.current = newLayouts
    setLayouts(newLayouts)
    save(STORE.layout, newLayouts)
    pushSharedData(sharedNs, { layout: newLayouts as Record<string, unknown> })
  }, [activePeriod, kpis])

  const handleResize = useCallback((kpiId: string, newCols: ColSpan) => {
    if (!activePeriod) return
    const cur = layoutRef.current[activePeriod]
    const newLayouts: AllLayouts = {
      ...layoutRef.current,
      [activePeriod]: {
        order: cur?.order ?? kpis.map(k => k.id),
        sizes: { ...(cur?.sizes ?? {}), [kpiId]: { cols: newCols } },
      },
    }
    layoutRef.current = newLayouts
    setLayouts(newLayouts)
    save(STORE.layout, newLayouts)
    pushSharedData(sharedNs, { layout: newLayouts as Record<string, unknown> })
  }, [activePeriod, kpis])

  const handleResetSize = useCallback((kpiId: string) => {
    if (!activePeriod) return
    const cur = layoutRef.current[activePeriod]
    const sizes = { ...(cur?.sizes ?? {}) }
    delete sizes[kpiId]
    const newLayouts: AllLayouts = {
      ...layoutRef.current,
      [activePeriod]: { order: cur?.order ?? kpis.map(k => k.id), sizes },
    }
    layoutRef.current = newLayouts
    setLayouts(newLayouts)
    save(STORE.layout, newLayouts)
    pushSharedData(sharedNs, { layout: newLayouts as Record<string, unknown> })
  }, [activePeriod, kpis])

  // ── Routing guards ────────────────────────────────────────────
  // ── Sorted KPIs for current period ───────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sortedKpis = useMemo(() => {
    const layout = activePeriod ? layouts[activePeriod] : undefined
    const ordered = layout?.order ?? []
    const idMap = new Map(kpis.map(k => [k.id, k]))
    return [
      ...ordered.filter(id => idMap.has(id)).map(id => idMap.get(id)!),
      ...kpis.filter(k => !ordered.includes(k.id)),
    ]
  }, [kpis, activePeriod, layouts])

  if (!authReady) return <LoadingScreen department={department} onDone={() => {}} minimal />
  if (!currentUser) {
    return (
      <LoginPage
        department={department}
        onBack={onSwitchDepartment}
        onLogin={user => { setCurrentUser(user); setAuthRevision(value => value + 1); setLoading(true) }}
      />
    )
  }
  if (loading) return <LoadingScreen department={department} onDone={() => setLoading(false)} />
  if (showProfile) {
    return (
      <ProfilePage department={department}
        currentUser={currentUser}
        onBack={() => setShowProfile(false)}
        onUserUpdate={updated => { setCurrentUser(updated) }}
      />
    )
  }

  const canEdit = currentUser.role === 'editor' || currentUser.role === 'admin'

  const tabs = [
    { key: 'painel',   label: '▦  Painel de Performance' },
    { key: 'evolucao', label: '📈  Evolução de Performance' },
  ]

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div
        className="flex items-center gap-3 px-4 py-2 shrink-0 flex-wrap"
        style={{ background: '#111115', borderBottom: '1px solid var(--border)' }}
      >
        <img src={department.logo} alt={department.name} style={{ height: 28, objectFit: 'contain', flexShrink: 0 }} />
        <span
          className="text-[10px] font-semibold px-2 py-1 rounded shrink-0"
          style={{ background: 'rgba(200,168,75,0.1)', color: 'var(--accent)', border: '1px solid rgba(200,168,75,0.3)' }}
        >
          {department.icon} {department.name}
        </span>

        <div className="flex items-center gap-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as typeof activeTab)}
              className="px-3 py-1.5 text-[11px] font-medium rounded transition-all"
              style={{
                background: activeTab === t.key ? 'var(--accent)' : 'transparent',
                color: activeTab === t.key ? '#111' : 'var(--muted)',
                border: 'none', cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          {/* Period pills */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[9px] uppercase tracking-widest shrink-0 mr-0.5" style={{ color: 'var(--muted)' }}>Período</span>

            {canEdit && (
              <button
                onClick={() => { if (confirm('Limpar todos os valores e metas de todos os meses e lojas?')) clearAll() }}
                className="text-[9px] px-2 py-0.5 rounded shrink-0 transition-all"
                style={{ background: 'rgba(180,60,60,0.12)', color: '#cc5555', border: '1px solid rgba(180,60,60,0.3)', cursor: 'pointer' }}
              >
                ✕ Limpar
              </button>
            )}

            {FIXED_MONTHS.map(p => {
              const loja = filters.loja
              const hasData = loja === 'todos'
                ? (['loja1','loja2','loja3'] as LojaKey[]).some(l => Object.keys(allPeriodData[l]?.[p] ?? {}).length > 0)
                : Object.keys(allPeriodData[loja as LojaKey]?.[p] ?? {}).length > 0
              const isActive = activePeriod === p
              return (
                <button
                  key={p}
                  onClick={() => handlePeriodClick(p)}
                  className="mono text-[10px] font-semibold px-2 py-0.5 rounded transition-all relative"
                  style={{
                    background: isActive ? 'var(--accent)' : hasData ? 'rgba(200,168,75,0.1)' : 'var(--surface2)',
                    color: isActive ? '#111' : hasData ? 'var(--accent)' : 'var(--muted)',
                    border: `1px solid ${isActive ? 'var(--accent)' : hasData ? 'rgba(200,168,75,0.4)' : 'var(--border)'}`,
                    cursor: 'pointer',
                  }}
                >
                  {p}
                  {hasData && !isActive && (
                    <span style={{
                      position: 'absolute', top: -3, right: -3,
                      width: 6, height: 6, borderRadius: '50%',
                      background: 'var(--positive)', border: '1px solid var(--bg)',
                    }} />
                  )}
                </button>
              )
            })}
          </div>

          {/* File name badges */}
          {Object.entries(fileNames).map(([store, name]) =>
            name ? (
              <div key={store} className="flex items-center gap-1 px-2 py-0.5 rounded shrink-0"
                style={{ background: 'rgba(200,168,75,0.08)', border: '1px solid rgba(200,168,75,0.2)' }}>
                <span className="text-[9px] font-bold px-1 rounded" style={{ background: 'rgba(200,168,75,0.2)', color: 'var(--accent)' }}>
                  {LOJA_BADGE[store] ?? store}
                </span>
                <span className="text-[10px] mono truncate max-w-20" style={{ color: 'var(--accent)' }} title={name}>
                  {name}
                </span>
              </div>
            ) : null
          )}

          {/* Delete feedback */}
          {deleteMsg && (
            <span className="text-[10px] px-2 py-0.5 rounded shrink-0"
              style={{ background: 'var(--positive-bg)', color: 'var(--positive)', border: '1px solid var(--positive)' }}
            >
              ✓ {deleteMsg}
            </span>
          )}

          {/* Sync feedback */}
          {syncMsg && (
            <span className="text-[10px] px-2 py-0.5 rounded shrink-0"
              style={{
                background: syncMsg.ok ? 'var(--positive-bg)' : 'var(--negative-bg)',
                color: syncMsg.ok ? 'var(--positive)' : 'var(--negative)',
                border: `1px solid ${syncMsg.ok ? 'var(--positive)' : 'var(--negative)'}`,
              }}
            >
              {syncMsg.ok ? '✓' : '⚠'} {syncMsg.text}
            </span>
          )}

          {/* Sincronizar — editor only */}
          {canEdit && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold transition-all shrink-0"
              style={{
                background: syncing ? 'rgba(80,80,100,0.2)' : 'rgba(60,130,180,0.15)',
                color: syncing ? 'var(--muted)' : '#66aadd',
                border: `1px solid ${syncing ? 'var(--border)' : '#336688'}`,
                cursor: syncing ? 'not-allowed' : 'pointer',
              }}
            >
              {syncing ? '↻ Sincronizando…' : '↻ Sincronizar Dados'}
            </button>
          )}

          {/* Upload — editor only */}
          {canEdit && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold transition-all shrink-0"
              style={{ background: 'rgba(80,120,200,0.15)', color: '#7799ee', border: '1px solid #334488', cursor: 'pointer' }}
            >
              ⬆ Subir Dados
            </button>
          )}

          {/* User */}
          <button
            onClick={() => setShowProfile(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-semibold transition-all shrink-0"
            style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}
          >
            {currentUser.role === 'admin' ? '🛡' : currentUser.role === 'editor' ? '✏️' : '👤'} {currentUser.username}
          </button>

          {/* Trocar painel */}
          <button
            onClick={onSwitchDepartment}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-[10px] transition-all shrink-0"
            style={{ background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
            title="Trocar painel"
          >
            ⇄ Painéis
          </button>

          {/* Logout */}
          <button
            onClick={async () => { try { await logout(); setCurrentUser(null); setAuthRevision(value => value + 1) } catch { alert('Não foi possível sair. Tente novamente.') } }}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-[10px] transition-all shrink-0"
            style={{ background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
            title="Sair"
          >
            ⏻
          </button>
        </div>
      </div>

      {/* Subtitle bar */}
      <div className="px-4 py-1.5 shrink-0 flex items-center gap-3" style={{ background: 'var(--accent)' }}>
        <span className="text-[11px] font-bold tracking-widest uppercase" style={{ color: '#111' }}>
          ◆ Principais Indicadores
        </span>
        {!canEdit && (
          <span className="text-[10px]" style={{ color: 'rgba(0,0,0,0.45)' }}>somente visualização</span>
        )}
      </div>

      {/* Filters */}
      <div
        className="flex items-end gap-4 px-4 py-3 shrink-0 flex-wrap"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
      >
        <FilterSelect label="Oferta" options={FILTER_OPTIONS.oferta} value={filters.oferta} onChange={v => setFilters(f => ({ ...f, oferta: v }))} />
        {department.multiStore && (
          <FilterSelect label="Loja" options={FILTER_OPTIONS.loja} value={filters.loja} onChange={handleLojaChange} />
        )}
        <div className="ml-auto flex items-end gap-2">
          {canEdit && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 rounded text-[11px] font-semibold transition-all"
              style={{ background: 'var(--accent)', color: '#111', border: 'none', cursor: 'pointer' }}
            >
              + Novo Indicador
            </button>
          )}
        </div>
      </div>

      {/* KPI Grid */}
      {activeTab === 'painel' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sortedKpis.map(k => k.id)} strategy={rectSortingStrategy}>
            <div
              className="flex-1 overflow-auto p-4"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: 12,
                alignContent: 'start',
              }}
            >
              {sortedKpis.map(kpi => {
                const periodLayout = activePeriod ? layouts[activePeriod] : undefined
                const cols = (periodLayout?.sizes[kpi.id]?.cols ?? 1) as ColSpan
                return (
                  <SortableCard
                    key={kpi.id}
                    kpi={kpi}
                    cols={cols}
                    onUpdate={updateKPI}
                    onRemove={() => setDeleteConfirm({ id: kpi.id, name: kpi.name })}
                    readOnly={!canEdit}
                    onResize={handleResize}
                    onResetSize={handleResetSize}
                  />
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <EvolucaoPerformance
          kpis={kpis}
          storeIdPrefix={department.storeIdPrefix}
          allPeriodData={allPeriodData}
          activePeriod={activePeriod}
          filters={filters}
        />
      )}

      {/* Bottom legend */}
      <div className="flex items-center gap-6 px-4 py-2 shrink-0" style={{ background: '#111115', borderTop: '1px solid var(--border)' }}>
        <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Legenda</span>
        <div className="flex items-center gap-1.5">
          <YoYBadge value="+" dir="up" />
          <span className="text-[10px]" style={{ color: 'var(--muted)' }}>Acima da meta</span>
        </div>
        <div className="flex items-center gap-1.5">
          <YoYBadge value="−" dir="down" />
          <span className="text-[10px]" style={{ color: 'var(--muted)' }}>Abaixo da meta</span>
        </div>
        <div className="flex items-center gap-1.5">
          <YoYBadge value="●" dir="neutral" />
          <span className="text-[10px]" style={{ color: 'var(--muted)' }}>Neutro</span>
        </div>
        <span className="ml-auto text-[9px]" style={{ color: 'var(--border)' }}>
          {canEdit ? 'Clique em um card para editar · × para remover' : 'Modo visualização — somente leitura'}
        </span>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(null) }}
        >
          <div className="rounded-xl p-6 w-full max-w-xs flex flex-col gap-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>Excluir indicador</span>
              <span className="text-[12px]" style={{ color: 'var(--muted)' }}>
                Tem certeza que deseja excluir este indicador?
              </span>
              <span className="text-[12px] font-semibold mono mt-1 px-2 py-1 rounded"
                style={{ color: 'var(--accent)', background: 'rgba(200,168,75,0.08)', border: '1px solid rgba(200,168,75,0.2)' }}>
                {deleteConfirm.name}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                Esta ação não pode ser desfeita.
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 rounded text-sm"
                style={{ background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeleteKPI}
                className="flex-1 py-2 rounded text-sm font-semibold"
                style={{ background: 'rgba(180,50,50,0.2)', color: '#ee6666', border: '1px solid rgba(180,50,50,0.5)', cursor: 'pointer' }}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && canEdit && (
        <UploadModal
          onClose={() => setShowUploadModal(false)}
          onConfirm={handleUploadConfirm}
          storeIdPrefix={department.storeIdPrefix}
          singleStore={!department.multiStore}
        />
      )}

      {/* Add KPI Modal */}
      {showAddModal && canEdit && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false) }}
        >
          <div className="rounded-xl p-6 w-full max-w-sm"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-bold mb-4" style={{ color: 'var(--accent)' }}>◆ Novo Indicador</h2>
            <div className="flex flex-col gap-3">
              {[
                { label: 'Ícone',             key: 'icon',      placeholder: '📊' },
                { label: 'Nome do Indicador', key: 'name',      placeholder: 'Ex: Receita Bruta (R$)' },
                { label: 'Valor',             key: 'value',     placeholder: 'Ex: 383.846' },
                { label: 'Label da Meta',     key: 'metaLabel', placeholder: 'Meta' },
                { label: 'Valor da Meta',     key: 'meta',      placeholder: 'Ex: 300.000' },
              ].map(f => (
                <div key={f.key} className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{f.label}</label>
                  <input
                    className="rounded px-3 py-2 text-sm border"
                    style={{ background: 'var(--surface2)', color: 'var(--text)', borderColor: 'var(--border)' }}
                    placeholder={f.placeholder}
                    value={(newKPI as Record<string, string>)[f.key] ?? ''}
                    onChange={e => setNewKPI(prev => ({ ...prev, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
              <p className="text-[10px]" style={{ color: 'var(--muted)' }}>
                ✦ O % vs Meta é calculado automaticamente.
              </p>
              <div className="flex gap-2 mt-2">
                <button onClick={() => setShowAddModal(false)} className="flex-1 py-2 rounded text-sm"
                  style={{ background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button onClick={addKPI} className="flex-1 py-2 rounded text-sm font-semibold"
                  style={{ background: 'var(--accent)', color: '#111', border: 'none', cursor: 'pointer' }}>
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
