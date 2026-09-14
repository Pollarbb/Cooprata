import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { fetchIndicatorsForStore } from '../utils/supabaseClient'

// ─── Constants ────────────────────────────────────────────────────
const PERIODS = [
  { db: '2026-01', label: 'jan/26' }, { db: '2026-02', label: 'fev/26' },
  { db: '2026-03', label: 'mar/26' }, { db: '2026-04', label: 'abr/26' },
  { db: '2026-05', label: 'mai/26' }, { db: '2026-06', label: 'jun/26' },
  { db: '2026-07', label: 'jul/26' }, { db: '2026-08', label: 'ago/26' },
  { db: '2026-09', label: 'set/26' }, { db: '2026-10', label: 'out/26' },
  { db: '2026-11', label: 'nov/26' }, { db: '2026-12', label: 'dez/26' },
]
const LABEL_TO_DB: Record<string, string> = Object.fromEntries(PERIODS.map(p => [p.label, p.db]))
const LOJAS_MAP: Record<string, string> = { loja1: 'L1', loja2: 'L2', loja3: 'L3' }

const SUMMARY_KEYS = [
  { keys: ['faturamento'], label: 'Faturamento', icon: '💰' },
  { keys: ['margem bruta', 'margembruta'], label: 'Margem Bruta', icon: '📊' },
  { keys: ['lucro liquido', 'lucroliquido', 'lucro líquido'], label: 'Lucro Líquido', icon: '🏆' },
  { keys: ['ticket medio', 'ticketmedio', 'ticket médio'], label: 'Ticket Médio', icon: '🎫' },
]

const GAUGE_KEYS = [
  { keys: ['faturamento'], label: 'Faturamento' },
  { keys: ['margem bruta', 'margembruta'], label: 'Margem Bruta' },
  { keys: ['lucro liquido', 'lucroliquido'], label: 'Lucro Líquido' },
]

const CAROUSEL_MS = 30_000
const CURSOR_HIDE_MS = 5_000
const REFRESH_MS = 60_000

// ─── Types ────────────────────────────────────────────────────────
type DBData = Record<string, Record<string, number>>

interface KPIItem {
  id: string; name: string; value: string; meta: string
  format: 'currency' | 'percent' | 'number'
  yoy: string; yoyDir: 'up' | 'down' | 'neutral'; icon: string
}

export interface EvolucaoProps {
  storeIdPrefix: string
  kpis: KPIItem[]
  allPeriodData: Partial<Record<'loja1' | 'loja2' | 'loja3', Record<string, Record<string, string>>>>
  activePeriod: string | null
  filters: { loja: string; oferta: string }
}

// ─── Utilities ────────────────────────────────────────────────────
function parseBR(s: string | undefined | null): number {
  if (!s) return 0
  const raw = String(s).replace(/[^\d,.-]/g, '')
  if (!raw || raw === '-') return 0
  let cleaned: string
  if (raw.includes(',')) {
    cleaned = raw.replace(/\./g, '').replace(',', '.')
  } else {
    const parts = raw.split('.')
    if (parts.length === 1) {
      cleaned = raw
    } else if (parts.length >= 3) {
      cleaned = parts.join('')
    } else {
      cleaned = (parts[1]?.length === 3) ? parts.join('') : raw
    }
  }
  return parseFloat(cleaned) || 0
}

function fmtShort(n: number): string {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}k`
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

const normStr = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]/g, '')

function findKpi(kpis: KPIItem[], keys: string[]): KPIItem | undefined {
  return kpis.find(k => keys.some(key => normStr(k.name).includes(normStr(key))))
}

function findInPeriod(period: Record<string, number>, name: string): number {
  const target = normStr(name)
  const entry = Object.entries(period).find(([k]) => normStr(k).includes(target))
  return entry ? entry[1] : 0
}

function gaugeColor(pct: number): string {
  return pct >= 80 ? '#4caf50' : pct >= 50 ? '#ffc107' : '#f44336'
}

// ─── useCountUp ───────────────────────────────────────────────────
function useCountUp(target: number, trigger: unknown): number {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!isFinite(target)) { setVal(0); return }
    let id: number
    const start = performance.now()
    const step = (ts: number) => {
      const p = Math.min((ts - start) / 1500, 1)
      setVal(target * (1 - Math.pow(1 - p, 3)))
      if (p < 1) id = requestAnimationFrame(step)
    }
    id = requestAnimationFrame(step)
    return () => cancelAnimationFrame(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, trigger])
  return val
}

// ─── useEnterAnim ─────────────────────────────────────────────────
function useEnterAnim(trigger: unknown): number {
  const [prog, setProg] = useState(0)
  useEffect(() => {
    setProg(0)
    let id: number
    const start = performance.now()
    const step = (ts: number) => {
      const p = Math.min((ts - start) / 1500, 1)
      setProg(1 - Math.pow(1 - p, 3))
      if (p < 1) id = requestAnimationFrame(step)
    }
    id = requestAnimationFrame(step)
    return () => cancelAnimationFrame(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger])
  return prog
}

// ─── Sparkline ────────────────────────────────────────────────────
function Sparkline({ data, color = '#ffc107', w = 70, h = 26 }: {
  data: number[]; color?: string; w?: number; h?: number
}) {
  if (data.length < 2) return <div style={{ width: w, height: h }} />
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1
  const pts = data.map((v, i) =>
    `${((i / (data.length - 1)) * w).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`
  ).join(' ')
  return (
    <svg width={w} height={h} style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
    </svg>
  )
}

// ─── GaugeChart ───────────────────────────────────────────────────
function GaugeChart({ pct, label, color, large = false }: {
  pct: number; label: string; color: string; large?: boolean
}) {
  const [anim, setAnim] = useState(0)
  useEffect(() => {
    setAnim(0)
    const tid = setTimeout(() => {
      const target = Math.min(100, Math.max(0, pct))
      const start = performance.now()
      const step = (ts: number) => {
        const p = Math.min((ts - start) / 1500, 1)
        setAnim(target * (1 - Math.pow(1 - p, 3)))
        if (p < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }, 300)
    return () => clearTimeout(tid)
  }, [pct])

  const r = large ? 70 : 56
  const sw = large ? 14 : 11
  const cx = 90, cy = large ? 80 : 68
  const arc = (deg: number) => ({
    x: cx + r * Math.cos((deg * Math.PI) / 180),
    y: cy + r * Math.sin((deg * Math.PI) / 180),
  })
  const S = arc(180), E = arc(0), F = arc(180 + anim * 1.8)
  const bg = `M${S.x.toFixed(1)} ${S.y.toFixed(1)} A${r} ${r} 0 0 1 ${E.x.toFixed(1)} ${E.y.toFixed(1)}`
  const fg = anim > 0
    ? `M${S.x.toFixed(1)} ${S.y.toFixed(1)} A${r} ${r} 0 0 1 ${F.x.toFixed(1)} ${F.y.toFixed(1)}`
    : ''
  const vbH = cy + Math.ceil(r * 0.25) + sw + 14

  return (
    <svg viewBox={`0 0 180 ${vbH}`} style={{ width: '100%', height: '100%' }}>
      <path d={bg} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={sw} strokeLinecap="round" />
      {fg && <path d={fg} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />}
      <text x={cx} y={cy - (large ? 13 : 10)} textAnchor="middle"
        fill="white" fontSize={large ? 26 : 21} fontWeight="bold" fontFamily="monospace">
        {anim.toFixed(0)}%
      </text>
      <text x={cx} y={cy + (large ? 4 : 3)} textAnchor="middle"
        fill="#777" fontSize={large ? 11 : 9} fontFamily="system-ui">
        {label}
      </text>
    </svg>
  )
}

// ─── SummaryCard ──────────────────────────────────────────────────
function SummaryCard({ kpi, sparkData, tv, trigger }: {
  kpi: KPIItem; sparkData: number[]; tv: boolean; trigger: unknown
}) {
  const raw = parseBR(kpi.value)
  const anim = useCountUp(raw, trigger)
  const fmt = kpi.format

  const valueStr = fmt === 'currency'
    ? `R$ ${anim.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : fmt === 'percent'
    ? `${anim.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
    : anim.toLocaleString('pt-BR', { maximumFractionDigits: 0 })

  const c = kpi.yoyDir === 'up' ? '#4caf50' : kpi.yoyDir === 'down' ? '#f44336' : '#2196f3'
  const arrow = kpi.yoyDir === 'up' ? '▲' : kpi.yoyDir === 'down' ? '▼' : '●'

  return (
    <div style={{
      background: '#1e2026',
      border: '1px solid rgba(255,193,7,0.16)',
      borderRadius: 12,
      padding: tv ? '18px 16px' : '11px 13px',
      display: 'flex', flexDirection: 'column', gap: 5,
      minHeight: tv ? 158 : 108,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: tv ? 17 : 13 }}>{kpi.icon}</span>
        <span style={{
          color: '#777', fontSize: tv ? 11 : 9,
          fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>{kpi.name}</span>
      </div>
      <div style={{
        color: '#ffc107', fontSize: tv ? 28 : 18,
        fontWeight: 800, fontFamily: 'monospace', lineHeight: 1.1, flex: 1, wordBreak: 'break-all',
      }}>
        {kpi.value
          ? valueStr
          : <span style={{ color: '#333', fontSize: tv ? 18 : 13 }}>—</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {kpi.yoy && <>
            <span style={{ color: c, fontSize: tv ? 11 : 9, fontWeight: 700 }}>{arrow}</span>
            <span style={{ color: c, fontSize: tv ? 11 : 9, fontFamily: 'monospace' }}>{kpi.yoy}</span>
            <span style={{ color: '#333', fontSize: 8 }}>vs meta</span>
          </>}
        </div>
        <Sparkline data={sparkData} w={tv ? 90 : 65} h={tv ? 32 : 24} />
      </div>
    </div>
  )
}

// ─── NoData ───────────────────────────────────────────────────────
function NoData() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2a2a2a', fontSize: 12 }}>
      sem dados
    </div>
  )
}

// ─── SVGLineChart ─────────────────────────────────────────────────
interface LineDS { label: string; data: (number | null)[]; color: string; fill?: boolean; dashed?: boolean }

function SVGLineChart({ labels, datasets, trigger }: {
  labels: string[]; datasets: LineDS[]; trigger?: unknown
}) {
  const prog = useEnterAnim(trigger)
  const VW = 720, VH = 200, PL = 68, PR = 20, PT = 16, PB = 32
  const iW = VW - PL - PR, iH = VH - PT - PB

  const allVals = datasets.flatMap(d => d.data).filter((v): v is number => v !== null)
  if (allVals.length === 0) return <NoData />

  const lo = Math.min(...allVals) * 0.9
  const hi = Math.max(...allVals) * 1.1
  const n = labels.length

  const cx = (i: number) => PL + (n <= 1 ? iW / 2 : (i / (n - 1)) * iW)
  const cy = (v: number) => PT + iH * (1 - (v - lo) / (hi - lo || 1))
  const yTicks = Array.from({ length: 5 }, (_, i) => lo + (i / 4) * (hi - lo))

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', height: '100%' }}>
      <defs>
        <clipPath id="lc-anim">
          <rect x={PL} y={0} width={iW * prog} height={VH} />
        </clipPath>
      </defs>
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PL} y1={cy(v)} x2={PL + iW} y2={cy(v)}
            stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
          <text x={PL - 6} y={cy(v)} textAnchor="end" dominantBaseline="middle"
            fill="#444" fontSize={10} fontFamily="monospace">
            {fmtShort(v)}
          </text>
        </g>
      ))}
      {labels.map((l, i) => (
        <text key={i} x={cx(i)} y={VH - 8} textAnchor="middle" fill="#444" fontSize={10}>{l}</text>
      ))}
      <line x1={PL} y1={PT} x2={PL} y2={PT + iH} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      <line x1={PL} y1={PT + iH} x2={PL + iW} y2={PT + iH} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      {datasets.map((ds, di) => {
        const pts = ds.data
          .map((v, i) => v !== null ? { x: cx(i), y: cy(v), v, i } : null)
          .filter((p): p is { x: number; y: number; v: number; i: number } => p !== null)
        if (pts.length < 1) return null
        const linePath = pts.map((p, j) => `${j ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('')
        const fillPath = `${linePath}L${pts[pts.length-1].x.toFixed(1)} ${(PT+iH).toFixed(1)}L${pts[0].x.toFixed(1)} ${(PT+iH).toFixed(1)}Z`
        return (
          <g key={di} clipPath="url(#lc-anim)">
            {ds.fill && <path d={fillPath} fill={ds.color} opacity={0.09} />}
            <path d={linePath} fill="none" stroke={ds.color} strokeWidth={2.5}
              strokeDasharray={ds.dashed ? '8 4' : undefined}
              strokeLinecap="round" strokeLinejoin="round" />
            {!ds.dashed && pts.map(p => (
              <circle key={p.i} cx={p.x} cy={p.y} r={4.5}
                fill={p.v >= (ds.dashed ? 0 : p.v) ? ds.color : ds.color}
                stroke="#131316" strokeWidth={1.5} />
            ))}
          </g>
        )
      })}
      {datasets.map((ds, i) => (
        <g key={i} transform={`translate(${PL + 10 + i * 150} 3)`}>
          <line x1={0} y1={5} x2={16} y2={5} stroke={ds.color} strokeWidth={2.5}
            strokeDasharray={ds.dashed ? '6 3' : undefined} />
          <text x={20} y={9} fill="#666" fontSize={10}>{ds.label}</text>
        </g>
      ))}
    </svg>
  )
}

// ─── SVGBarChart ──────────────────────────────────────────────────
interface BarDS { label: string; data: number[]; color: string }

function SVGBarChart({ labels, datasets, trigger }: {
  labels: string[]; datasets: BarDS[]; trigger?: unknown
}) {
  const prog = useEnterAnim(trigger)
  const VW = 720, VH = 200, PL = 68, PR = 16, PT = 16, PB = 34
  const iW = VW - PL - PR, iH = VH - PT - PB

  const allVals = datasets.flatMap(d => d.data).filter(v => v > 0)
  if (allVals.length === 0) return <NoData />

  const maxV = Math.max(...allVals) * 1.1
  const N = labels.length, M = datasets.length
  const groupW = N > 0 ? iW / N : iW
  const barW = Math.max(2, (groupW * 0.8) / M)
  const yTicks = Array.from({ length: 5 }, (_, i) => (i / 4) * maxV)
  const bottom = PT + iH

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', height: '100%' }}>
      {yTicks.map((v, i) => {
        const y = bottom - (v / maxV) * iH
        return (
          <g key={i}>
            <line x1={PL} y1={y} x2={PL + iW} y2={y}
              stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
            <text x={PL - 6} y={y} textAnchor="end" dominantBaseline="middle"
              fill="#444" fontSize={10} fontFamily="monospace">
              {fmtShort(v)}
            </text>
          </g>
        )
      })}
      <line x1={PL} y1={PT} x2={PL} y2={bottom} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      <line x1={PL} y1={bottom} x2={PL + iW} y2={bottom} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      {labels.map((label, li) => {
        const groupX = PL + li * groupW + groupW * 0.1
        return (
          <g key={li}>
            {datasets.map((ds, di) => {
              const v = ds.data[li] ?? 0
              const animH = (v / maxV) * iH * prog
              const bx = groupX + di * (barW + 2)
              return (
                <rect key={di} x={bx} y={bottom - animH}
                  width={barW} height={animH}
                  fill={ds.color} opacity={0.78} rx={2} />
              )
            })}
            <text x={groupX + (M * (barW + 2)) / 2} y={VH - 8}
              textAnchor="middle" fill="#444" fontSize={9}>
              {label}
            </text>
          </g>
        )
      })}
      {datasets.map((ds, i) => (
        <g key={i} transform={`translate(${PL + 10 + i * 150} 3)`}>
          <rect x={0} y={0} width={14} height={10} fill={ds.color} opacity={0.78} rx={2} />
          <text x={18} y={9} fill="#666" fontSize={10}>{ds.label}</text>
        </g>
      ))}
    </svg>
  )
}

// ─── SVGHBarChart ─────────────────────────────────────────────────
function SVGHBarChart({ labels, realizados, metas, colors, trigger }: {
  labels: string[]; realizados: number[]; metas: number[]
  colors: string[]; trigger?: unknown
}) {
  const prog = useEnterAnim(trigger)
  const N = labels.length
  if (N === 0) return <NoData />

  const VW = 720
  const rowH = 32
  const PL = 150, PR = 20, PT = 20, PB = 28
  const VH = PT + N * rowH + PB
  const iW = VW - PL - PR

  const maxV = Math.max(...realizados, ...metas) * 1.1 || 1
  const xTicks = Array.from({ length: 5 }, (_, i) => (i / 4) * maxV)

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', height: '100%' }}>
      {xTicks.map((v, i) => {
        const x = PL + (v / maxV) * iW
        return (
          <g key={i}>
            <line x1={x} y1={PT - 4} x2={x} y2={PT + N * rowH}
              stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
            <text x={x} y={VH - 8} textAnchor="middle" fill="#444" fontSize={9} fontFamily="monospace">
              {fmtShort(v)}
            </text>
          </g>
        )
      })}
      <line x1={PL} y1={PT - 4} x2={PL} y2={PT + N * rowH} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      {labels.map((label, i) => {
        const rowY = PT + i * rowH
        const rW = (realizados[i] / maxV) * iW * prog
        const mW = (metas[i] / maxV) * iW * prog
        const c = colors[i] ?? '#ffc107'
        return (
          <g key={i}>
            <text x={PL - 6} y={rowY + rowH * 0.5} textAnchor="end"
              dominantBaseline="middle" fill="#aaa" fontSize={9.5}>
              {label.length > 22 ? label.slice(0, 20) + '…' : label}
            </text>
            {metas[i] > 0 && (
              <rect x={PL} y={rowY + rowH * 0.15} width={mW} height={rowH * 0.35}
                fill="rgba(255,255,255,0.1)" rx={2} />
            )}
            <rect x={PL} y={rowY + (metas[i] > 0 ? rowH * 0.52 : rowH * 0.25)}
              width={rW} height={rowH * (metas[i] > 0 ? 0.33 : 0.5)}
              fill={c} opacity={0.82} rx={2} />
          </g>
        )
      })}
      <g transform={`translate(${PL + 10} 4)`}>
        <rect x={0} y={0} width={14} height={8} fill="rgba(255,255,255,0.1)" rx={2} />
        <text x={18} y={7} fill="#666" fontSize={10}>Meta</text>
      </g>
      <g transform={`translate(${PL + 80} 4)`}>
        <rect x={0} y={0} width={14} height={8} fill="#4caf50" opacity={0.82} rx={2} />
        <text x={18} y={7} fill="#666" fontSize={10}>Realizado</text>
      </g>
    </svg>
  )
}

// ─── Main component ───────────────────────────────────────────────
export default function EvolucaoPerformance({ kpis, allPeriodData, activePeriod, filters, storeIdPrefix }: EvolucaoProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [dbData, setDbData] = useState<DBData>({})
  const [loadingDB, setLoadingDB] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [slide, setSlide] = useState(0)
  const [cursorVisible, setCursorVisible] = useState(true)
  const [animTrigger, setAnimTrigger] = useState(0)

  const storeId = filters.loja !== 'todos' ? (LOJAS_MAP[filters.loja] ?? 'L1') : 'todos'

  // ── Fetch from Supabase ───────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const records = (await Promise.all((storeId === 'todos' ? Object.values(LOJAS_MAP) : [storeId]).map(id => fetchIndicatorsForStore(storeIdPrefix + id)))).flat()
      const grouped: DBData = {}
      for (const r of records) {
        if (!grouped[r.period]) grouped[r.period] = {}
        if (r.value !== null) grouped[r.period][r.indicator_name] = (grouped[r.period][r.indicator_name] ?? 0) + r.value
      }
      setDbData(grouped)
      setLastRefresh(new Date())
      setAnimTrigger(t => t + 1)
    } catch (e) {
      console.warn('[Evolucao] fetch failed:', e)
    } finally {
      setLoadingDB(false)
    }
  }, [storeId, storeIdPrefix])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    const id = setInterval(fetchData, REFRESH_MS)
    return () => clearInterval(id)
  }, [fetchData])

  // ── Fallback: allPeriodData → DBData ──────────────────────────
  const combinedData = useMemo<DBData>(() => {
    if (Object.keys(dbData).length > 0) return dbData
    const lojaKey = filters.loja as keyof typeof allPeriodData
    const lojaData = filters.loja === 'todos'
      ? Object.values(allPeriodData).reduce<Record<string, Record<string, string>>>((total, periods) => {
          for (const [period, rows] of Object.entries(periods ?? {})) {
            const target = total[period] ??= {}
            for (const [name, value] of Object.entries(rows)) target[name] = String(parseBR(target[name]) + parseBR(value)).replace('.', ',')
          }
          return total
        }, {})
      : allPeriodData[lojaKey] ?? {}
    const result: DBData = {}
    for (const p of PERIODS) {
      const pd = lojaData[p.label]
      if (pd) {
        result[p.db] = {}
        for (const [name, val] of Object.entries(pd)) {
          const n = parseBR(val)
          if (n !== 0) result[p.db][name] = n
        }
      }
    }
    return result
  }, [dbData, allPeriodData, filters.loja])

  // ── Fullscreen ────────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])

  // ── Carousel ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isFullscreen) { setSlide(0); return }
    const id = setInterval(() => setSlide(s => (s + 1) % 4), CAROUSEL_MS)
    return () => clearInterval(id)
  }, [isFullscreen])

  // ── Cursor hide ───────────────────────────────────────────────
  const showCursor = useCallback(() => {
    setCursorVisible(true)
    if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current)
    if (isFullscreen) {
      cursorTimerRef.current = setTimeout(() => setCursorVisible(false), CURSOR_HIDE_MS)
    }
  }, [isFullscreen])

  useEffect(() => {
    window.addEventListener('mousemove', showCursor)
    if (isFullscreen) showCursor()
    else { setCursorVisible(true); if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current) }
    return () => {
      window.removeEventListener('mousemove', showCursor)
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current)
    }
  }, [isFullscreen, showCursor])

  // ── Derived chart data ────────────────────────────────────────
  const periodsWithData = useMemo(() =>
    PERIODS.filter(p => Object.keys(combinedData[p.db] ?? {}).length > 0),
    [combinedData]
  )

  const activePeriodDB = activePeriod ? (LABEL_TO_DB[activePeriod] ?? null) : null

  const lineLabels = periodsWithData.map(p => p.label)

  const lineFatData = useMemo(() =>
    periodsWithData.map(p => findInPeriod(combinedData[p.db] ?? {}, 'faturamento') || null),
    [combinedData, periodsWithData]
  )

  const metaKpiFat = useMemo(() => findKpi(kpis, ['faturamento']), [kpis])
  const metaFatVal = metaKpiFat ? parseBR(metaKpiFat.meta) : 0

  const lineDatasets = useMemo((): LineDS[] => [
    {
      label: 'Faturamento Real', data: lineFatData,
      color: '#ffc107', fill: true,
    },
    ...(metaFatVal > 0 ? [{
      label: 'Meta',
      data: periodsWithData.map(() => metaFatVal),
      color: 'rgba(255,255,255,0.45)', fill: false, dashed: true,
    }] : []),
  ], [lineFatData, metaFatVal, periodsWithData])

  const barDatasets = useMemo((): BarDS[] => {
    const candidates = [
      { name: 'Faturamento', color: '#ffc107' },
      { name: 'Lucro Bruto', color: '#4caf50' },
      { name: 'Lucro Liquido', color: '#2196f3' },
    ]
    return candidates
      .filter(c => periodsWithData.some(p => findInPeriod(combinedData[p.db] ?? {}, c.name) > 0))
      .map(c => ({
        label: c.name,
        color: c.color,
        data: periodsWithData.map(p => findInPeriod(combinedData[p.db] ?? {}, c.name)),
      }))
  }, [combinedData, periodsWithData])

  const hbarItems = useMemo(() =>
    kpis.filter(k => k.meta && parseBR(k.meta) > 0 && parseBR(k.value) > 0).slice(0, 8),
    [kpis]
  )

  const hbarRealizados = hbarItems.map(k => parseBR(k.value))
  const hbarMetas = hbarItems.map(k => parseBR(k.meta))
  const hbarColors = hbarItems.map(k =>
    parseBR(k.value) >= parseBR(k.meta) ? '#4caf50' : '#f44336'
  )

  const summaryKpis = useMemo(() =>
    SUMMARY_KEYS.map(sk => findKpi(kpis, sk.keys) ?? {
      id: sk.label, name: sk.label, value: '', meta: '',
      format: 'currency' as const, yoy: '', yoyDir: 'neutral' as const, icon: sk.icon,
    }),
    [kpis]
  )

  const sparkData = useMemo(() =>
    SUMMARY_KEYS.map(sk =>
      periodsWithData.map(p => findInPeriod(combinedData[p.db] ?? {}, sk.keys[0])).filter(v => v > 0)
    ),
    [combinedData, periodsWithData]
  )

  const gauges = useMemo(() =>
    GAUGE_KEYS.map(gk => {
      const kpi = findKpi(kpis, gk.keys)
      if (!kpi) return { label: gk.label, pct: 0 }
      const v = parseBR(kpi.value), m = parseBR(kpi.meta)
      return { label: gk.label, pct: m > 0 ? Math.round((v / m) * 100) : 0 }
    }),
    [kpis]
  )

  const tv = isFullscreen
  const noData = periodsWithData.length === 0 && kpis.every(k => !k.value)

  // ── Chart helpers (no hooks — pure JSX) ──────────────────────
  const CardsRow = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: tv ? 14 : 10 }}>
      {summaryKpis.map((k, i) => (
        <SummaryCard key={k.id} kpi={k} sparkData={sparkData[i] ?? []} tv={tv} trigger={animTrigger} />
      ))}
    </div>
  )

  const LineSection = ({ h }: { h: number | string }) => (
    <div style={{ background: '#1a1c22', borderRadius: 12, padding: tv ? '16px 18px' : '11px 14px', height: h, display: 'flex', flexDirection: 'column' }}>
      <div style={{ color: '#ffc107', fontWeight: 700, fontSize: tv ? 14 : 11, marginBottom: 8 }}>
        📈 Faturamento — Evolução Mensal
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <SVGLineChart labels={lineLabels} datasets={lineDatasets} trigger={animTrigger} />
      </div>
    </div>
  )

  const BarSection = ({ h }: { h: number | string }) => (
    <div style={{ background: '#1a1c22', borderRadius: 12, padding: tv ? '16px 18px' : '11px 14px', height: h, display: 'flex', flexDirection: 'column' }}>
      <div style={{ color: '#ffc107', fontWeight: 700, fontSize: tv ? 14 : 11, marginBottom: 8 }}>
        📊 Comparativo por Mês
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <SVGBarChart labels={lineLabels} datasets={barDatasets} trigger={animTrigger} />
      </div>
    </div>
  )

  const HBarSection = ({ h }: { h: number | string }) => (
    <div style={{ background: '#1a1c22', borderRadius: 12, padding: tv ? '16px 18px' : '11px 14px', height: h, display: 'flex', flexDirection: 'column' }}>
      <div style={{ color: '#ffc107', fontWeight: 700, fontSize: tv ? 14 : 11, marginBottom: 8 }}>
        🎯 Meta vs Realizado
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {hbarItems.length > 0
          ? <SVGHBarChart
              labels={hbarItems.map(k => k.name)}
              realizados={hbarRealizados}
              metas={hbarMetas}
              colors={hbarColors}
              trigger={animTrigger}
            />
          : <NoData />}
      </div>
    </div>
  )

  const GaugesRow = ({ large }: { large: boolean }) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: tv ? 14 : 10 }}>
      {gauges.map(g => (
        <div key={g.label} style={{
          background: '#1a1c22',
          border: `1px solid ${gaugeColor(g.pct)}1a`,
          borderRadius: 12,
          padding: tv ? '22px 14px' : '12px 10px',
          aspectRatio: '1.6',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: '100%', height: '100%' }}>
            <GaugeChart pct={g.pct} label={g.label} color={gaugeColor(g.pct)} large={large} />
          </div>
        </div>
      ))}
    </div>
  )

  // ── Fullscreen carousel slides ────────────────────────────────
  if (isFullscreen) {
    const slides = [
      // Slide 0: cards + line
      <div key="s0" style={{ display: 'flex', flexDirection: 'column', gap: 18, height: '100%' }}>
        <CardsRow />
        <div style={{ flex: 1, minHeight: 0 }}><LineSection h="100%" /></div>
      </div>,
      // Slide 1: bar + hbar
      <div key="s1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, height: '100%' }}>
        <BarSection h="100%" />
        <HBarSection h="100%" />
      </div>,
      // Slide 2: gauges
      <div key="s2" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
        <div style={{ color: '#ffc107', fontWeight: 700, fontSize: 20 }}>⊙ Atingimento de Metas</div>
        <div style={{ width: '100%', maxWidth: 860 }}><GaugesRow large /></div>
      </div>,
      // Slide 3: 2×2 overview
      <div key="s3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 14, height: '100%' }}>
        <LineSection h="100%" />
        <BarSection h="100%" />
        <HBarSection h="100%" />
        <div style={{ background: '#1a1c22', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ color: '#ffc107', fontWeight: 700, fontSize: 11, marginBottom: 8 }}>⊙ Metas</div>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
            {gauges.map(g => (
              <div key={g.label} style={{ width: '30%', aspectRatio: '1.5' }}>
                <GaugeChart pct={g.pct} label={g.label} color={gaugeColor(g.pct)} />
              </div>
            ))}
          </div>
        </div>
      </div>,
    ]

    return (
      <div
        ref={containerRef}
        style={{
          position: 'fixed', inset: 0,
          background: '#131316', color: '#fff',
          display: 'flex', flexDirection: 'column',
          cursor: cursorVisible ? 'default' : 'none',
          zIndex: 9999,
        }}
      >
        <button
          onClick={toggleFullscreen}
          style={{
            position: 'absolute', top: 18, right: 22, zIndex: 10,
            background: 'rgba(0,0,0,0.55)',
            border: '1px solid rgba(255,193,7,0.3)',
            color: '#ffc107', borderRadius: 8,
            padding: '7px 14px', fontSize: 13, cursor: 'pointer',
            opacity: cursorVisible ? 1 : 0, transition: 'opacity 0.4s',
          }}
        >
          ✕ Sair
        </button>

        <div style={{ flex: 1, padding: '26px 34px 12px', position: 'relative', minHeight: 0 }}>
          {slides.map((s, i) => (
            <div
              key={i}
              style={{
                position: 'absolute', inset: '26px 34px 12px',
                opacity: i === slide ? 1 : 0,
                transition: 'opacity 0.8s ease',
                pointerEvents: i === slide ? 'auto' : 'none',
              }}
            >
              {s}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 0 18px' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
              style={{
                width: i === slide ? 24 : 8, height: 8,
                borderRadius: 4, border: 'none',
                background: i === slide ? '#ffc107' : 'rgba(255,255,255,0.15)',
                cursor: 'pointer', transition: 'all 0.35s', padding: 0,
              }}
            />
          ))}
          {lastRefresh && (
            <span style={{ color: '#2a2a2a', fontSize: 11, marginLeft: 18 }}>
              ⟳ {lastRefresh.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>
    )
  }

  // ── Normal mode ───────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{
        flex: 1, background: '#131316', color: '#fff',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      {noData && !loadingDB ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
        }}>
          <span style={{ fontSize: 52 }}>📊</span>
          <span style={{ color: '#777', fontSize: 15, fontWeight: 600 }}>Sem dados para este período</span>
          <span style={{ color: '#333', fontSize: 12, textAlign: 'center', maxWidth: 340, lineHeight: 1.6 }}>
            Use <strong style={{ color: '#ffc107' }}>Subir Dados</strong> no Painel de Performance para importar dados da planilha.
          </span>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
          <CardsRow />
          <LineSection h={220} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
            <BarSection h={220} />
            <HBarSection h={220} />
          </div>
          <GaugesRow large={false} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 4 }}>
            {lastRefresh
              ? <span style={{ color: '#2a2a2a', fontSize: 10 }}>
                  ⟳ Atualizado às {lastRefresh.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              : <span />}
            <button
              onClick={toggleFullscreen}
              style={{
                background: 'rgba(255,193,7,0.08)',
                border: '1px solid rgba(255,193,7,0.22)',
                color: '#ffc107', borderRadius: 6,
                padding: '4px 12px', fontSize: 11, cursor: 'pointer',
              }}
            >
              ⛶ Tela Cheia
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
