'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  fieldText, fieldVersion, isVisibleOn, mergeCell, ownerIdsOf, sortReportItems,
  type OpenAction, type PrevReport, type ReportField, type ReportItem, type ReportKind, type ReportUpdate,
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

type Handlers = {
  onError: (message: string) => void
  onUnauthorized: () => void
  // 안건 담당자를 바꿔 서버가 그 행의 미완료 액션(과 일정)도 새 담당자로 옮겼을 때 — 화면의 액션/일정을 다시 맞춘다.
  onActionsMoved?: (count: number) => void
}

// 불러온 데이터는 어느 회의 것인지와 함께 들고 있다 — 지금 열린 회의와 다르면 "아직 안 불러옴"으로 본다.
// draft/실패 키에도 회의 id를 넣어, 회의를 바꿔도 이전 회의의 입력이 섞이지 않는다(effect에서 초기화할 필요 없음).
type Data = {
  meetingId: string; date: string; items: ReportItem[]; cells: Record<string, ReportUpdate>; previous: Record<string, PrevReport>; openActions: OpenAction[]
}

const cellKey = (meetingId: string, itemId: string, field: ReportField) => `${meetingId}:${itemId}:${field}`

// 한 번 불러온 회의의 표 데이터 — 같은 회의를 다시 열면 이걸 먼저 그려 즉시 보이게 하고, 뒤에서 최신으로 맞춘다.
// 달력·검색·리마인더에서 회의에 마우스를 올릴 때, 홈 진입 시 이번 주 회의에 prefetchWorkReport로 미리 채워 두기도 한다.
const reportCache = new Map<string, Data>()
// 캐시를 마지막으로 서버와 맞춘 시각. 회의창을 닫으면 실시간 구독도 끊겨 그 뒤 남이 고친 내용은 캐시에 안 들어오므로,
// 이 시간이 지난 캐시는 먼저 그리지 않고 평소처럼 조회를 기다린다(수정 전 내용이 잠깐 다시 보이지 않게).
export const MEETING_CACHE_TTL_MS = 5 * 60_000
// 회의창 캐시(이 표 + page의 결정·액션/팀원 메모)는 남의 수정을 page의 무효화 구독으로만 알아챈다 — 그 구독이 연결돼
// 있을 때만 캐시를 믿는다. 끊겼다 다시 붙는 사이 놓친 신호가 있을 수 있어 그때마다 page가 캐시 전체를 무효로 한다.
let cacheTrusted = false
export const isMeetingCacheTrusted = () => cacheTrusted
export function setMeetingCacheTrusted(v: boolean) { cacheTrusted = v }
const reportCachedAt = new Map<string, number>()
const isReportCacheFresh = (mid: string) => cacheTrusted && Date.now() - (reportCachedAt.get(mid) ?? 0) < MEETING_CACHE_TTL_MS
// 캐시 세대 — 무효화나 "닫을 때 최신값 남기기"마다 올린다. 그보다 먼저 시작한 조회의 응답은 캐시에 쓰지도, 회의창을
// 열 때 이어받지도 않는다(늦게 온 옛 응답이 더 최신인 캐시를 덮거나 무효화된 캐시를 다시 '최근 것'으로 만들지 않게).
let reportEpoch = 0 // 전체 무효화용
const reportGen = new Map<string, number>()
const reportToken = (mid: string) => `${reportEpoch}:${reportGen.get(mid) ?? 0}`
const bumpReportGen = (mid: string) => reportGen.set(mid, (reportGen.get(mid) ?? 0) + 1)
// token: 조회를 시작할 때의 세대. 그 사이 세대가 바뀌었으면 쓰지 않는다(없으면 = 지금 화면의 최신값이라 그대로 쓴다).
function putReportCache(mid: string, d: Data, token?: string) {
  if (token !== undefined && token !== reportToken(mid)) return
  reportCache.set(mid, { ...d, items: d.items.filter(i => !i.pending) })
  reportCachedAt.set(mid, Date.now())
}
// 닫혀 있는 회의를 누가 고쳤다는 신호(page의 캐시 무효화 구독)를 받으면 그 회의(없으면 전부) 캐시를 오래된 것으로 친다.
// 업무 행은 회의가 아니라 날짜로 걸리므로 행이 바뀌면 전부, 칸은 그 회의만.
export function invalidateReportCache(meetingId?: string) {
  if (meetingId) { reportCachedAt.delete(meetingId); bumpReportGen(meetingId) }
  else { reportCachedAt.clear(); reportEpoch++ }
}

type ReportJson = { ok: true; date: string; items: ReportItem[]; updates: ReportUpdate[]; previous: Record<string, PrevReport>; open_actions?: OpenAction[] }

function dataFromJson(mid: string, json: ReportJson): Data {
  const cells: Record<string, ReportUpdate> = {}
  for (const r of json.updates) cells[r.item_id] = r
  return { meetingId: mid, date: json.date, items: json.items, cells, previous: json.previous, openActions: json.open_actions ?? [] }
}

// 진행 중인 미리받기 — 회의창이 열리며 시작하는 첫 조회는 같은 요청을 또 보내지 않고 이 응답을 이어받는다
// (시작한 뒤 세대가 바뀌었으면 이어받지 않는다).
const prefetching = new Map<string, { p: Promise<ReportJson | null>; token: string }>()
export function prefetchWorkReport(meetingId: string, meetingDate: string): Promise<void> {
  const token = reportToken(meetingId)
  const running = prefetching.get(meetingId)
  if (running && running.token === token) return running.p.then(() => {})
  if (isReportCacheFresh(meetingId)) return Promise.resolve()
  const dateParam = /^\d{4}-\d{2}-\d{2}$/.test(meetingDate) ? `&date=${meetingDate}` : ''
  const p: Promise<ReportJson | null> = fetch(`/api/report-items?meeting_id=${meetingId}${dateParam}`)
    .then(r => (r.ok ? r.json() : null))
    .then((json: ReportJson | null) => {
      if (!json?.ok) return null
      putReportCache(meetingId, dataFromJson(meetingId, json), token)
      return json
    })
    .catch(() => null)
    .finally(() => { if (prefetching.get(meetingId)?.p === p) prefetching.delete(meetingId) })
  prefetching.set(meetingId, { p, token })
  return p.then(() => {})
}

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
  // 표 조회가 실패한 회의 — 그린 데이터가 없을 때 "불러오는 중" 대신 오류 안내 + 다시 시도(reload)를 띄운다.
  const [loadFailedFor, setLoadFailedFor] = useState<string | null>(null)
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
  // 실시간 이벤트를 화면에 바로 반영할 때마다 올린다 — 그보다 먼저 시작한 재조회 응답이 늦게 와서
  // 방금 반영한 행 목록을 옛 값으로 덮지 않게 한다(칸은 version 비교로 이미 안전).
  const eventSeqRef = useRef(0)
  // 지난 회의 액션을 완료 처리한 뒤처럼, 화면에서 직접 다시 불러와야 할 때 쓴다(지금 열린 회의 기준).
  const loadRef = useRef<(() => Promise<void>) | null>(null)
  // 지금 data가 서버에서 받아 실시간으로 맞추고 있는 회의(캐시만 그려 두고 아직 못 받았으면 null).
  const liveMeetingRef = useRef<string | null>(null)
  // 회의가 바뀌면(또는 저장된 회의 날짜가 바뀌어 보이는 행이 달라지면) 다시 불러온다.
  useEffect(() => {
    if (!meetingId) return
    meetingIdRef.current = meetingId
    // 전에 불러온(또는 미리 받아 둔) 데이터가 최근 것이면 먼저 그린다 — 아래 load가 곧 최신으로 맞춘다.
    // 오래된 캐시는 그리지 않고 비워 둔다(이미 들고 있는 같은 회의 데이터도 마찬가지).
    const fresh = isReportCacheFresh(meetingId)
    const cached = fresh ? reportCache.get(meetingId) : undefined
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 캐시를 즉시 그려 회의창이 바로 열리게 한다
    setData(d => (d && d.meetingId === meetingId && fresh ? d : cached ?? null))
    // realtime 이벤트가 몰리면 재조회가 겹친다 — 응답이 순서를 바꿔 도착해도 옛 목록으로 되돌아가지 않게
    // 가장 나중에 시작한 재조회 결과만 반영한다(실측: 행 3개를 연달아 추가했을 때 마지막 행이 화면에서 사라졌었음).
    // reuse: 회의창을 열 때의 첫 조회 — 같은 회의를 미리 받는 중이면 그 응답을 이어받고, 실패했으면 평소처럼 조회한다.
    async function load(mid: string, reuse = false) {
      const seq = ++loadSeqRef.current
      const eventSeq = eventSeqRef.current
      // 회의 날짜를 같이 보내 서버가 날짜를 다시 조회하지 않게 한다(해외 리전 DB 왕복 1번 절약).
      const dateParam = meetingDate && /^\d{4}-\d{2}-\d{2}$/.test(meetingDate) ? `&date=${meetingDate}` : ''
      const token = reportToken(mid)
      const running = reuse ? prefetching.get(mid) : undefined
      const pre = running && running.token === token ? await running.p : null
      let json: ReportJson | { ok?: false; error?: string } | null = pre && (!dateParam || pre.date === meetingDate) ? pre : null
      if (!json) {
        const res = await fetch(`/api/report-items?meeting_id=${mid}${dateParam}`).catch(() => null)
        if (!res) {
          if (meetingIdRef.current === mid && seq === loadSeqRef.current) setLoadFailedFor(mid)
          return
        }
        if (res.status === 401) { handlersRef.current.onUnauthorized(); return }
        json = await res.json().catch(() => null)
      }
      if (meetingIdRef.current !== mid || seq !== loadSeqRef.current) return
      if (!json?.ok) { setLoadFailedFor(mid); handlersRef.current.onError(json?.error ?? '업무보고를 불러오지 못했습니다.'); return }
      setLoadFailedFor(null)
      setData(d => {
        const prevCells = d && d.meetingId === mid ? d.cells : {}
        const nextCells: Record<string, ReportUpdate> = { ...prevCells }
        for (const r of json.updates as ReportUpdate[]) nextCells[r.item_id] = mergeCell(prevCells[r.item_id], r)
        const pending = [...pendingItemsRef.current.values()].filter(p => p.mid === mid).map(p => p.item)
        const keepItems = eventSeq !== eventSeqRef.current && d && d.meetingId === mid
        const items = keepItems ? d.items : [...json.items, ...pending]
        const next = { meetingId: mid, date: json.date, items, cells: nextCells, previous: json.previous, openActions: json.open_actions ?? [] }
        putReportCache(mid, next, token)
        return next
      })
      liveMeetingRef.current = mid
    }
    loadRef.current = () => load(meetingId)
    void load(meetingId, true)

    // 다른 사람의 변경은 이벤트에 담겨 온 행으로 바로 반영한다 — 예전엔 이벤트마다 표 전체를 다시 불러와
    // (해외 리전 DB 왕복 3번, 실측 1.1~1.3초) 남의 저장이 늦게 보였다. 지난 기록·이전 액션처럼 다른 회의에
    // 걸친 값은 이벤트에 없으니, 이벤트가 잠잠해진 뒤 한 번 조용히 다시 불러와 맞춘다.
    let reconcile: ReturnType<typeof setTimeout> | null = null
    const scheduleReconcile = () => {
      if (reconcile) clearTimeout(reconcile)
      reconcile = setTimeout(() => { void load(meetingId) }, 1500)
    }
    const mid = meetingId
    const onItem = (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
      eventSeqRef.current++
      setData(d => {
        if (!d || d.meetingId !== mid) return d
        if (payload.eventType === 'DELETE') {
          const id = payload.old?.id as string | undefined
          return id ? { ...d, items: d.items.filter(i => i.id !== id) } : d
        }
        const row = payload.new as unknown as ReportItem
        if (!row?.id) return d
        const without = d.items.filter(i => i.id !== row.id)
        if (!isVisibleOn(row, d.date)) return { ...d, items: without }
        // 내가 방금 추가해 아직 저장 중(pending)인 행이면 addItem이 실제 행으로 바꿔 넣는다 — 여기서 겹쳐 넣지 않는다.
        const exists = d.items.some(i => i.id === row.id)
        return { ...d, items: exists ? d.items.map(i => (i.id === row.id ? { ...i, ...row, pending: undefined } : i)) : [...without, row] }
      })
      scheduleReconcile()
    }
    const onUpdate = (payload: { eventType: string; new: Record<string, unknown> }) => {
      if (payload.eventType === 'DELETE') { scheduleReconcile(); return }
      const row = payload.new as unknown as ReportUpdate
      if (row?.item_id) mergeCells(mid, [row])
      scheduleReconcile()
    }
    const supabase = createClient()
    // 업무 행은 회의와 직접 연결이 없어(날짜로 걸러냄) 필터 없이 구독한다 — 팀 규모가 작아 부담 없음.
    const channel = supabase
      .channel(`work-report-${meetingId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_log_report_items' }, onItem)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_log_report_updates', filter: `meeting_id=eq.${meetingId}` }, onUpdate)
      .subscribe()
    return () => {
      if (reconcile) clearTimeout(reconcile)
      loadRef.current = null
      supabase.removeChannel(channel)
      // 닫는(또는 다른 회의로 옮기는) 순간까지는 실시간으로 맞춰 둔 값이다 — 내가 방금 고친 내용까지 캐시에 남겨
      // 다시 열었을 때 수정 전 값이 보이지 않게 한다. 서버에서 한 번도 못 받았으면(캐시만 그린 상태) 남기지 않는다.
      const d = dataRef.current
      if (liveMeetingRef.current === mid && d && d.meetingId === mid) { putReportCache(mid, d); bumpReportGen(mid) }
      liveMeetingRef.current = null
    }
  }, [meetingId, meetingDate, mergeCells])

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

  // 저장이 끝나면 resolve — 호출부가 그 뒤에 칸 잠금을 푼다(다른 사람은 해제를 보고 최신값을 읽는다).
  function blur(itemId: string, field: ReportField): Promise<void> {
    if (!meetingId) return Promise.resolve()
    const key = cellKey(meetingId, itemId, field)
    const d = draftsRef.current[key]
    if (!d) return Promise.resolve()
    if (d.text === d.baseText) { dropDraft(key); return Promise.resolve() }
    return save(meetingId, itemId, field, d.text, d.baseVersion, d.baseText)
  }

  // 칸 잠금을 다른 사람에게 졌을 때 — 내 미저장 입력을 버린다(그 사람 글이 기준이 된다).
  function discard(itemId: string, field: ReportField) {
    if (!meetingId) return
    const key = cellKey(meetingId, itemId, field)
    dropDraft(key)
    clearFailure(key)
  }

  // 다른 사람이 쓰던 칸이 풀렸을 때 최신값을 확실히 맞추려고 부른다(끝날 때까지 그 칸은 "불러오는 중").
  // 조회 실패 안내의 "다시 시도"에도 쓴다(다시 받는 동안은 실패 안내 대신 불러오는 중).
  function reload(): Promise<void> {
    setLoadFailedFor(null)
    return loadRef.current?.() ?? Promise.resolve()
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
  // 안건(kind 'agenda')은 팀원과 무관하게 안건끼리 순서를 매기고, 담당자(memberId)는 없어도 된다.
  async function addItem(memberId: string | null, title: string, kind: ReportKind = 'report', pinned = false): Promise<ReportItem | null> {
    const mid = meetingId
    const d = dataRef.current
    if (!mid || !d || d.meetingId !== mid) return null
    const mine = d.items.filter(i => i.kind === kind && (kind === 'agenda' || i.member_id === memberId))
    const sortOrder = (mine.length ? Math.max(...mine.map(i => i.sort_order)) : -1) + 1
    const temp: ReportItem = {
      id: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`, kind, member_id: memberId, title,
      start_date: d.date, closed_on: null, sort_order: sortOrder, created_at: new Date().toISOString(), pinned, pending: true,
    }
    pendingItemsRef.current.set(temp.id, { mid, item: temp })
    setItems(mid, prev => [...prev, temp])
    const json = await request('POST', { meeting_id: mid, kind, member_id: memberId, title, start_date: d.date, sort_order: sortOrder, pinned }, kind === 'agenda' ? '안건을 추가하지 못했습니다.' : '업무를 추가하지 못했습니다.')
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

  // 고정 안건 "방식" 저장 — 바로 화면에 반영하고 실패하면 되돌린다.
  async function setNote(item: ReportItem, note: string) {
    const mid = meetingId
    if (!mid || (item.note ?? '') === note) return true
    setItems(mid, prev => prev.map(i => i.id === item.id ? { ...i, note } : i))
    const json = await request('PATCH', { id: item.id, note }, '방식을 저장하지 못했습니다.')
    if (!json) { setItems(mid, prev => prev.map(i => i.id === item.id ? { ...i, note: item.note } : i)); return false }
    return true
  }

  // 안건 담당자 변경(여러 명, 첫 번째가 대표 · 빈 목록 = 담당자 없음). 바로 화면에 반영하고 실패하면 되돌린다.
  // 지금 열린 회의 날짜를 담당자 지정일(assigned_on)로 같이 저장한다 — 그다음 회의부터 오늘 안건에서 빠진다.
  async function setOwners(item: ReportItem, memberIds: string[]) {
    const mid = meetingId
    const d = dataRef.current
    if (!mid || !d || d.meetingId !== mid || ownerIdsOf(item).join() === memberIds.join()) return
    const assignedOn = memberIds.length > 0 ? d.date : null
    const next = { member_id: memberIds[0] ?? null, co_member_ids: memberIds.slice(1), assigned_on: assignedOn }
    setItems(mid, prev => prev.map(i => i.id === item.id ? { ...i, ...next } : i))
    const json = await request('PATCH', { id: item.id, member_ids: memberIds, assign_date: assignedOn }, '담당자를 저장하지 못했습니다.')
    if (!json) setItems(mid, prev => prev.map(i => i.id === item.id ? { ...i, member_id: item.member_id, co_member_ids: item.co_member_ids, assigned_on: item.assigned_on } : i))
    else if (json.moved_actions > 0) {
      handlersRef.current.onActionsMoved?.(json.moved_actions)
      void loadRef.current?.() // 이전 회의에서 등록한 액션(openActions)의 담당자도 다시 맞춘다
    }
  }

  // 행 순서 바꾸기(핸들 끌기) — 넘겨받은 순서대로 sort_order를 0,1,2…로 다시 매긴다. 바로 화면에 반영하고,
  // 바뀐 행만 저장한다. 하나라도 실패하면 서버 값으로 다시 불러온다.
  async function reorderItems(ordered: ReportItem[]) {
    const mid = meetingId
    if (!mid || ordered.some(i => i.pending)) return
    const changed = ordered.map((i, idx) => ({ item: i, order: idx })).filter(x => x.item.sort_order !== x.order)
    if (changed.length === 0) return
    const next = new Map(changed.map(x => [x.item.id, x.order]))
    setItems(mid, prev => prev.map(i => next.has(i.id) ? { ...i, sort_order: next.get(i.id)! } : i))
    const results = await Promise.all(changed.map(x => request('PATCH', { id: x.item.id, sort_order: x.order }, '순서를 저장하지 못했습니다.')))
    if (results.some(r => !r)) void loadRef.current?.()
  }

  // 완료 = 이 회의에서 끝냄(이 회의엔 취소선으로 남고 다음 회의부터 안 보임). 다시 누르면 완료 취소.
  // 체크는 누르는 즉시 바꾸고(예전엔 서버 응답까지 기다려 살짝 늦게 체크됐다), 실패하면 되돌린다.
  // 회의 날짜(close_date)를 같이 보내 서버가 회의 날짜를 다시 조회하지 않게 한다(DB 왕복 2번 → 1번).
  async function setDone(item: ReportItem, done: boolean) {
    const mid = meetingId
    const d = dataRef.current
    if (!mid || !d || d.meetingId !== mid) return
    setItems(mid, prev => prev.map(i => i.id === item.id ? { ...i, closed_on: done ? d.date : null } : i))
    const json = await request('PATCH', { id: item.id, close_meeting_id: done ? mid : null, close_date: done ? d.date : null }, '완료 상태를 저장하지 못했습니다.')
    if (json) setItems(mid, prev => prev.map(i => i.id === item.id ? json.item as ReportItem : i))
    else setItems(mid, prev => prev.map(i => i.id === item.id ? { ...i, closed_on: item.closed_on } : i))
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
    void loadRef.current?.()
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
    meetingId, loaded: current !== null, loadFailed: current === null && loadFailedFor === meetingId, date, items: visibleItems, previous: current?.previous ?? {}, openActions: current?.openActions ?? [], failures, conflict,    serverText, subscribeDraft, getDraft, change, blur, retry, discard, reload, dismissConflict, isDoneHere, hasContent,
    addItem, renameItem, setNote, setOwners, setDone, deleteItem, reorderItems, completeOpenAction,
    failureKey: (itemId: string, field: ReportField) => cellKey(meetingId ?? '', itemId, field),
  }
}

export type WorkReportState = ReturnType<typeof useWorkReport>
