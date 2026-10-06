'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  fieldText, fieldVersion, isVisibleOn, mergeCell, sortReportItems,
  type OpenAction, type PrevReport, type ReportField, type ReportItem, type ReportUpdate,
} from '@/lib/workReport'

// 회의수정 서랍 "업무보고" 데이터 — 열린 회의 하나 기준으로 모든 팀원의 업무 행/이번 회차 칸/직전 기록을 들고,
// 다른 사람 변경은 realtime으로 다시 불러온다. 업무보고 창(WorkReportModal)이 닫혀도 page에 남아 있어서
// 창을 닫는 순간 시작된 blur 저장이 끝까지 처리되고, 서랍 카드의 "업무보고 N" 개수도 여기서 나온다.
//
// 업데이트/피드백 칸은 회의록 진행사항과 같은 OCC: 화면 값 = (내 draft) ?? (서버 값). draft는 처음 입력하는
// 순간 "그때 본 서버 값/version"(base)과 함께 생기고, blur 때 base version을 기대값으로 저장한다.

type Draft = { text: string; baseText: string; baseVersion: number }

export type WorkReportConflict = {
  meetingId: string
  itemId: string
  field: ReportField
  baseText: string
  localText: string
  serverText: string
  serverVersion: number
  updatedAt: string | null
  updatedBy: string | null
}

type Handlers = { onError: (message: string) => void; onUnauthorized: () => void }

// 불러온 데이터는 어느 회의 것인지와 함께 들고 있다 — 지금 열린 회의와 다르면 "아직 안 불러옴"으로 본다.
// draft/실패 키에도 회의 id를 넣어, 회의를 바꿔도 이전 회의의 입력이 섞이지 않는다(effect에서 초기화할 필요 없음).
type Data = {
  meetingId: string; date: string; items: ReportItem[]; cells: Record<string, ReportUpdate>; previous: Record<string, PrevReport>; openActions: OpenAction[]
}

const cellKey = (meetingId: string, itemId: string, field: ReportField) => `${meetingId}:${itemId}:${field}`

export function useWorkReport(meetingId: string | null, meetingDate: string | null, handlers: Handlers) {
  const handlersRef = useRef(handlers)
  useEffect(() => { handlersRef.current = handlers })
  const meetingIdRef = useRef(meetingId)
  useEffect(() => { meetingIdRef.current = meetingId }, [meetingId])

  const [data, setData] = useState<Data | null>(null)
  const current = data && data.meetingId === meetingId ? data : null
  const date = current?.date ?? null
  const items = current?.items ?? []
  const cells = current?.cells ?? {}
  const [failures, setFailures] = useState<Record<string, true>>({})
  const [conflictState, setConflict] = useState<WorkReportConflict | null>(null)
  const conflict = conflictState && conflictState.meetingId === meetingId ? conflictState : null

  // 입력 중인 글(draft)은 React state가 아니라 ref + 칸별 구독으로 들고 있다. 이 훅은 page.tsx 최상단에 있어서
  // state로 두면 글자 하나마다 페이지 전체(캘린더·서랍·업무보고 창)가 다시 그려져 입력이 심하게 버벅였다
  // (한글은 자모마다 입력 이벤트라 더 심함). 이제 바뀐 칸을 구독하는 셀 하나만 다시 그려진다(subscribeDraft/getDraft).
  const draftsRef = useRef<Record<string, Draft>>({})
  const draftListenersRef = useRef<Map<string, Set<() => void>>>(new Map())
  const writeDrafts = useCallback((fn: (prev: Record<string, Draft>) => Record<string, Draft>) => {
    const prev = draftsRef.current
    const next = fn(prev)
    if (next === prev) return
    draftsRef.current = next
    const changed = new Set([...Object.keys(prev), ...Object.keys(next)].filter(k => prev[k] !== next[k]))
    for (const k of changed) draftListenersRef.current.get(k)?.forEach(l => l())
  }, [])
  const subscribeDraft = useCallback((key: string, listener: () => void) => {
    const map = draftListenersRef.current
    if (!map.has(key)) map.set(key, new Set())
    map.get(key)!.add(listener)
    return () => {
      const set = map.get(key)
      set?.delete(listener)
      if (set && set.size === 0) map.delete(key)
    }
  }, [])
  const getDraft = useCallback((key: string) => draftsRef.current[key]?.text, [])
  const dataRef = useRef(data)
  useEffect(() => { dataRef.current = data }, [data])
  const cellOf = (mid: string, itemId: string) => {
    const d = dataRef.current
    return d && d.meetingId === mid ? d.cells[itemId] : undefined
  }

  const setItems = useCallback((mid: string, fn: (prev: ReportItem[]) => ReportItem[]) => {
    setData(d => d && d.meetingId === mid ? { ...d, items: fn(d.items) } : d)
  }, [])

  const mergeCells = useCallback((mid: string, rows: ReportUpdate[]) => {
    setData(d => {
      if (!d || d.meetingId !== mid) return d
      const next = { ...d.cells }
      for (const r of rows) next[r.item_id] = mergeCell(d.cells[r.item_id], r)
      return { ...d, cells: next }
    })
  }, [])

  // 서버 응답 전에 먼저 그려 둔 행(pending) — 재조회 결과로 화면을 바꿔도 사라지지 않게 따로 들고 있다.
  const pendingItemsRef = useRef<Map<string, { mid: string; item: ReportItem }>>(new Map())
  const loadSeqRef = useRef(0)
  // 지난 회의 액션을 완료 처리한 뒤처럼, 화면에서 직접 다시 불러와야 할 때 쓴다(지금 열린 회의 기준).
  const loadRef = useRef<(() => void) | null>(null)
  // 회의가 바뀌면(또는 저장된 회의 날짜가 바뀌어 보이는 행이 달라지면) 다시 불러온다.
  useEffect(() => {
    if (!meetingId) return
    meetingIdRef.current = meetingId
    // realtime 이벤트가 몰리면 재조회가 겹친다 — 응답이 순서를 바꿔 도착해도 옛 목록으로 되돌아가지 않게
    // 가장 나중에 시작한 재조회 결과만 반영한다(실측: 행 3개를 연달아 추가했을 때 마지막 행이 화면에서 사라졌었음).
    async function load(mid: string) {
      const seq = ++loadSeqRef.current
      const res = await fetch(`/api/report-items?meeting_id=${mid}`).catch(() => null)
      if (!res) return
      if (res.status === 401) { handlersRef.current.onUnauthorized(); return }
      const json = await res.json().catch(() => null)
      if (meetingIdRef.current !== mid || seq !== loadSeqRef.current) return
      if (!json?.ok) { handlersRef.current.onError(json?.error ?? '업무보고를 불러오지 못했습니다.'); return }
      setData(d => {
        const prevCells = d && d.meetingId === mid ? d.cells : {}
        const nextCells: Record<string, ReportUpdate> = { ...prevCells }
        for (const r of json.updates as ReportUpdate[]) nextCells[r.item_id] = mergeCell(prevCells[r.item_id], r)
        const pending = [...pendingItemsRef.current.values()].filter(p => p.mid === mid).map(p => p.item)
        return { meetingId: mid, date: json.date, items: [...json.items, ...pending], cells: nextCells, previous: json.previous, openActions: json.open_actions ?? [] }
      })
    }
    loadRef.current = () => { void load(meetingId) }
    void load(meetingId)
    const supabase = createClient()
    // 업무 행은 회의와 직접 연결이 없어(날짜로 걸러냄) 필터 없이 구독한다 — 팀 규모가 작아 부담 없음.
    const channel = supabase
      .channel(`work-report-${meetingId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_log_report_items' }, () => { void load(meetingId) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_log_report_updates', filter: `meeting_id=eq.${meetingId}` }, () => { void load(meetingId) })
      .subscribe()
    return () => { loadRef.current = null; supabase.removeChannel(channel) }
  }, [meetingId, meetingDate])

  // ── 업데이트/피드백 칸 ──────────────────────────────────────────────
  // 서버 값 — 화면 값은 셀이 (내 draft) ?? (이 값)으로 정한다.
  function serverText(itemId: string, field: ReportField) {
    return fieldText(cells[itemId], field)
  }

  function change(itemId: string, field: ReportField, text: string) {
    if (!meetingId || itemId.startsWith('pending-')) return
    const key = cellKey(meetingId, itemId, field)
    const cell = cellOf(meetingId, itemId)
    writeDrafts(prev => ({
      ...prev,
      [key]: prev[key] ? { ...prev[key], text } : { text, baseText: fieldText(cell, field), baseVersion: fieldVersion(cell, field) },
    }))
  }

  function dropDraft(key: string) {
    writeDrafts(prev => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function clearFailure(key: string) {
    setFailures(prev => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  // 같은 칸의 저장은 순서대로 — 빠르게 blur→재입력→blur 해도 늦게 온 옛 응답이 최신을 되돌리지 않게 한다.
  // 대기열의 다음 저장이 옛 version 기준이어도 그 사이 바뀐 게 "내 직전 저장"뿐이면 이어서 쓴다(남의 저장은 409).
  const chainRef = useRef<Record<string, Promise<void>>>({})
  const seqRef = useRef<Record<string, number>>({})
  const ownHopsRef = useRef<Record<string, Record<number, number>>>({})
  const resolveOwn = (key: string, v: number) => {
    const hops = ownHopsRef.current[key]
    while (hops && hops[v] !== undefined) v = hops[v]
    return v
  }

  function save(mid: string, itemId: string, field: ReportField, content: string, baseVersion: number, baseText: string) {
    const key = cellKey(mid, itemId, field)
    const seq = (seqRef.current[key] ?? 0) + 1
    seqRef.current[key] = seq
    const run = (chainRef.current[key] ?? Promise.resolve()).catch(() => {})
      .then(() => runSave(mid, itemId, field, content, baseVersion, baseText, key, seq))
    chainRef.current[key] = run
    void run.finally(() => {
      if (chainRef.current[key] !== run) return
      delete chainRef.current[key]
      delete ownHopsRef.current[key]
    }).catch(() => {})
    return run
  }

  async function runSave(mid: string, itemId: string, field: ReportField, content: string, baseVersion: number, baseText: string, key: string, seq: number) {
    if (seqRef.current[key] !== seq) return
    const expected = resolveOwn(key, baseVersion)
    const res = await fetch('/api/report-updates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, meeting_id: mid, field, content, expected_version: expected }),
    }).catch(() => null)
    if (res?.status === 401) { handlersRef.current.onUnauthorized(); return }
    const json = res ? await res.json().catch(() => null) : null
    if (res?.status === 409 && json?.conflict) {
      // 고르게 하지 않는다: 서버 최신값으로 바로 바꾸고, 내가 쓴 글은 안내창(conflict)에 남겨 복사할 수 있게 한다.
      const cur = json.current as ReportUpdate | null
      if (cur) mergeCells(mid, [cur])
      dropDraft(key)
      clearFailure(key)
      if (meetingIdRef.current !== mid) {
        handlersRef.current.onError('업무보고가 그 사이 다른 분에 의해 저장돼 내 내용이 저장되지 않았습니다.')
        return
      }
      setConflict({
        meetingId: mid, itemId, field, baseText, localText: content,
        serverText: fieldText(cur ?? undefined, field), serverVersion: fieldVersion(cur ?? undefined, field),
        updatedAt: cur?.updated_at ?? null, updatedBy: cur?.updated_by ?? null,
      })
      return
    }
    if (json?.ok) {
      const saved = json.update as ReportUpdate
      const savedVersion = fieldVersion(saved, field)
      ownHopsRef.current[key] = { ...(ownHopsRef.current[key] ?? {}), [expected]: savedVersion }
      mergeCells(mid, [saved])
      // 저장한 내용 그대로면 draft를 지우고, 그 사이 더 입력했으면 base만 새 version으로 옮긴다.
      writeDrafts(prev => {
        const d = prev[key]
        if (!d) return prev
        const next = { ...prev }
        if (d.text === content) delete next[key]
        else next[key] = { ...d, baseText: content, baseVersion: savedVersion }
        return next
      })
      clearFailure(key)
      return
    }
    // draft가 남아 있어 화면엔 방금 쓴 내용이 그대로다. 토스트만으론 놓치기 쉬워 칸에 "다시 시도"를 남긴다.
    handlersRef.current.onError(json?.error ?? '업무보고 저장에 실패했습니다.')
    setFailures(prev => ({ ...prev, [key]: true }))
  }

  function blur(itemId: string, field: ReportField) {
    if (!meetingId) return
    const key = cellKey(meetingId, itemId, field)
    const d = draftsRef.current[key]
    if (!d) return
    if (d.text === d.baseText) { dropDraft(key); return }
    void save(meetingId, itemId, field, d.text, d.baseVersion, d.baseText)
  }

  function retry(itemId: string, field: ReportField) {
    if (!meetingId) return
    const d = draftsRef.current[cellKey(meetingId, itemId, field)]
    if (d) void save(meetingId, itemId, field, d.text, d.baseVersion, d.baseText)
  }

  function dismissConflict() {
    setConflict(null)
  }

  // ── 업무 행 ──────────────────────────────────────────────────────
  async function request(method: 'POST' | 'PATCH' | 'DELETE', body: unknown, failMessage: string) {
    const res = await fetch('/api/report-items', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => null)
    if (res?.status === 401) { handlersRef.current.onUnauthorized(); return null }
    const json = res ? await res.json().catch(() => null) : null
    if (!json?.ok) { handlersRef.current.onError(json?.error ?? failMessage); return null }
    return json
  }

  // Enter 즉시 행을 먼저 그린다(pending) — 예전엔 서버 왕복(+DB 3회)이 끝나야 행이 보여 1초 넘게 걸렸다.
  // 저장되면 같은 자리의 실제 행으로 바꾸고, 실패하면 지우고 null을 돌려준다(호출부가 입력값을 되돌림).
  async function addItem(memberId: string, title: string): Promise<ReportItem | null> {
    const mid = meetingId
    const d = dataRef.current
    if (!mid || !d || d.meetingId !== mid) return null
    const mine = d.items.filter(i => i.member_id === memberId)
    const sortOrder = (mine.length ? Math.max(...mine.map(i => i.sort_order)) : -1) + 1
    const temp: ReportItem = {
      id: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`, member_id: memberId, title,
      start_date: d.date, closed_on: null, sort_order: sortOrder, created_at: new Date().toISOString(), pending: true,
    }
    pendingItemsRef.current.set(temp.id, { mid, item: temp })
    setItems(mid, prev => [...prev, temp])
    const json = await request('POST', { meeting_id: mid, member_id: memberId, title, start_date: d.date, sort_order: sortOrder }, '업무를 추가하지 못했습니다.')
    pendingItemsRef.current.delete(temp.id)
    if (!json) { setItems(mid, prev => prev.filter(i => i.id !== temp.id)); return null }
    const item = json.item as ReportItem
    setItems(mid, prev => {
      const without = prev.filter(i => i.id !== temp.id)
      return without.some(i => i.id === item.id) ? without.map(i => (i.id === item.id ? item : i)) : [...without, item]
    })
    return item
  }

  async function renameItem(item: ReportItem, title: string) {
    const mid = meetingId
    const trimmed = title.trim()
    if (!mid || trimmed === item.title) return true
    setItems(mid, prev => prev.map(i => i.id === item.id ? { ...i, title: trimmed } : i))
    const json = await request('PATCH', { id: item.id, title: trimmed }, '업무명을 저장하지 못했습니다.')
    if (!json) { setItems(mid, prev => prev.map(i => i.id === item.id ? { ...i, title: item.title } : i)); return false }
    return true
  }

  // 완료 = 이 회의에서 끝냄(이 회의엔 취소선으로 남고 다음 회의부터 안 보임). 다시 누르면 완료 취소.
  async function setDone(item: ReportItem, done: boolean) {
    const mid = meetingId
    if (!mid) return
    const json = await request('PATCH', { id: item.id, close_meeting_id: done ? mid : null }, '완료 상태를 저장하지 못했습니다.')
    if (json) setItems(mid, prev => prev.map(i => i.id === item.id ? json.item as ReportItem : i))
  }

  async function deleteItem(item: ReportItem) {
    const mid = meetingId
    if (!mid) return
    const json = await request('DELETE', { id: item.id }, '업무를 삭제하지 못했습니다.')
    if (!json) return
    setItems(mid, prev => prev.filter(i => i.id !== item.id))
    writeDrafts(prev => {
      const next = { ...prev }
      delete next[cellKey(mid, item.id, 'update')]
      delete next[cellKey(mid, item.id, 'feedback')]
      return next
    })
  }

  // 지난 회의에서 이 업무 행으로 등록한 액션 완료 — 지금 회의의 결정사항/액션 목록엔 없는 항목이라 여기서 직접 처리한다.
  async function completeOpenAction(action: OpenAction) {
    const mid = meetingId
    const res = await fetch('/api/meeting-items', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: action.id, done: true }),
    }).catch(() => null)
    if (res?.status === 401) { handlersRef.current.onUnauthorized(); return }
    const json = res ? await res.json().catch(() => null) : null
    if (!json?.ok) handlersRef.current.onError(json?.error ?? '완료 처리에 실패했습니다.')
    else if (mid) setData(d => d && d.meetingId === mid ? { ...d, openActions: d.openActions.filter(a => a.id !== action.id) } : d)
    loadRef.current?.()
  }

  const visibleItems = date ? sortReportItems(items.filter(i => isVisibleOn(i, date))) : []
  const isDoneHere = (item: ReportItem) => item.closed_on !== null && item.closed_on === date

  // 미확정 회의를 취소할 때 지워도 되는지 판단용 — 이 회의에 쓴 업무보고 칸, 저장 전 입력, 이 회의 날짜에
  // 새로 만든 업무 행이 하나라도 있으면 내용이 있는 것으로 친다.
  function hasContent() {
    if (!meetingId) return false
    const d = dataRef.current
    const mine = d && d.meetingId === meetingId ? d : null
    return Object.values(mine?.cells ?? {}).some(c => c.update_text.trim() || c.feedback.trim())
      || Object.entries(draftsRef.current).some(([k, dr]) => k.startsWith(`${meetingId}:`) && dr.text.trim())
      || (mine !== null && mine.items.some(i => i.start_date === mine.date))
  }

  return {
    meetingId, loaded: current !== null, date, items: visibleItems, previous: current?.previous ?? {}, openActions: current?.openActions ?? [], failures, conflict,    serverText, subscribeDraft, getDraft, change, blur, retry, dismissConflict, isDoneHere, hasContent,
    addItem, renameItem, setDone, deleteItem, completeOpenAction,
    failureKey: (itemId: string, field: ReportField) => cellKey(meetingId ?? '', itemId, field),
  }
}

export type WorkReportState = ReturnType<typeof useWorkReport>
