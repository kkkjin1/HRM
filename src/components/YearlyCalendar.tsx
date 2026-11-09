'use client'
/* eslint-disable react-hooks/refs -- renderTray/renderTable 안의 ⠿ 끌기 핸들러(onPointerDown)와 ref 등록 콜백은 클릭·끌기·마운트 때만 실행된다(렌더 중 ref 읽기 아님). 렌더 함수를 직접 호출하는 구조라 검사기가 오탐한다. */

// 업무 탭 캘린더 서브탭의 "연간" 화면 — 연도별 1~12월 중요 업무 리스트(담당자 없이 텍스트만).
// 항목 왼쪽 ⠿ 손잡이로 끌어서 같은 달 안 순서 바꾸기 + 다른 달로 옮기기(놓은 항목의 위/아래 절반, 빈 곳이면 그 달 맨 아래).
// 맨 위 "📌 연간(월 미정)" 보관함 = month 0 — 월을 아직 안 정한 업무를 넣어 두고 끌어서 1~12월로(또는 다시 보관함으로) 옮긴다.
// 보기 전환: [🗂 카드](상반기|하반기 한눈에) · [📋 범주표](엑셀처럼 A열 범주 × 1~12월, 칸 하나 = 업무 하나).
//   범주표에서 칸으로 옮기면 범주와 월이 함께 바뀐다. 카드 화면에서 옮기면 범주는 그대로(카드엔 업무 앞에 작은 범주 태그).

import { useEffect, useRef, useState } from 'react'

type YearlyTask = { id: string; year: number; month: number; title: string; sort_order: number | null; category_id: string | null; created_at: string }
type Category = { id: string; name: string; sort_order: number; color: string | null }
// 범주 색 팔레트(보라 계열 제외) — API(yearly-categories)의 CATEGORY_COLORS 와 같게
const CATEGORY_COLORS = ['#2563EB', '#4F9A3A', '#C2410C', '#2F9E9A', '#B8860B', '#B91C1C', '#0E7490', '#E8833A', '#64748B', '#8B5E3C']
const NO_CAT_COLOR = '#9AA3AD'
// 놓을 자리: 카드/보관함 = (월, 기준 항목, 앞·뒤) — id 가 없으면 그 달 맨 아래. 범주표 칸이면 cell(범주, 몇 번째 행)이 붙는다.
type DropAt = { month: number; id: string | null; after: boolean; cell?: { cat: string | null; row: number } }
type View = 'cards' | 'table'
const VIEW_KEY = 'hrm_yearly_view'
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

// 월별 머리줄 색 — 계절감 있는 띠(head) + 제목 글자색(title), 몸통은 흰색(보라 계열 제외)
const MONTH_TONE: Record<number, { head: string; title: string }> = {
  1: { head: '#D8E6F5', title: '#2F5F93' },   // 한겨울 하늘
  2: { head: '#D6E8EF', title: '#2E6B80' },   // 늦겨울
  3: { head: '#F5D9DE', title: '#A8475A' },   // 벚꽃
  4: { head: '#DBEBCB', title: '#4C7A2B' },   // 새싹
  5: { head: '#CDE7D5', title: '#2F7A4A' },   // 신록
  6: { head: '#C9E6E1', title: '#1F7368' },   // 초여름 청록
  7: { head: '#C8E1F0', title: '#1F6A97' },   // 여름 바다
  8: { head: '#F3E3AE', title: '#8A6A12' },   // 햇살
  9: { head: '#EEDFBF', title: '#86662A' },   // 벼 익는
  10: { head: '#F4D6C2', title: '#A2522A' },  // 단풍
  11: { head: '#E5D6C8', title: '#7A5638' },  // 낙엽
  12: { head: '#F0D3D3', title: '#9B3B3B' },  // 연말
}

const TRAY = 0 // 📌 연간(월 미정) 보관함
const FIRST_HALF = [1, 2, 3, 4, 5, 6]
const SECOND_HALF = [7, 8, 9, 10, 11, 12]

// 자유 메모 — 연간 전체(half 0, 연도 바 아래)·상반기·하반기 제목 아래. 입력하면 0.7초 뒤 자동 저장(칸을 떠날 때도 저장). 연도·반기마다 한 칸, 팀 공용.
// 길면 상자 안에서만 투명 스크롤.
const NOTE_H_DEFAULT = 96 // 반기 메모 본문 높이(고정)
const NOTE_PLACEHOLDER: Record<0 | 1 | 2, string> = {
  0: '연간 메모 — 올해 방향, 중점 과제 등 자유롭게',
  1: '상반기 메모 — 이번 반기 중점, 일정 메모 등 자유롭게',
  2: '하반기 메모 — 이번 반기 중점, 일정 메모 등 자유롭게',
}
// inline: 📌 연간 상자 안 오른쪽 칸 — 테두리·크기조절 없이 칸 높이를 그대로 채운다(화면 높이를 늘리지 않음)
function HalfNote({ year, half, initial, height, onHeight, inline = false }: { year: number; half: 0 | 1 | 2; initial: string; height?: number; onHeight?: (h: number) => void; inline?: boolean }) {
  const [body, setBody] = useState(initial)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<string | null>(null)
  const boxRef = useRef<HTMLTextAreaElement>(null)
  async function save() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const text = pending.current
    if (text === null) return
    pending.current = null
    setState('saving')
    const res = await fetch('/api/yearly-notes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, half, body: text }) }).catch(() => null)
    const json = await res?.json().catch(() => null)
    setState(json?.ok ? 'saved' : 'error')
  }
  function change(v: string) {
    setBody(v)
    pending.current = v
    setState('idle')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void save() }, 700)
  }
  // 화면을 떠날 때 남은 입력 저장
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    if (pending.current !== null) {
      void fetch('/api/yearly-notes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, half, body: pending.current }), keepalive: true })
    }
  }, [year, half])
  return (
    <div className={`relative ${inline ? 'h-full' : ''}`}>
      <textarea ref={boxRef} value={body} onChange={e => change(e.target.value)} onBlur={() => { void save() }}
        onPointerUp={() => { if (inline || !onHeight || height === undefined) return; const h = boxRef.current?.offsetHeight; if (h && Math.abs(h - height) > 2) onHeight(h) }}
        placeholder={NOTE_PLACEHOLDER[half]}
        style={inline ? undefined : { height }}
        className={`w-full text-[12.5px] leading-relaxed text-[#3A4249] placeholder:text-[#B0B8C1] focus:outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${inline
          ? 'h-full min-h-[52px] resize-none bg-transparent px-3 py-2.5 focus:bg-[#FAFBFC]'
          : 'min-h-[56px] max-h-[480px] resize-y rounded-xl border border-[#EEF0F2] bg-white px-3 py-2 focus:border-[#C7D6F3]'}`} />
      {state !== 'idle' && (
        <span className={`pointer-events-none absolute right-3 bottom-2 text-[10.5px] ${state === 'error' ? 'text-red-500' : 'text-[#B0B8C1]'}`}>
          {state === 'saving' ? '저장 중…' : state === 'saved' ? '저장됨' : '저장 실패 — 다시 입력해 보세요'}
        </span>
      )}
    </div>
  )
}

export default function YearlyCalendar() {
  // 오늘(연·월) — 처음 그릴 때 한 번 정한다(이번 달 카드 강조, 올해로 돌아가기)
  const [today] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 } })
  const [year, setYear] = useState(today.y)
  const [tasks, setTasks] = useState<YearlyTask[]>([])
  const [loaded, setLoaded] = useState(false)
  const [addingMonth, setAddingMonth] = useState<number | null>(null)
  const [addDraft, setAddDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  // ⠿ 끌기 — 브라우저 기본 drag&drop 대신 포인터를 따라간다(다른 화면들과 같은 방식)
  const rowEls = useRef(new Map<string, HTMLElement>())
  const cardEls = useRef(new Map<number, HTMLDivElement>())
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<DropAt | null>(null)
  // 범주표
  const [view, setView] = useState<View>('cards')
  const [categories, setCategories] = useState<Category[]>([])
  const cellEls = useRef(new Map<string, { el: HTMLElement; month: number; cat: string | null; row: number }>())
  const catEls = useRef(new Map<string, HTMLElement>())
  const [addingCell, setAddingCell] = useState<{ cat: string | null; month: number } | null>(null)
  const [editingCat, setEditingCat] = useState<string | null>(null)
  const [catDraft, setCatDraft] = useState('')
  const [addingCat, setAddingCat] = useState(false)
  const [catDragId, setCatDragId] = useState<string | null>(null)
  const [catDrop, setCatDrop] = useState<{ id: string; after: boolean } | null>(null)
  // 반기 메모
  const [notes, setNotes] = useState<{ year: number; 0: string; 1: string; 2: string } | null>(null)
  const [colorPickFor, setColorPickFor] = useState<string | null>(null)  // 색 팔레트를 펼친 범주

  // 마지막에 보던 보기(카드/범주표) — 서버 렌더와 어긋나지 않게 마운트 뒤에 읽는다
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 저장값은 마운트 뒤에만 읽을 수 있다
      if (window.localStorage.getItem(VIEW_KEY) === 'table') setView('table')
    } catch {}
  }, [])
  function pickView(v: View) {
    setView(v)
    try { window.localStorage.setItem(VIEW_KEY, v) } catch {}
  }
  // 범주(해마다 같은 목록)
  useEffect(() => {
    let active = true
    ;(async () => {
      const res = await fetch('/api/yearly-categories').catch(() => null)
      const json = await res?.json().catch(() => null)
      if (active && json?.ok) setCategories(json.categories)
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      const [res, nres] = await Promise.all([
        fetch(`/api/yearly-tasks?year=${year}`),
        fetch(`/api/yearly-notes?year=${year}`).catch(() => null),
      ])
      const json = await res.json()
      const njson = await nres?.json().catch(() => null)
      if (active && json.ok) setTasks(json.tasks)
      if (active) {
        const list = (njson?.ok ? njson.notes : []) as { half: number; body: string }[]
        setNotes({ year, 0: list.find(n => n.half === 0)?.body ?? '', 1: list.find(n => n.half === 1)?.body ?? '', 2: list.find(n => n.half === 2)?.body ?? '' })
      }
      if (active) setLoaded(true)
    })()
    return () => { active = false }
  }, [year])

  function startAdd(month: number) {
    setAddingMonth(month)
    setAddDraft('')
  }

  async function commitAdd(month: number) {
    const title = addDraft.trim()
    setAddingMonth(null)
    if (!title) return
    const res = await fetch('/api/yearly-tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, month, title }),
    })
    const json = await res.json()
    if (json.ok) setTasks(prev => [...prev, json.task])
  }

  function startEdit(t: YearlyTask) {
    setEditingId(t.id)
    setEditDraft(t.title)
  }

  async function commitEdit(id: string) {
    const title = editDraft.trim()
    setEditingId(null)
    if (!title) return
    const res = await fetch('/api/yearly-tasks', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, title }),
    })
    const json = await res.json()
    if (json.ok) setTasks(prev => prev.map(t => t.id === id ? json.task : t))
  }

  // 카드·보관함에서 업무 앞에 붙이는 작은 범주 태그(범주표와 연계) — 미분류면 없음
  const catOf = (t: YearlyTask) => (t.category_id ? categories.find(c => c.id === t.category_id) ?? null : null)
  // 범주 색 점 + 이름(범주 색 글자) — 카드·보관함 업무 앞
  const catTag = (t: YearlyTask) => {
    const c = catOf(t); if (!c) return null
    const color = c.color ?? NO_CAT_COLOR
    return (
      <span className="inline-flex items-center gap-1 mr-1 text-[10.5px] font-semibold align-[1px]" style={{ color }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />{c.name}
      </span>
    )
  }
  async function setCategoryColor(id: string, color: string) {
    setColorPickFor(null)
    const prev = categories
    setCategories(list => list.map(c => c.id === id ? { ...c, color } : c))
    const res = await fetch('/api/yearly-categories', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, color }) }).catch(() => null)
    const json = await res?.json().catch(() => null)
    if (!json?.ok) setCategories(prev)
  }

  // 같은 달 안의 순서대로(서버 정렬과 같게: sort_order → 만든 시각)
  const inMonth = (list: YearlyTask[], month: number) => list
    .filter(t => t.month === month)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.created_at.localeCompare(b.created_at))

  function startDrag(e: React.PointerEvent, id: string) {
    if (e.button !== 0 || editingId) return
    e.preventDefault()
    let target: DropAt | null = null
    setDragId(id)
    const onMove = (ev: PointerEvent) => {
      let hit: DropAt | null = null
      for (const [rid, el] of rowEls.current) {
        const r = el.getBoundingClientRect()
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
          const month = tasks.find(t => t.id === rid)?.month
          if (month !== undefined) hit = { month, id: rid, after: month === TRAY ? ev.clientX > (r.left + r.right) / 2 : ev.clientY > (r.top + r.bottom) / 2 }
          break
        }
      }
      if (!hit) {
        for (const c of cellEls.current.values()) {
          const r = c.el.getBoundingClientRect()
          if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) { hit = { month: c.month, id: null, after: false, cell: { cat: c.cat, row: c.row } }; break }
        }
      }
      if (!hit) {
        for (const [month, el] of cardEls.current) {
          const r = el.getBoundingClientRect()
          if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) { hit = { month, id: null, after: true }; break }
        }
      }
      if (hit?.month !== target?.month || hit?.id !== target?.id || hit?.after !== target?.after || hit?.cell?.cat !== target?.cell?.cat || hit?.cell?.row !== target?.cell?.row) { target = hit; setDropAt(hit) }
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      setDragId(null)
      setDropAt(null)
      if (!target || target.id === id) return
      if (target.cell) void moveToCell(id, target.month, target.cell.cat, target.cell.row)
      else void moveTask(id, target)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  async function moveTask(id: string, to: DropAt) {
    const moving = tasks.find(t => t.id === id); if (!moving) return
    const rest = inMonth(tasks, to.month).filter(t => t.id !== id)
    const at = to.id ? rest.findIndex(t => t.id === to.id) + (to.after ? 1 : 0) : rest.length
    const next = [...rest.slice(0, at), moving, ...rest.slice(at)]
    const before = inMonth(tasks, to.month).map(t => t.id).join()
    if (moving.month === to.month && next.map(t => t.id).join() === before) return
    // 화면 먼저 바꾸고 저장 — 실패하면 서버 값으로 되돌린다
    const prevTasks = tasks
    const order = new Map(next.map((t, i) => [t.id, i]))
    setTasks(list => list.map(t => order.has(t.id) ? { ...t, month: to.month, sort_order: order.get(t.id)! } : t))
    const res = await fetch('/api/yearly-tasks', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, month: to.month, ids: next.map(t => t.id) }),
    }).catch(() => null)
    const json = await res?.json().catch(() => null)
    if (!json?.ok) setTasks(prevTasks)
  }

  // 범주표 칸으로 옮기기 — 그 칸(범주·월)의 row 번째 앞에 넣는다. 달 전체 순서 안에서 자리를 잡고, 범주도 함께 바꾼다.
  async function moveToCell(id: string, month: number, cat: string | null, row: number) {
    const moving = tasks.find(t => t.id === id); if (!moving) return
    // row 는 화면에 보이던 칸 번호(옮기는 항목 포함) — 그 칸의 업무 "앞"에 넣는다. 자기 칸에 놓으면 그대로.
    const shown = inMonth(tasks, month).filter(t => (t.category_id ?? null) === cat)
    const before = shown[row]
    if (before?.id === id) return
    const monthList = inMonth(tasks, month).filter(t => t.id !== id)
    const cellList = monthList.filter(t => (t.category_id ?? null) === cat)
    const at = before ? monthList.indexOf(before)
      : cellList.length ? monthList.indexOf(cellList[cellList.length - 1]) + 1 : monthList.length
    const next = [...monthList.slice(0, at), moving, ...monthList.slice(at)]
    if (moving.month === month && (moving.category_id ?? null) === cat && next.map(t => t.id).join() === inMonth(tasks, month).map(t => t.id).join()) return
    const prevTasks = tasks
    const order = new Map(next.map((t, i) => [t.id, i]))
    setTasks(list => list.map(t => order.has(t.id) ? { ...t, month, sort_order: order.get(t.id)!, ...(t.id === id ? { category_id: cat } : {}) } : t))
    const res = await fetch('/api/yearly-tasks', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month, ids: next.map(t => t.id), moveId: id, categoryId: cat }),
    }).catch(() => null)
    const json = await res?.json().catch(() => null)
    if (!json?.ok) setTasks(prevTasks)
  }

  async function commitAddCell(cat: string | null, month: number) {
    const title = addDraft.trim()
    setAddingCell(null)
    if (!title) return
    const res = await fetch('/api/yearly-tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, month, title, category_id: cat }),
    })
    const json = await res.json()
    if (json.ok) setTasks(prev => [...prev, json.task])
  }

  async function commitAddCategory() {
    const name = catDraft.trim()
    setAddingCat(false); setCatDraft('')
    if (!name) return
    const res = await fetch('/api/yearly-categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    const json = await res.json().catch(() => null)
    if (json?.ok) setCategories(prev => [...prev, json.category])
  }
  async function commitRenameCategory(id: string) {
    const name = catDraft.trim()
    setEditingCat(null)
    if (!name || categories.find(c => c.id === id)?.name === name) return
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c))
    await fetch('/api/yearly-categories', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name }) })
  }
  async function deleteCategory(c: Category) {
    const n = tasks.filter(t => t.category_id === c.id).length
    if (!window.confirm(`범주 '${c.name}'를 지울까요?${n ? `\n이 범주의 업무 ${n}개(올해 기준)는 지워지지 않고 미분류로 옮겨져요.` : ''}`)) return
    setCategories(prev => prev.filter(x => x.id !== c.id))
    setTasks(prev => prev.map(t => t.category_id === c.id ? { ...t, category_id: null } : t))
    await fetch('/api/yearly-categories', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id }) })
  }
  // 범주 ⠿ 끌어서 순서 바꾸기(범주 묶음의 위/아래 절반)
  function startCatDrag(e: React.PointerEvent, id: string) {
    if (e.button !== 0 || editingCat) return
    e.preventDefault()
    let target: { id: string; after: boolean } | null = null
    setCatDragId(id)
    const onMove = (ev: PointerEvent) => {
      let hit: { id: string; after: boolean } | null = null
      for (const [cid, el] of catEls.current) {
        const r = el.getBoundingClientRect()
        if (ev.clientY >= r.top && ev.clientY <= r.bottom) { hit = { id: cid, after: ev.clientY > (r.top + r.bottom) / 2 }; break }
      }
      if (hit?.id !== target?.id || hit?.after !== target?.after) { target = hit; setCatDrop(hit) }
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      setCatDragId(null); setCatDrop(null)
      if (!target || target.id === id) return
      const rest = categories.filter(c => c.id !== id)
      const at = rest.findIndex(c => c.id === target!.id) + (target.after ? 1 : 0)
      const moving = categories.find(c => c.id === id)!
      const next = [...rest.slice(0, at), moving, ...rest.slice(at)]
      if (next.map(c => c.id).join() === categories.map(c => c.id).join()) return
      const prev = categories
      setCategories(next.map((c, i) => ({ ...c, sort_order: i })))
      void fetch('/api/yearly-categories', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: next.map(c => c.id) }) })
        .then(r => r.json()).then(j => { if (!j?.ok) setCategories(prev) }).catch(() => setCategories(prev))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  async function deleteTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
    await fetch('/api/yearly-tasks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
  }

  if (!loaded) return <p className="text-[12.5px] text-[#B0B8C1] px-1 py-6">불러오는 중...</p>

  function renderMonthCard(month: number) {
    const monthTasks = inMonth(tasks, month)
    const dropHere = !!dragId && dropAt?.month === month
    const isNow = year === today.y && month === today.m
    return (
      <div key={month}
        ref={el => { if (el) cardEls.current.set(month, el); else cardEls.current.delete(month) }}
        style={isNow && !dropHere ? { borderColor: MONTH_TONE[month].title, boxShadow: `0 0 0 1px ${MONTH_TONE[month].title}` } : undefined}
        className={`bg-white rounded-xl border overflow-hidden flex flex-col h-[317px] transition-shadow ${dropHere ? 'border-[#4C7FE0] ring-2 ring-[#4C7FE0]/30' : 'border-[#EEF0F2]'}`}>
        {/* 머리줄만 계절색 띠 — 몸통은 흰색 */}
        <p className="px-3 py-1.5 text-[13px] font-semibold flex-shrink-0 flex items-center justify-between gap-2" style={{ background: MONTH_TONE[month].head, color: MONTH_TONE[month].title }}>
          <span>{month}월</span>
          {isNow && <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-white/80"><span className="w-1.5 h-1.5 rounded-full" style={{ background: MONTH_TONE[month].title }} />이번 달</span>}
        </p>
        <div className="px-3 pt-2 pb-3 flex flex-col flex-1 min-h-0">
        {/* 12개 카드 높이 통일(317px) — 항목이 많으면 안에서만 스크롤, 스크롤바는 투명(안 보임) */}
        <ul className="space-y-1 flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {monthTasks.map(t => (
            <li key={t.id}
              ref={el => { if (el) rowEls.current.set(t.id, el); else rowEls.current.delete(t.id) }}
              className={`group relative flex items-start gap-1 text-[12px] text-[#3A4249] ${dragId === t.id ? 'opacity-40' : ''}`}>
              {dropHere && dropAt?.id === t.id && dragId !== t.id && (
                <span aria-hidden className={`absolute left-0 right-0 h-[2px] rounded-full bg-[#4C7FE0] z-10 ${dropAt.after ? 'bottom-[-2px]' : 'top-[-2px]'}`} />
              )}
              <span onPointerDown={e => startDrag(e, t.id)} title="끌어서 순서 바꾸기·다른 달로 옮기기" aria-label={`${t.title} 옮기기`}
                className="w-4 h-[22px] -ml-1 flex items-center justify-center rounded text-[12px] text-[#C7CDD4] group-hover:text-[#9AA3AD] hover:!text-[#4C7FE0] hover:bg-[#EEF3FC] cursor-grab active:cursor-grabbing select-none touch-none flex-shrink-0">⠿</span>
              {editingId === t.id ? (
                <input
                  autoFocus value={editDraft} onChange={e => setEditDraft(e.target.value)}
                  onBlur={() => commitEdit(t.id)}
                  onKeyDown={e => { if (e.key === 'Enter') commitEdit(t.id); if (e.key === 'Escape') setEditingId(null) }}
                  className="flex-1 min-w-0 bg-white border border-gray-200 rounded px-1 py-0.5 text-[12px]"
                />
              ) : (
                <span className="flex-1 min-w-0 break-words cursor-pointer py-0.5" onClick={() => startEdit(t)}>
                  {catTag(t)}{t.title}
                </span>
              )}
              <button onClick={() => deleteTask(t.id)} className="opacity-0 group-hover:opacity-100 text-[#C7CDD4] hover:text-red-500 flex-shrink-0 text-[11px] mt-0.5">✕</button>
            </li>
          ))}
          {/* 빈 곳에 놓으면 그 달 맨 아래 */}
          {dropHere && dropAt?.id === null && <li aria-hidden className="h-[2px] rounded-full bg-[#4C7FE0]" />}
        </ul>
        {addingMonth === month ? (
          <input
            autoFocus value={addDraft} onChange={e => setAddDraft(e.target.value)}
            onBlur={() => commitAdd(month)}
            onKeyDown={e => { if (e.key === 'Enter') commitAdd(month); if (e.key === 'Escape') setAddingMonth(null) }}
            placeholder="업무명" className="mt-1.5 w-full bg-white border border-gray-200 rounded px-1.5 py-1 text-[12px] flex-shrink-0"
          />
        ) : (
          <button onClick={() => startAdd(month)} className="mt-1.5 text-left text-[11.5px] text-[#7A8491] hover:text-[#4C7FE0] flex-shrink-0">+ 추가</button>
        )}
        </div>
      </div>
    )
  }

  // 메모 상자 — 회색 음영 머리줄(고정) + 자유 텍스트 본문. 📌 연간(half 0)·상반기(1)·하반기(2) 공통.
  // 본문 높이는 고정이라 화면이 늘지 않고, 길어지면 본문 안에서만 투명 스크롤.
  // (예전 📌 연간(월 미정) 업무 칩·끌기는 2026-11-09 없앴다 — month 0 업무가 DB에 남아 있어도 화면에 나오지 않음)
  function renderMemoBox(title: React.ReactNode, half: 0 | 1 | 2, bodyH: number) {
    return (
      <div className="bg-white rounded-xl border border-[#EEF0F2] overflow-hidden">
        <div className="px-3 py-1.5 bg-[#E5E8EB] flex items-baseline gap-2">{title}</div>
        <div style={{ height: bodyH }}>
          {notes?.year === year && <HalfNote key={`${year}-${half}`} year={year} half={half} initial={notes[half]} inline />}
        </div>
      </div>
    )
  }

  // 📋 범주표 — A열 범주(여러 행 묶음) × 1~12월. 범주의 행 수 = 업무가 가장 많은 달 + 빈 행 1개(여기서 바로 추가).
  function renderTable() {
    const groups: { id: string | null; name: string; cat: Category | null }[] = [
      ...categories.map(c => ({ id: c.id, name: c.name, cat: c })),
      { id: null, name: '미분류', cat: null },
    ]
    return (
      <div className="space-y-2">
        <div className={`overflow-x-auto rounded-xl border border-[#F1F3F5] bg-white ${catDragId ? 'select-none' : ''}`}>
          <table className="w-full min-w-[1180px] border-collapse table-fixed text-[12px]">
            <colgroup><col className="w-[132px]" />{MONTHS.map(m => <col key={m} />)}</colgroup>
            <thead>
              <tr>
                <th className="sticky left-0 z-[2] bg-[#F6F7F9] text-left px-3 py-2 text-[12.5px] font-semibold text-[#1F2933]">범주</th>
                {MONTHS.map(m => {
                  const isNow = year === today.y && m === today.m
                  return (
                    <th key={m} style={{ background: MONTH_TONE[m].head, color: MONTH_TONE[m].title }}
                      className="text-left px-2 py-2 text-[12.5px] font-semibold border-l border-white/70">
                      {m}월{isNow && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full align-middle" style={{ background: MONTH_TONE[m].title }} title="이번 달" />}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {groups.map(g => {
                const lists = MONTHS.map(m => inMonth(tasks, m).filter(t => (t.category_id ?? null) === g.id))
                const rows = Math.max(0, ...lists.map(l => l.length)) + 1
                const count = lists.reduce((n, l) => n + l.length, 0)
                const gKey = g.id ?? 'none'
                return Array.from({ length: rows }, (_, r) => (
                  <tr key={`${gKey}-${r}`} className={`border-b ${r === rows - 1 ? 'border-[#EEF0F2]' : 'border-[#F6F7F9]'}`}>
                    {r === 0 && (
                      <td rowSpan={rows}
                        ref={el => { if (!g.id) return; if (el) catEls.current.set(g.id, el); else catEls.current.delete(g.id) }}
                        style={g.cat ? { background: `linear-gradient(${(g.cat.color ?? NO_CAT_COLOR)}14, ${(g.cat.color ?? NO_CAT_COLOR)}14), #fff`, boxShadow: `inset 3px 0 0 ${g.cat.color ?? NO_CAT_COLOR}` } : undefined}
                        className={`group/cat relative sticky left-0 z-[1] align-top px-2 py-1.5 border-r border-[#F1F3F5] ${g.id ? '' : 'bg-[#FAFBFC]'} ${catDragId === g.id ? 'opacity-40' : ''}`}>
                        {g.id && catDrop?.id === g.id && catDragId && catDragId !== g.id && (
                          <span aria-hidden className={`absolute left-0 right-0 h-[3px] rounded-full bg-[#4C7FE0] z-10 ${catDrop.after ? 'bottom-[-2px]' : 'top-[-2px]'}`} />
                        )}
                        <div className="flex items-start gap-0.5">
                          {g.cat ? (
                            <span onPointerDown={e => startCatDrag(e, g.id!)} title="끌어서 범주 순서 바꾸기"
                              className="w-4 h-[22px] -ml-1 flex items-center justify-center rounded text-[12px] text-[#C7CDD4] group-hover/cat:text-[#9AA3AD] hover:!text-[#4C7FE0] hover:bg-[#EEF3FC] cursor-grab active:cursor-grabbing select-none touch-none flex-shrink-0">⠿</span>
                          ) : <span className="w-4 -ml-1 flex-shrink-0" />}
                          {g.cat && (
                            <button type="button" onClick={() => setColorPickFor(p => p === g.id ? null : g.id)} title="범주 색 바꾸기" aria-label={`${g.name} 색 바꾸기`}
                              className="mt-[3px] w-3 h-4 flex items-center justify-center flex-shrink-0 group/dot">
                              {/* 아주 작은 점(테두리 없음) — 누르는 자리는 조금 넓게 */}
                              <span className="w-1.5 h-1.5 rounded-full transition-transform group-hover/dot:scale-150" style={{ background: g.cat.color ?? NO_CAT_COLOR }} />
                            </button>
                          )}
                          {g.cat && editingCat === g.id ? (
                            <input autoFocus value={catDraft} onChange={e => setCatDraft(e.target.value)} maxLength={40}
                              onBlur={() => commitRenameCategory(g.id!)}
                              onKeyDown={e => { if (e.key === 'Enter') commitRenameCategory(g.id!); if (e.key === 'Escape') setEditingCat(null) }}
                              className="flex-1 min-w-0 bg-white border border-gray-200 rounded px-1 py-0.5 text-[12.5px]" />
                          ) : (
                            <button type="button" disabled={!g.cat} title={g.cat ? '눌러서 이름 바꾸기' : '범주를 안 정한 업무'}
                              onClick={() => { if (g.cat) { setEditingCat(g.cat.id); setCatDraft(g.cat.name) } }}
                              className={`flex-1 min-w-0 text-left break-words py-0.5 text-[13px] font-semibold ${g.cat ? 'text-[#1F2933] hover:text-[#4C7FE0]' : 'text-[#9AA3AD] cursor-default'}`}>{g.name}</button>
                          )}
                          {g.cat && editingCat !== g.id && (
                            <button type="button" onClick={() => deleteCategory(g.cat!)} title="범주 지우기(업무는 미분류로)"
                              className="opacity-0 group-hover/cat:opacity-100 text-[#C7CDD4] hover:text-red-500 flex-shrink-0 text-[11px] mt-1">✕</button>
                          )}
                        </div>
                        <p className="pl-3.5 text-[11px] text-[#9AA3AD] tabular-nums">{count}개</p>
                        {g.cat && colorPickFor === g.id && (
                          <div className="mt-1.5 ml-3 grid grid-cols-5 gap-1 w-fit p-1.5 rounded-lg bg-white border border-[#EEF0F2] shadow-sm">
                            {CATEGORY_COLORS.map(col => (
                              <button key={col} type="button" onClick={() => setCategoryColor(g.id!, col)} aria-label={`색 ${col}`}
                                className={`w-[18px] h-[18px] rounded-full transition-transform hover:scale-110 ${(g.cat!.color ?? '').toUpperCase() === col ? 'ring-2 ring-offset-1 ring-[#1F2933]' : ''}`}
                                style={{ background: col }} />
                            ))}
                          </div>
                        )}
                      </td>
                    )}
                    {MONTHS.map((m, mi) => {
                      const t = lists[mi][r]
                      const firstEmpty = r === lists[mi].length
                      const cellKey = `${gKey}|${m}|${r}`
                      const isDrop = !!dragId && !!dropAt?.cell && dropAt.month === m && dropAt.cell.cat === g.id && dropAt.cell.row === r
                      const adding = addingCell && addingCell.cat === g.id && addingCell.month === m && firstEmpty
                      return (
                        <td key={m}
                          ref={el => { if (el) cellEls.current.set(cellKey, { el, month: m, cat: g.id, row: r }); else cellEls.current.delete(cellKey) }}
                          className={`group relative align-top border-l border-[#F6F7F9] px-1.5 py-1 h-[30px] ${isDrop ? 'bg-[#EEF3FC]' : ''} ${t && dragId === t.id ? 'opacity-40' : ''}`}>
                          {isDrop && t && dragId !== t.id && <span aria-hidden className="absolute left-1 right-1 top-[-1px] h-[2px] rounded-full bg-[#4C7FE0] z-10" />}
                          {t ? (
                            <div className="flex items-start gap-0.5 text-[#3A4249]">
                              <span onPointerDown={e => startDrag(e, t.id)} title="끌어서 다른 칸(범주·월)으로 옮기기" aria-label={`${t.title} 옮기기`}
                                className="w-3.5 h-[20px] -ml-1 flex items-center justify-center rounded text-[11px] text-[#D5DAE0] group-hover:text-[#9AA3AD] hover:!text-[#4C7FE0] hover:bg-[#EEF3FC] cursor-grab active:cursor-grabbing select-none touch-none flex-shrink-0">⠿</span>
                              {editingId === t.id ? (
                                <input autoFocus value={editDraft} onChange={e => setEditDraft(e.target.value)}
                                  onBlur={() => commitEdit(t.id)}
                                  onKeyDown={e => { if (e.key === 'Enter') commitEdit(t.id); if (e.key === 'Escape') setEditingId(null) }}
                                  className="flex-1 min-w-0 bg-white border border-gray-200 rounded px-1 py-0.5 text-[12px]" />
                              ) : (
                                <span className="flex-1 min-w-0 break-words cursor-pointer py-0.5 leading-snug" onClick={() => startEdit(t)}>{t.title}</span>
                              )}
                              <button onClick={() => deleteTask(t.id)} className="opacity-0 group-hover:opacity-100 text-[#C7CDD4] hover:text-red-500 flex-shrink-0 text-[10.5px] mt-0.5">✕</button>
                            </div>
                          ) : adding ? (
                            <input autoFocus value={addDraft} onChange={e => setAddDraft(e.target.value)}
                              onBlur={() => commitAddCell(g.id, m)}
                              onKeyDown={e => { if (e.key === 'Enter') commitAddCell(g.id, m); if (e.key === 'Escape') setAddingCell(null) }}
                              placeholder="업무명" className="w-full bg-white border border-gray-200 rounded px-1 py-0.5 text-[12px]" />
                          ) : firstEmpty && !dragId ? (
                            <button type="button" onClick={() => { setAddingCell({ cat: g.id, month: m }); setAddDraft('') }} title={`${g.name} · ${m}월에 추가`}
                              className="w-full h-full min-h-[20px] text-left text-[12px] text-transparent group-hover:text-[#B0B8C1] hover:!text-[#4C7FE0]">+</button>
                          ) : null}
                        </td>
                      )
                    })}
                  </tr>
                ))
              })}
            </tbody>
          </table>
        </div>
        {addingCat ? (
          <input autoFocus value={catDraft} onChange={e => setCatDraft(e.target.value)} maxLength={40}
            onBlur={commitAddCategory}
            onKeyDown={e => { if (e.key === 'Enter') commitAddCategory(); if (e.key === 'Escape') { setAddingCat(false); setCatDraft('') } }}
            placeholder="범주 이름(예: 교육)" className="w-[200px] bg-white border border-gray-200 rounded-md px-2 py-1 text-[12.5px]" />
        ) : (
          <button type="button" onClick={() => { setAddingCat(true); setCatDraft('') }}
            className="text-[12.5px] text-[#7A8491] hover:text-[#4C7FE0] px-1">+ 범주 추가</button>
        )}
      </div>
    )
  }

  return (
    <div className={`space-y-5 ${dragId ? 'select-none' : ''}`}>
      {/* 연도 바: 큰 연도 제목 + 둥근 화살표, 다른 해를 볼 때만 [↩ 올해로], 오른쪽에 요약 */}
      <div className="flex items-center justify-between flex-wrap gap-x-4 gap-y-2 pb-3 border-b border-[#EEF0F2]">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[26px] leading-none font-bold tracking-tight text-[#1F2933] tabular-nums">{year}년</h2>
          <div className="flex items-center gap-1">
            <button onClick={() => setYear(y => y - 1)} aria-label="이전 해" title="이전 해"
              className="w-8 h-8 flex items-center justify-center rounded-full border border-[#E5E8EB] bg-white text-[16px] text-[#5B6470] hover:text-[#1F2933] hover:border-[#C7CDD4] hover:bg-[#F8F9FA] transition-colors">‹</button>
            <button onClick={() => setYear(y => y + 1)} aria-label="다음 해" title="다음 해"
              className="w-8 h-8 flex items-center justify-center rounded-full border border-[#E5E8EB] bg-white text-[16px] text-[#5B6470] hover:text-[#1F2933] hover:border-[#C7CDD4] hover:bg-[#F8F9FA] transition-colors">›</button>
          </div>
          {year !== today.y && (
            <button onClick={() => setYear(today.y)}
              className="text-[12px] font-medium text-[#4C7FE0] bg-[#EEF3FC] hover:bg-[#DFE9FB] rounded-full px-3 py-1.5 transition-colors">↩ 올해로</button>
          )}
        </div>
        <div className="flex items-center gap-3">
        <div className="flex items-center gap-0.5 bg-[#F1F3F5] rounded-lg p-0.5">
          {([['cards', '🗂 카드'], ['table', '📋 범주표']] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => pickView(v)}
              className={`text-[12.5px] font-medium px-3 py-1.5 rounded-md transition-colors ${view === v ? 'bg-white text-[#1F2933] shadow-sm' : 'text-[#7A8491] hover:text-[#1F2933]'}`}>{label}</button>
          ))}
        </div>
        <p className="text-[12.5px] text-[#7A8491] tabular-nums">
          업무 <b className="text-[#1F2933] font-semibold">{tasks.filter(t => t.month !== TRAY).length}</b>
        </p>
        </div>
      </div>

      {renderMemoBox(<p className="text-[13px] font-semibold text-[#1F2933]">📌 연간 <span className="font-normal text-[#7A8491]">메모</span></p>, 0, 60)}

      {view === 'table' ? renderTable() : (
      <>
      {/* 2열: 왼쪽 상반기 · 오른쪽 하반기 (넓은 화면에선 한 줄 = 한 분기, 좁으면 위아래로) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-2 min-w-0">
          {renderMemoBox(<p className="text-[13px] font-semibold text-[#1F2933]">🌱 상반기 <span className="font-normal text-[#7A8491]">메모 · 1~6월</span></p>, 1, NOTE_H_DEFAULT)}
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            {FIRST_HALF.map(renderMonthCard)}
          </div>
        </div>
        <div className="space-y-2 min-w-0 lg:border-l lg:border-[#EEF0F2] lg:pl-5">
          {renderMemoBox(<p className="text-[13px] font-semibold text-[#1F2933]">🍁 하반기 <span className="font-normal text-[#7A8491]">메모 · 7~12월</span></p>, 2, NOTE_H_DEFAULT)}
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            {SECOND_HALF.map(renderMonthCard)}
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  )
}
