import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { upsertIndicators, type IndicatorRecord } from '../utils/supabaseClient'

export type LojaKey = 'loja1' | 'loja2' | 'loja3'

export interface SheetPeriod {
  label: string   // "jan/26"
  colIndex: number
}

export type PeriodData = Record<string, Record<string, string>>

export interface UploadResult {
  fileName: string
  sheetName: string
  periods: SheetPeriod[]
  headerRow: number
  periodData: PeriodData                          // local cache: { "jan/26": { name: value } }
  redRowNames: string[]
  workbook: XLSX.WorkBook
  store: LojaKey | 'unknown'
  multiLojaData?: Partial<Record<LojaKey, PeriodData>>
  detectedSheets?: DetectedSheet[]
  allRecords?: IndicatorRecord[]                  // rows to upsert into indicators table
}

interface DetectedSheet {
  sheetName: string
  storeId: string   // "L1"
  store: LojaKey    // "loja1"
  periods: number
  indicators: number
  records: number
}

interface Props {
  onClose: () => void
  onConfirm: (result: UploadResult) => void
  storeIdPrefix?: string
  singleStore?: boolean
}

// ── Period conversion ─────────────────────────────────────────────
const MONTH_ABBR = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

const MONTH_ALIASES: [string, number][] = [
  ['janeiro',1],['fevereiro',2],['marco',3],['março',3],['abril',4],['maio',5],['junho',6],
  ['julho',7],['agosto',8],['setembro',9],['outubro',10],['novembro',11],['dezembro',12],
  ['january',1],['february',2],['march',3],['april',4],['june',6],
  ['july',7],['august',8],['september',9],['october',10],['november',11],['december',12],
  ['jan',1],['fev',2],['mar',3],['abr',4],['mai',5],['jun',6],
  ['jul',7],['ago',8],['set',9],['out',10],['nov',11],['dez',12],
  ['feb',2],['apr',4],['may',5],['aug',8],['sep',9],['oct',10],['dec',12],
]

/** "2026-01" → "jan/26" */
function periodToLabel(period: string): string {
  const m = period.match(/^(\d{4})-(\d{2})$/)
  if (!m) return period
  const idx = parseInt(m[2], 10) - 1
  if (idx < 0 || idx > 11) return period
  return `${MONTH_ABBR[idx]}/${m[1].slice(-2)}`
}

/** "jan/26" → "2026-01" */
export function labelToPeriod(label: string): string {
  const m = label.match(/^([a-záéíóú]{3})\/(\d{2,4})$/i)
  if (!m) return label
  const idx = MONTH_ABBR.indexOf(m[1].toLowerCase())
  if (idx === -1) return label
  const yearFull = m[2].length === 4 ? m[2] : `20${m[2]}`
  return `${yearFull}-${String(idx + 1).padStart(2, '0')}`
}

// ── Cell helpers ──────────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell) return ''
  if (cell.w && !cell.w.includes('#')) return cell.w.trim()
  if (cell.v !== undefined && cell.v !== null) return String(cell.v).trim()
  return ''
}

/** Parses a numeric string (handles both BR "1.234.567,89" and US "1234567.89") */
function parseNumericString(s: string): number | null {
  const raw = s.replace(/[^\d,.-]/g, '')
  if (!raw || raw === '-') return null
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
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

/** Returns numeric value from a cell, or null if empty / non-numeric.
 *  For percentage cells Excel stores the fraction (0.751 for 75.1%) in cell.v
 *  but displays "75,10%" in cell.w — we always use the display value for %. */
function cellNumericValue(cell: XLSX.CellObject | undefined): number | null {
  if (!cell) return null

  // Percentage cell: extract display value from cell.w ("75,10%" → 75.1)
  if (cell.w && cell.w.includes('%')) {
    return parseNumericString(cell.w.replace('%', ''))
  }

  // Currency/other: raw numeric value is correct
  if (typeof cell.v === 'number') return cell.v

  // String fallback
  if (typeof cell.v === 'string' && cell.v.trim()) {
    return parseNumericString(cell.v)
  }

  return null
}

/** Try to extract "YYYY-MM" from a text string */
function periodFromText(text: string, defaultYear: number): string | null {
  const t = text.trim()
  if (!t || t.includes('#')) return null

  // "YYYY-MM-DD" or "YYYY-MM"
  const isoM = t.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/)
  if (isoM) return `${isoM[1]}-${isoM[2]}`

  // "MM/YYYY"
  const mmyyyy = t.match(/^(\d{1,2})\/(\d{4})$/)
  if (mmyyyy) return `${mmyyyy[2]}-${mmyyyy[1].padStart(2, '0')}`

  // Month name / abbreviation: "jan/26", "janeiro/2026", "jan 26", etc.
  const lower = t.toLowerCase().replace(/[._\-\/\s]+/g, ' ')
  for (const [alias, monthNum] of MONTH_ALIASES) {
    const idx = lower.indexOf(alias)
    if (idx === -1) continue
    // Make sure alias is not part of a longer word
    const before = idx > 0 ? lower[idx - 1] : ' '
    const after = idx + alias.length < lower.length ? lower[idx + alias.length] : ' '
    if (/[a-záéíóúâêîôûãõç]/.test(before) || /[a-záéíóúâêîôûãõç]/.test(after)) continue
    const yearMatch = lower.match(/(\d{2,4})/)
    let year = String(defaultYear)
    if (yearMatch) {
      year = yearMatch[1].length === 4 ? yearMatch[1] : `20${yearMatch[1]}`
    }
    return `${year}-${String(monthNum).padStart(2, '0')}`
  }

  return null
}

/** Extracts a "YYYY-MM" period string from a header cell.
 *  Checks formatted text (cell.w) FIRST to avoid Excel serial off-by-one on Jan. */
function extractPeriodDB(cell: XLSX.CellObject | undefined, defaultYear: number): string | null {
  if (!cell) return null

  // 1. Formatted display text — most reliable for "jan/26" style headers
  if (cell.w) {
    const fromW = periodFromText(cell.w, defaultYear)
    if (fromW) return fromW
  }

  // 2. String value
  if (typeof cell.v === 'string') {
    const fromV = periodFromText(cell.v, defaultYear)
    if (fromV) return fromV
  }

  // 3. Date object
  if (cell.t === 'd' && cell.v instanceof Date) {
    const d = cell.v as Date
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  // 4. Excel date serial (last resort — prone to off-by-one near month boundaries)
  if (typeof cell.v === 'number' && cell.v > 30000 && cell.v < 80000) {
    // Add 12h (0.5 day) to avoid midnight rounding into previous month
    const adjusted = (cell.v > 59 ? cell.v - 1 : cell.v) - 25569 + 0.5
    const d = new Date(Math.floor(adjusted) * 86400 * 1000)
    if (!isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    }
  }

  return null
}

// ── Red cell detection (for indicator rows in column A) ───────────
function parseHex(rgb: string): [number, number, number] | null {
  if (!rgb || rgb.length < 6) return null
  const hex = rgb.length === 8 ? rgb.slice(2) : rgb.slice(-6)
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null
  return [r, g, b]
}

function isRedCell(cell: XLSX.CellObject | undefined): boolean {
  if (!cell?.s) return false
  const s = cell.s as any
  const candidates: string[] = []
  const push = (v: unknown) => { if (v && typeof v === 'string' && v.length >= 6) candidates.push(v) }

  // Font color
  push(s?.font?.color?.rgb); push(s?.font?.fgColor?.rgb); push(s?.font?.rgb)
  // Fill / background color
  push(s?.fgColor?.rgb); push(s?.bgColor?.rgb)
  push(s?.fill?.fgColor?.rgb); push(s?.fill?.bgColor?.rgb)
  push(s?.patternFill?.fgColor?.rgb)

  for (const rgb of candidates) {
    const parsed = parseHex(rgb)
    if (parsed) {
      const [r, g, b] = parsed
      if (r >= 140 && g < 100 && b < 100) return true
    }
  }

  // Indexed color 10 = bright red
  const fontIdx = s?.font?.color?.indexed ?? s?.font?.indexed
  const fillIdx = s?.fgColor?.indexed ?? s?.bgColor?.indexed
  if (fontIdx === 10 || fillIdx === 10) return true

  // Theme color 5 = red in Office themes
  const fontTheme = s?.font?.color?.theme ?? s?.font?.theme
  if (fontTheme === 5) return true

  return false
}

// ── Sheet tab detection ───────────────────────────────────────────
const SHEET_TAB_RE = /^L(\d+)[.\-_](\d{2,4})$/i

function detectStoreFromTab(tabName: string, storeIdPrefix: string): { store: LojaKey; storeId: string; year: number } | null {
  const m = tabName.trim().match(SHEET_TAB_RE)
  if (!m) return null
  const lojaNum = parseInt(m[1], 10)
  if (lojaNum < 1 || lojaNum > 3) return null
  const yearRaw = m[2]
  const year = parseInt(yearRaw.length === 4 ? yearRaw : `20${yearRaw}`, 10)
  return {
    store: `loja${lojaNum}` as LojaKey,
    storeId: `${storeIdPrefix}L${lojaNum}`,
    year,
  }
}

const LOJA_LABELS: Record<string, string> = { loja1: 'Loja 1', loja2: 'Loja 2', loja3: 'Loja 3' }

// ── Positional sheet parser ───────────────────────────────────────
interface ParsedSheet {
  storeId: string
  store: LojaKey
  periods: { label: string; period: string; colIndex: number }[]
  indicatorNames: string[]
  records: IndicatorRecord[]
  periodData: PeriodData   // { "jan/26": { "Faturamento": "150000" } }
}

function parseSheetPositional(wb: XLSX.WorkBook, sheetName: string, storeIdPrefix: string): ParsedSheet {
  const info = detectStoreFromTab(sheetName, storeIdPrefix)
  if (!info) throw new Error(`Nome da aba não reconhecido: "${sheetName}". Esperado: L1.26, L2.26 ou L3.26`)

  const { storeId, store, year } = info
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error(`Aba não encontrada: "${sheetName}"`)
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')

  // ROW 1 (range.s.r): columns B+ contain dates (months)
  const periods: { label: string; period: string; colIndex: number }[] = []
  for (let c = range.s.c + 1; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: range.s.r, c })]
    const period = extractPeriodDB(cell, year)
    if (!period) continue
    const label = periodToLabel(period)
    // Deduplicate
    if (!periods.find(p => p.period === period)) {
      periods.push({ label, period, colIndex: c })
    }
  }

  if (periods.length === 0) {
    console.warn(`[parseSheet "${sheetName}"] Nenhum mês detectado na linha 1.`)
  }

  // COLUMN A, rows 2+: only cells highlighted in RED are indicator rows
  const indicators: { name: string; rowIndex: number }[] = []
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: range.s.c })]
    if (!isRedCell(cell)) continue
    const name = cellText(cell).trim()
    if (name) indicators.push({ name, rowIndex: r })
  }

  // Fallback: if no red cells found at all, read all non-empty column A rows
  if (indicators.length === 0) {
    console.warn(`[parseSheet "${sheetName}"] Nenhuma célula vermelha encontrada na coluna A — lendo todas as linhas.`)
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: range.s.c })]
      const name = cellText(cell).trim()
      if (name) indicators.push({ name, rowIndex: r })
    }
  }

  // DATA AREA: intersection of rows × columns
  const records: IndicatorRecord[] = []
  const periodData: PeriodData = {}
  for (const p of periods) periodData[p.label] = {}

  for (const ind of indicators) {
    for (const p of periods) {
      const cell = ws[XLSX.utils.encode_cell({ r: ind.rowIndex, c: p.colIndex })]
      const val = cellNumericValue(cell)
      if (val !== null) {
        records.push({ store_id: storeId, period: p.period, indicator_name: ind.name, value: val })
        periodData[p.label][ind.name] = String(val)
      }
    }
  }

  return {
    storeId,
    store,
    periods,
    indicatorNames: indicators.map(i => i.name),
    records,
    periodData,
  }
}

function parseAllSheets(wb: XLSX.WorkBook, storeIdPrefix: string): {
  multiLojaData: Partial<Record<LojaKey, PeriodData>>
  detectedSheets: DetectedSheet[]
  allRecords: IndicatorRecord[]
  firstSheet: ParsedSheet | null
} {
  const matching = wb.SheetNames.filter(n => SHEET_TAB_RE.test(n.trim()))

  const multiLojaData: Partial<Record<LojaKey, PeriodData>> = {}
  const detectedSheets: DetectedSheet[] = []
  const allRecords: IndicatorRecord[] = []
  let firstSheet: ParsedSheet | null = null

  for (const sheetName of matching) {
    try {
      const parsed = parseSheetPositional(wb, sheetName, storeIdPrefix)
      multiLojaData[parsed.store] = { ...(multiLojaData[parsed.store] ?? {}), ...parsed.periodData }
      allRecords.push(...parsed.records)
      detectedSheets.push({
        sheetName,
        storeId: parsed.storeId,
        store: parsed.store,
        periods: parsed.periods.length,
        indicators: parsed.indicatorNames.length,
        records: parsed.records.length,
      })
      if (!firstSheet) firstSheet = parsed
    } catch (e) {
      console.warn(`[UploadModal] Ignorando aba "${sheetName}":`, e)
    }
  }

  return { multiLojaData, detectedSheets, allRecords, firstSheet }
}

// ── Component ─────────────────────────────────────────────────────
export default function UploadModal({ onClose, onConfirm, storeIdPrefix = '', singleStore = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)

  const processFile = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|ods|csv)$/i)) {
      setError('Formato não suportado. Use .xlsx ou .xls')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    setUploadProgress(null)

    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array', cellStyles: true, cellDates: false })

        const { multiLojaData, detectedSheets, allRecords, firstSheet } = parseAllSheets(wb, storeIdPrefix)

        if (detectedSheets.length === 0) {
          setError('Nenhuma aba no formato L1.26, L2.26 ou L3.26 encontrada. Verifique o nome das abas da planilha.')
          setLoading(false)
          return
        }

        const firstStore = detectedSheets[0].store
        const res: UploadResult = {
          fileName: file.name,
          sheetName: firstSheet?.periods[0]?.label ? detectedSheets[0].sheetName : wb.SheetNames[0],
          periods: (firstSheet?.periods ?? []).map(p => ({ label: p.label, colIndex: p.colIndex })),
          headerRow: 0,
          periodData: firstSheet?.periodData ?? {},
          redRowNames: firstSheet?.indicatorNames ?? [],
          workbook: wb,
          store: firstStore,
          multiLojaData,
          detectedSheets,
          allRecords,
        }
        setResult(res)
      } catch (err: any) {
        setError(err?.message ?? 'Não foi possível ler o arquivo. Verifique se é uma planilha válida.')
      }
      setLoading(false)
    }
    reader.readAsArrayBuffer(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleConfirm = async () => {
    if (!result) return
    const allRecords = result.allRecords ?? []

    setUploading(true)
    setError(null)
    setUploadProgress(`Enviando ${allRecords.length} registros para o Supabase…`)

    try {
      await upsertIndicators(allRecords)
      setUploadProgress(`✓ ${allRecords.length} registros salvos com sucesso!`)
      await new Promise(r => setTimeout(r, 900))
      onConfirm(result)
    } catch (e: any) {
      const msg = e?.message ?? String(e)
      setError(`Erro ao salvar no Supabase: ${msg}`)
      setUploadProgress(null)
      setUploading(false)
    }
  }

  const totalRecords = result?.allRecords?.length ?? 0
  const totalIndicators = result?.detectedSheets?.reduce((a, s) => a + s.indicators, 0) ?? 0
  const canConfirm = !uploading && result && result.detectedSheets && result.detectedSheets.length > 0 && totalRecords > 0

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.78)' }}
      onClick={e => { if (e.target === e.currentTarget && !uploading) onClose() }}
    >
      <div
        className="rounded-xl w-full flex flex-col"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxWidth: 560, maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--accent)' }}>⬆ Subir Planilha</h2>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>
              {singleStore ? 'Aba L1.26' : 'Abas L1.26 / L2.26 / L3.26'} · linha 1 = meses · coluna A = indicadores
            </p>
          </div>
          {!uploading && (
            <button onClick={onClose} className="w-7 h-7 rounded flex items-center justify-center"
              style={{ background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 16 }}>×</button>
          )}
        </div>

        <div className="flex-1 overflow-auto p-5 flex flex-col gap-4">

          {/* Drop zone */}
          {!result && !loading && (
            <div
              className="rounded-lg flex flex-col items-center justify-center gap-3 cursor-pointer transition-all"
              style={{
                border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
                background: dragOver ? 'rgba(200,168,75,0.05)' : 'var(--surface2)',
                padding: '44px 24px',
              }}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <span style={{ fontSize: 40 }}>📊</span>
              <div className="text-center">
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Arraste a planilha aqui</p>
                <p className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
                  ou clique para selecionar · .xlsx · .xls
                </p>
                <p className="text-[10px] mt-2 leading-relaxed" style={{ color: 'var(--muted)' }}>
                  {singleStore
                    ? <>Aba <span style={{ color: 'var(--accent)' }}>L1.26</span></>
                    : <>
                        Aba <span style={{ color: 'var(--accent)' }}>L1.26</span> = Loja 1 ·&nbsp;
                        <span style={{ color: 'var(--accent)' }}>L2.26</span> = Loja 2 ·&nbsp;
                        <span style={{ color: 'var(--accent)' }}>L3.26</span> = Loja 3
                      </>
                  }<br />
                  Linha 1 = meses · Coluna A = nomes dos indicadores
                </p>
              </div>
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.ods,.csv" className="hidden" onChange={handleInput} />
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center gap-2 py-10" style={{ color: 'var(--muted)' }}>
              <span className="text-2xl">⟳</span>
              <span className="text-[12px]">Lendo planilha…</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg px-4 py-3 text-[12px]" style={{ background: 'var(--negative-bg)', color: 'var(--negative)', border: '1px solid var(--negative)' }}>
              ⚠ {error}
            </div>
          )}

          {/* Upload progress */}
          {uploadProgress && (
            <div className="rounded-lg px-4 py-3 text-[12px] flex items-center gap-2"
              style={{
                background: uploadProgress.startsWith('✓') ? 'var(--positive-bg)' : 'rgba(80,120,200,0.1)',
                color: uploadProgress.startsWith('✓') ? 'var(--positive)' : '#7799ee',
                border: `1px solid ${uploadProgress.startsWith('✓') ? 'var(--positive)' : '#334488'}`,
              }}>
              {uploadProgress.startsWith('✓') ? uploadProgress : <><span className="animate-spin">⟳</span> {uploadProgress}</>}
            </div>
          )}

          {/* Result summary */}
          {result && !uploading && (
            <>
              {/* File info */}
              <div className="rounded-lg px-4 py-3 flex items-center gap-3"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 20 }}>✅</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--text)' }}>{result.fileName}</p>
                  <p className="text-[10px]" style={{ color: 'var(--muted)' }}>
                    <strong style={{ color: 'var(--accent)' }}>{result.detectedSheets?.length}</strong> {result.detectedSheets?.length === 1 ? 'aba detectada' : 'abas detectadas'} ·&nbsp;
                    <strong style={{ color: '#e05555' }}>{totalIndicators}</strong> indicadores ·&nbsp;
                    <strong style={{ color: 'var(--positive)' }}>{totalRecords}</strong> registros a enviar
                  </p>
                </div>
                <button onClick={() => { setResult(null); setError(null) }}
                  className="text-[10px] px-2 py-1 rounded shrink-0"
                  style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                  Trocar
                </button>
              </div>

              {/* Sheets breakdown */}
              {result.detectedSheets && result.detectedSheets.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--muted)' }}>
                    Abas encontradas
                  </label>
                  <div className="rounded-lg overflow-hidden" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    {result.detectedSheets.map((s, i) => (
                      <div key={s.sheetName} className="flex items-center justify-between px-3 py-2.5"
                        style={{ borderBottom: i < result.detectedSheets!.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div className="flex items-center gap-2">
                          <span className="mono text-[11px] font-bold px-2 py-0.5 rounded"
                            style={{ background: 'rgba(200,168,75,0.15)', color: 'var(--accent)', border: '1px solid rgba(200,168,75,0.3)' }}>
                            {s.sheetName}
                          </span>
                          <span className="text-[11px] font-semibold" style={{ color: 'var(--text)' }}>
                            {LOJA_LABELS[s.store]}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px]" style={{ color: 'var(--muted)' }}>
                            {s.periods} meses · {s.indicators} indicadores
                          </div>
                          {s.records > 0
                            ? <div className="text-[9px]" style={{ color: 'var(--positive)' }}>{s.records} registros ✓</div>
                            : <div className="text-[9px]" style={{ color: '#e09050' }}>⚠ sem dados numéricos</div>
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Periods preview */}
              {result.periods.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--muted)' }}>
                    Períodos detectados (primeira aba)
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {result.periods.map(p => (
                      <span key={p.label} className="mono text-[10px] font-semibold px-2 py-0.5 rounded"
                        style={{ background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
                        {p.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {totalRecords === 0 && (
                <div className="rounded-lg px-4 py-3 text-[12px]"
                  style={{ background: 'rgba(80,120,200,0.08)', color: '#7799ee', border: '1px solid #334488' }}>
                  ℹ Nenhum valor numérico encontrado na área de dados. Verifique se a planilha segue o formato: linha 1 = meses, coluna A = nomes dos indicadores.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="text-[10px]" style={{ color: 'var(--muted)' }}>
            {result && totalRecords > 0
              ? `${result.detectedSheets?.length} ${result.detectedSheets?.length === 1 ? 'loja' : 'lojas'} · ${totalRecords} registros prontos para envio`
              : ''
            }
          </div>
          <div className="flex gap-2">
            {!uploading && (
              <button onClick={onClose} className="px-4 py-2 rounded text-[12px]"
                style={{ background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                Cancelar
              </button>
            )}
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="px-4 py-2 rounded text-[12px] font-semibold flex items-center gap-1.5"
              style={{
                background: canConfirm ? 'var(--accent)' : 'var(--surface2)',
                color: canConfirm ? '#111' : 'var(--muted)',
                border: 'none',
                cursor: canConfirm ? 'pointer' : 'not-allowed',
                opacity: canConfirm ? 1 : 0.5,
              }}
            >
              {uploading ? <><span>⟳</span> Enviando…</> : 'Carregar →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
