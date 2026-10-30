'use client'

// 팀 탭 "팀 발전계획" — R0 이후 월별 탐구 계획을 그리고 고친다. 데이터는 받기만 하고 그린다(조회·저장은 DevPlanSection, 미리보기는 /mock/team-plan).
// 화면 순서: R0 기준 해석(접힘) → 월 선택 → 이달의 핵심 질문 → 강점 강화·약점 보완·미확인 탐색 → 월말 학습.
// 계획(목적·구체적 실행·확인할 증거)과 관찰(실행 결과·배운 점·후속 질문)은 카드 안에서도 나눠 보여 준다.
// 점수판·랭킹·통계 카드는 두지 않는다. 편집은 팀장만, 카드마다 "편집 → 저장" 방식(저장 안 한 변경이 있으면 월 이동·복사·창 닫기 전에 묻는다).

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ACTION_FIELD_LABEL, MONTH_FIELD_LABEL, PLAN_CATEGORIES, PLAN_CATEGORY_CODE, PLAN_CATEGORY_LABEL, PLAN_STATUSES, PLAN_STATUS_LABEL,
  R0_BASELINE, buildPlanMarkdown, monthLabel, monthLabelLong, nextMonthOf,
  type ActionField, type BaselineMeta, type LearningLabels, type MonthField, type PlanAction, type PlanCategory, type PlanMonth, type PlanStatus,
} from '@/lib/team/devPlan'

export type SaveResult = { ok: boolean; error?: string }
type Props = {
  months: PlanMonth[]
  baselines: BaselineMeta[]
  canEdit: boolean
  onSaveMonth: (m: PlanMonth, fields: Partial<Record<MonthField, string>>) => Promise<SaveResult>
  onSaveAction: (a: PlanAction, fields: Partial<Record<ActionField, string>>) => Promise<SaveResult>
  onAddMonth: (month: string) => Promise<SaveResult & { id?: string }>
  onAddAction: (monthId: string, category: PlanCategory) => Promise<SaveResult>
  learningLabels?: LearningLabels   // 월말 학습 칸 이름(회고 화면에서 팀장이 바꾼 이름) — LLM용 복사에 쓴다
}

const card = 'bg-white rounded-2xl border border-[#EEF0F2] p-5'
const input = 'w-full text-[12.5px] text-[#1F2933] border border-[#E5E8EB] rounded-md px-2.5 py-2 focus:outline-none focus:border-[#4C7FE0] leading-relaxed'
const CATEGORY_STYLE: Record<PlanCategory, { chip: string; bar: string; sub: string }> = {
  strengthen: { chip: 'bg-[#ECFDF5] text-[#047857]', bar: 'bg-[#34D399]', sub: 'R0에서 긍정 근거가 확인된 것' },
  complement: { chip: 'bg-[#FFF7ED] text-[#B45309]', bar: 'bg-[#F59E0B]', sub: 'R0의 보완 신호(확정 문제 아님)' },
  explore: { chip: 'bg-[#EFF4FF] text-[#3A5BC7]', bar: 'bg-[#4C7FE0]', sub: '아직 검증하지 못한 좋은 팀의 조건' },
}
const STATUS_STYLE: Record<PlanStatus, string> = {
  planned: 'bg-[#F0F2F5] text-[#5B6470]',
  in_progress: 'bg-[#EFF4FF] text-[#3A5BC7]',
  done: 'bg-[#ECFDF5] text-[#047857]',
  on_hold: 'bg-[#FDF2F2] text-[#9B3B3B]',
}

// 서울 기준 이번 달 'YYYY-MM-01'
function thisMonth() {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date())
  return `${d.slice(0, 7)}-01`
}
// 처음 보여 줄 달: 이번 달 → 가장 가까운 다음 달 → 마지막 달
function defaultMonthId(months: PlanMonth[]) {
  const now = thisMonth()
  return (months.find(m => m.month === now) ?? months.find(m => m.month > now) ?? months[months.length - 1])?.id ?? null
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // 권한이 막힌 브라우저 대비 — 숨긴 입력칸으로 복사
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try { ok = document.execCommand('copy') } catch { ok = false }
    ta.remove()
    return ok
  }
}

function Text({ v, empty }: { v: string; empty: string }) {
  return v.trim()
    ? <p className="text-[12.5px] text-[#1F2933] leading-relaxed whitespace-pre-wrap break-words">{v}</p>
    : <p className="text-[12px] text-[#B0B8C1]">{empty}</p>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-[#7A8491] mb-0.5">{label}</p>
      {children}
    </div>
  )
}

// ── 액션 카드 ──
const PLAN_KEYS: ActionField[] = ['focus', 'purpose', 'action_plan', 'evidence']
const OBS_KEYS: ActionField[] = ['result', 'learned', 'follow_up']
const PLACEHOLDER: Partial<Record<ActionField, string>> = {
  result: '실제로 무엇을 했고 어떤 일이 있었는지(관찰한 사실)',
  learned: '이 경험으로 새로 알게 된 것',
  follow_up: '이어서 확인하고 싶은 질문',
}

function ActionCard({ action, canEdit, onSave, onDirty }: {
  action: PlanAction; canEdit: boolean
  onSave: (a: PlanAction, f: Partial<Record<ActionField, string>>) => Promise<SaveResult>
  onDirty: (key: string, dirty: boolean) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<ActionField, string>>(() => pick(action))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = useMemo(() => (Object.keys(draft) as ActionField[]).filter(k => draft[k] !== action[k]), [draft, action])
  const dirty = editing && changed.length > 0
  useEffect(() => { onDirty(`a:${action.id}`, dirty) }, [dirty, action.id, onDirty])
  useEffect(() => () => onDirty(`a:${action.id}`, false), [action.id, onDirty])

  function pick(a: PlanAction): Record<ActionField, string> {
    return { focus: a.focus, purpose: a.purpose, action_plan: a.action_plan, evidence: a.evidence, status: a.status, result: a.result, learned: a.learned, follow_up: a.follow_up }
  }
  function begin() { setDraft(pick(action)); setError(null); setEditing(true) }
  function cancel() {
    if (dirty && !window.confirm('저장하지 않은 변경을 버릴까요?')) return
    setEditing(false); setError(null)
  }
  async function save() {
    if (!changed.length) { setEditing(false); return }
    setBusy(true); setError(null)
    const r = await onSave(action, Object.fromEntries(changed.map(k => [k, draft[k]])))
    setBusy(false)
    if (r.ok) setEditing(false)
    else setError(r.error ?? '저장하지 못했습니다')
  }
  async function quickStatus(s: PlanStatus) {
    if (s === action.status) return
    setBusy(true); setError(null)
    const r = await onSave(action, { status: s })
    setBusy(false)
    if (!r.ok) setError(r.error ?? '상태를 바꾸지 못했습니다')
  }

  const style = CATEGORY_STYLE[action.category]
  const notRun = action.status === 'planned' || action.status === 'on_hold'
  return (
    <div className="rounded-xl border border-[#E6EAF2] bg-white overflow-hidden">
      <div className={`h-1 ${style.bar}`} aria-hidden />
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          {editing
            ? <input value={draft.focus} onChange={e => setDraft({ ...draft, focus: e.target.value })} placeholder="초점 (예: 의사결정 맥락)" className={`${input} font-semibold`} />
            : <p className="text-[14px] font-semibold text-[#1F2933] break-words">{action.focus || <span className="text-[#B0B8C1] font-normal">초점 미입력</span>}</p>}
          {canEdit && !editing ? (
            <select value={action.status} disabled={busy} onChange={e => quickStatus(e.target.value as PlanStatus)} aria-label="진행상태"
              className={`text-[11.5px] font-medium rounded-full px-2 py-1 border-0 cursor-pointer flex-shrink-0 ${STATUS_STYLE[action.status]}`}>
              {PLAN_STATUSES.map(s => <option key={s} value={s}>{PLAN_STATUS_LABEL[s]}</option>)}
            </select>
          ) : !editing && (
            <span className={`text-[11.5px] font-medium rounded-full px-2 py-1 flex-shrink-0 ${STATUS_STYLE[action.status]}`}>{PLAN_STATUS_LABEL[action.status]}</span>
          )}
        </div>

        {editing ? (
          <div className="space-y-2.5">
            <p className="text-[11px] font-semibold text-[#5B6470]">계획</p>
            {PLAN_KEYS.slice(1).map(k => (
              <Field key={k} label={ACTION_FIELD_LABEL[k]}>
                <textarea rows={3} value={draft[k]} onChange={e => setDraft({ ...draft, [k]: e.target.value })} className={input} />
              </Field>
            ))}
            <Field label="진행상태">
              <select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })} className={input}>
                {PLAN_STATUSES.map(s => <option key={s} value={s}>{PLAN_STATUS_LABEL[s]}</option>)}
              </select>
            </Field>
            <p className="text-[11px] font-semibold text-[#5B6470] pt-1">실행 기록(관찰)</p>
            {OBS_KEYS.map(k => (
              <Field key={k} label={ACTION_FIELD_LABEL[k]}>
                <textarea rows={3} value={draft[k]} placeholder={PLACEHOLDER[k]} onChange={e => setDraft({ ...draft, [k]: e.target.value })} className={input} />
              </Field>
            ))}
            {error && <p className="text-[11.5px] text-red-500">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={cancel} disabled={busy} className="text-[12px] text-[#7A8491] px-3 py-1.5 rounded-lg hover:bg-[#F5F6F8]">취소</button>
              <button onClick={save} disabled={busy} className="text-[12px] font-medium text-white bg-[#4C7FE0] rounded-lg px-3 py-1.5 disabled:opacity-50">{busy ? '저장 중…' : '저장'}</button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Field label={ACTION_FIELD_LABEL.purpose}><Text v={action.purpose} empty="미입력" /></Field>
              <Field label={ACTION_FIELD_LABEL.action_plan}><Text v={action.action_plan} empty="미입력" /></Field>
              <Field label={ACTION_FIELD_LABEL.evidence}><Text v={action.evidence} empty="미입력" /></Field>
            </div>
            <div className="rounded-lg bg-[#FAFBFC] border border-[#EEF0F2] px-3 py-2.5 space-y-2">
              <p className="text-[11px] font-semibold text-[#5B6470]">실행 기록 {notRun && <span className="font-normal text-[#9AA3AD]">· {action.status === 'on_hold' ? '보류된 액션' : '아직 실행 전'}</span>}</p>
              <Field label={ACTION_FIELD_LABEL.result}><Text v={action.result} empty="아직 기록 없음" /></Field>
              <Field label={ACTION_FIELD_LABEL.learned}><Text v={action.learned} empty="아직 기록 없음" /></Field>
              <Field label={ACTION_FIELD_LABEL.follow_up}><Text v={action.follow_up} empty="아직 기록 없음" /></Field>
            </div>
            {error && <p className="text-[11.5px] text-red-500">{error}</p>}
            {canEdit && (
              <div className="flex justify-end">
                <button onClick={begin} className="text-[12px] text-[#4C7FE0] hover:underline">편집</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── 월 머리(주제·핵심 질문·다음 탐구 질문) / 월말 학습 — 같은 편집 틀 ──
function MonthEditor({ month, keys, canEdit, onSave, onDirty, dirtyKey, render }: {
  month: PlanMonth; keys: MonthField[]; canEdit: boolean
  onSave: (m: PlanMonth, f: Partial<Record<MonthField, string>>) => Promise<SaveResult>
  onDirty: (key: string, dirty: boolean) => void; dirtyKey: string
  render: (m: PlanMonth) => React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Partial<Record<MonthField, string>>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = keys.filter(k => editing && (draft[k] ?? '') !== month[k])
  const dirty = changed.length > 0
  useEffect(() => { onDirty(dirtyKey, dirty) }, [dirty, dirtyKey, onDirty])
  useEffect(() => () => onDirty(dirtyKey, false), [dirtyKey, onDirty])

  function begin() { setDraft(Object.fromEntries(keys.map(k => [k, month[k]]))); setError(null); setEditing(true) }
  function cancel() {
    if (dirty && !window.confirm('저장하지 않은 변경을 버릴까요?')) return
    setEditing(false); setError(null)
  }
  async function save() {
    if (!dirty) { setEditing(false); return }
    setBusy(true); setError(null)
    const r = await onSave(month, Object.fromEntries(changed.map(k => [k, draft[k] ?? ''])))
    setBusy(false)
    if (r.ok) setEditing(false)
    else setError(r.error ?? '저장하지 못했습니다')
  }

  if (!editing) return (
    <div>
      {render(month)}
      {canEdit && <div className="flex justify-end mt-2"><button onClick={begin} className="text-[12px] text-[#4C7FE0] hover:underline">편집</button></div>}
    </div>
  )
  return (
    <div className="space-y-2.5">
      {keys.map(k => (
        <Field key={k} label={MONTH_FIELD_LABEL[k]}>
          {k === 'theme'
            ? <input value={draft[k] ?? ''} onChange={e => setDraft({ ...draft, [k]: e.target.value })} className={input} />
            : <textarea rows={k === 'core_question' ? 2 : 3} value={draft[k] ?? ''} onChange={e => setDraft({ ...draft, [k]: e.target.value })} className={input} />}
        </Field>
      ))}
      {error && <p className="text-[11.5px] text-red-500">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={cancel} disabled={busy} className="text-[12px] text-[#7A8491] px-3 py-1.5 rounded-lg hover:bg-[#F5F6F8]">취소</button>
        <button onClick={save} disabled={busy} className="text-[12px] font-medium text-white bg-[#4C7FE0] rounded-lg px-3 py-1.5 disabled:opacity-50">{busy ? '저장 중…' : '저장'}</button>
      </div>
    </div>
  )
}

function BaselineCard() {
  const lists: [string, string[], string][] = [
    ['긍정적 근거 확인', R0_BASELINE.confirmed, 'text-[#047857]'],
    ['보완 신호', R0_BASELINE.signals, 'text-[#B45309]'],
    ['미확인', R0_BASELINE.unknown, 'text-[#3A5BC7]'],
  ]
  // 기준이 되는 팀 진단 해석 — 항상 펼쳐 두고, 상자 없이(배경·테두리 없음) 글로만 둔다. 아래 월 계획과는 밑줄 한 줄로 단락을 나눈다
  return (
    <section className="px-5 pb-6 mb-2 border-b border-[#DDE1E6]">
      <p className="text-[17px] font-bold text-[#1F2933]">팀 진단(2026.10.30 ver)</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
        {lists.map(([title, items, cls]) => (
          <div key={title}>
            <p className={`text-[13px] font-semibold mb-1.5 ${cls}`}>{title}</p>
            <ul className="space-y-1">{items.map(v => <li key={v} className="text-[13.5px] text-[#3A4249] leading-relaxed">· {v}</li>)}</ul>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function DevPlanBoard({ months, baselines, canEdit, onSaveMonth, onSaveAction, onAddMonth, onAddAction, learningLabels }: Props) {
  const sorted = useMemo(() => [...months].sort((a, b) => a.month.localeCompare(b.month)), [months])
  const [selectedId, setSelectedId] = useState<string | null>(() => defaultMonthId(sorted))
  const selected = sorted.find(m => m.id === selectedId) ?? sorted.find(m => m.id === defaultMonthId(sorted)) ?? null
  const baseline = baselines.find(b => b.id === selected?.baseline_round_id) ?? baselines[0] ?? null

  // 저장 안 한 편집 칸 추적 — 월 이동·복사·창 닫기 전에 확인
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set())
  const onDirty = useCallback((key: string, dirty: boolean) => {
    setDirtyKeys(prev => {
      if (prev.has(key) === dirty) return prev
      const next = new Set(prev)
      if (dirty) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])
  const hasDirty = dirtyKeys.size > 0
  useEffect(() => {
    if (!hasDirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [hasDirty])

  function selectMonth(id: string) {
    if (id === selected?.id) return
    if (hasDirty && !window.confirm('저장하지 않은 변경이 있습니다. 다른 달로 옮기면 그 변경은 사라집니다. 옮길까요?')) return
    setSelectedId(id)
  }

  // 월 추가
  const [adding, setAdding] = useState(false)
  const [newMonth, setNewMonth] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [addBusy, setAddBusy] = useState(false)
  function openAdd() {
    const last = sorted[sorted.length - 1]
    setNewMonth((last ? nextMonthOf(last.month) : thisMonth()).slice(0, 7))
    setAddError(null)
    setAdding(true)
  }
  async function submitAdd() {
    if (!newMonth) return
    if (hasDirty && !window.confirm('저장하지 않은 변경이 있습니다. 새 달로 옮기면 그 변경은 사라집니다. 계속할까요?')) return
    setAddBusy(true); setAddError(null)
    const r = await onAddMonth(newMonth)
    setAddBusy(false)
    if (!r.ok) { setAddError(r.error ?? '추가하지 못했습니다'); return }
    setAdding(false)
    if (r.id) setSelectedId(r.id)
  }

  // LLM용 복사
  const [scope, setScope] = useState<'month' | 'all'>('month')
  const [copyMsg, setCopyMsg] = useState<{ ok: boolean; text: string } | null>(null)
  async function copy() {
    if (hasDirty && !window.confirm('저장하지 않은 변경이 있습니다. 복사에는 저장된 내용만 들어갑니다. 그대로 복사할까요?')) return
    const target = scope === 'all' ? 'all' : selected?.id
    if (!target) { setCopyMsg({ ok: false, text: '복사할 달이 없습니다.' }); return }
    const { text, months: n } = buildPlanMarkdown({ months: sorted, scope: target, baseline, labels: learningLabels })
    if (!text.trim() || n === 0) { setCopyMsg({ ok: false, text: '복사할 내용이 없습니다. 달을 다시 골라 주세요.' }); return }
    const ok = await copyText(text)
    setCopyMsg(ok
      ? { ok: true, text: `${scope === 'all' ? `전체 ${n}개월` : monthLabel(selected!.month)} · ${text.length.toLocaleString()}자 복사됨` }
      : { ok: false, text: '복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.' })
  }
  useEffect(() => {
    if (!copyMsg?.ok) return
    const t = window.setTimeout(() => setCopyMsg(null), 4000)
    return () => window.clearTimeout(t)
  }, [copyMsg])

  const [actionBusy, setActionBusy] = useState<PlanCategory | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  async function addAction(category: PlanCategory) {
    if (!selected) return
    setActionBusy(category); setActionError(null)
    const r = await onAddAction(selected.id, category)
    setActionBusy(null)
    if (!r.ok) setActionError(r.error ?? '액션을 추가하지 못했습니다')
  }

  return (
    <div className="space-y-5">
      <BaselineCard />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-[#F0F2F5] rounded-lg p-1 flex-wrap" role="tablist" aria-label="월 선택">
          {sorted.map(m => (
            <button key={m.id} role="tab" aria-selected={selected?.id === m.id} onClick={() => selectMonth(m.id)}
              className={`text-[12.5px] px-3 py-1.5 rounded-md transition-colors ${selected?.id === m.id ? 'bg-white text-[#1F2933] font-medium shadow-sm' : 'text-[#7A8491] hover:text-[#1F2933]'}`}>
              {monthLabel(m.month)}
            </button>
          ))}
          {canEdit && !adding && (
            <button onClick={openAdd} className="text-[12.5px] px-2.5 py-1.5 rounded-md text-[#4C7FE0] hover:bg-white">＋ 월 추가</button>
          )}
        </div>
        {canEdit && <div className="flex items-center gap-2 flex-wrap">
          <select value={scope} onChange={e => setScope(e.target.value as 'month' | 'all')} aria-label="복사 범위"
            className="text-[12px] text-[#3A4249] border border-[#E5E8EB] rounded-lg px-2 py-1.5 bg-white">
            <option value="month">이번 달{selected ? `(${monthLabel(selected.month)})` : ''}</option>
            <option value="all">전체 기간</option>
          </select>
          <button onClick={copy} disabled={!sorted.length} className="text-[12.5px] font-medium text-white bg-[#1F2933] rounded-lg px-3.5 py-1.5 disabled:opacity-40">LLM용 복사</button>
        </div>}
      </div>
      {copyMsg && (
        <p role="status" className={`text-[12px] -mt-3 text-right ${copyMsg.ok ? 'text-[#047857]' : 'text-red-500'}`}>{copyMsg.text}</p>
      )}

      {adding && (
        <div className={`${card} flex items-end gap-2 flex-wrap`}>
          <Field label="추가할 월">
            <input type="month" value={newMonth} onChange={e => setNewMonth(e.target.value)} className="text-[12.5px] border border-[#E5E8EB] rounded-md px-2.5 py-1.5" />
          </Field>
          <p className="text-[11.5px] text-[#7A8491] flex-1 min-w-[200px]">강점 강화·약점 보완·미확인 탐색 빈 액션이 하나씩 만들어집니다. 핵심 질문과 액션은 추가한 뒤 채웁니다.</p>
          <button onClick={() => setAdding(false)} disabled={addBusy} className="text-[12px] text-[#7A8491] px-3 py-1.5 rounded-lg hover:bg-[#F5F6F8]">취소</button>
          <button onClick={submitAdd} disabled={addBusy || !newMonth} className="text-[12px] font-medium text-white bg-[#4C7FE0] rounded-lg px-3 py-1.5 disabled:opacity-50">{addBusy ? '추가 중…' : '추가'}</button>
          {addError && <p className="w-full text-[11.5px] text-red-500">{addError}</p>}
        </div>
      )}

      {!selected ? (
        <p className={`${card} text-[12.5px] text-[#B0B8C1]`}>{canEdit ? '아직 월별 계획이 없습니다. "＋ 월 추가"로 시작해 주세요.' : '아직 월별 계획이 없습니다.'}</p>
      ) : (
        <div key={selected.id} className="space-y-5">
          <section className="rounded-2xl border border-[#F0E1C2] bg-[#FFF9EE] p-5">
            <MonthEditor month={selected} keys={['theme', 'core_question', 'next_question']} canEdit={canEdit} onSave={onSaveMonth} onDirty={onDirty} dirtyKey={`m:${selected.id}:head`}
              render={m => (
                <div>
                  <p className="text-[12px] text-[#7A8491]">{monthLabelLong(m.month)}{m.theme ? ` · ${m.theme}` : ''}</p>
                  <p className="text-[11px] font-medium text-[#7A8491] mt-3">핵심 질문</p>
                  <p className="text-[18px] font-semibold text-[#1F2933] leading-snug mt-0.5 break-words">{m.core_question || <span className="text-[#B0B8C1] font-normal text-[14px]">핵심 질문 미입력</span>}</p>
                  {m.next_question && (
                    <p className="text-[12px] text-[#5B6470] mt-3 leading-relaxed"><span className="font-medium text-[#7A8491]">이어서 탐구할 질문 · </span>{m.next_question}</p>
                  )}
                </div>
              )} />
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {PLAN_CATEGORIES.map(c => {
              const list = selected.actions.filter(a => a.category === c).sort((a, b) => a.sort_order - b.sort_order)
              return (
                <div key={c} className="space-y-3">
                  <div>
                    <span className={`text-[12px] font-semibold rounded-full px-2.5 py-1 ${CATEGORY_STYLE[c].chip}`}>{PLAN_CATEGORY_CODE[c]}. {PLAN_CATEGORY_LABEL[c]}</span>
                    <p className="text-[11.5px] text-[#9AA3AD] mt-1.5">{CATEGORY_STYLE[c].sub}</p>
                  </div>
                  {list.map(a => <ActionCard key={a.id} action={a} canEdit={canEdit} onSave={onSaveAction} onDirty={onDirty} />)}
                  {!list.length && <p className="text-[12px] text-[#B0B8C1] rounded-xl border border-dashed border-[#E2E6EC] px-3 py-4 text-center">액션 없음</p>}
                  {canEdit && (
                    <button onClick={() => addAction(c)} disabled={actionBusy !== null}
                      className="w-full text-[12px] text-[#7A8491] border border-dashed border-[#E2E6EC] rounded-xl py-2 hover:text-[#4C7FE0] hover:border-[#C7D2E6] disabled:opacity-50">
                      {actionBusy === c ? '추가 중…' : '＋ 액션 추가'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {actionError && <p className="text-[11.5px] text-red-500">{actionError}</p>}

          {/* 월말 학습(새롭게 확인한 것 / 달라진 해석 / 여전히 모르는 것)은 업무 > 회고의 팀 회고 가운데 칸으로 옮겼다.
              기록은 같은 team_plan_months 칸이라 LLM용 복사에는 그대로 들어간다. */}
        </div>
      )}
    </div>
  )
}
