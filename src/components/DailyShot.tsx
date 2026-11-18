'use client'

// 홈 "한 판" 카드의 🎯 오늘의 한 발 — 하루 1발 다트, 팀 공용 과녁 + 주간 순위. (2026-11-18, 펜싱 대신)
// [오늘의 한 발 쏘기] → 세로 조준선이 좌우로 왕복 → Space/탭으로 멈춤 → 가로 조준선이 위아래로 왕복 → Space/탭 → 다트가 바람에 밀리며 날아감.
// 오늘의 조건(바람·조준 속도)은 날짜로 정해져 팀 전원이 같다 — 바람을 보고 반대쪽을 겨누는 게 요령.
// 실시간 통신은 쓰지 않는다: 결과는 DB(daily_shots) 한 줄, 다른 사람 화면은 표 변경 알림으로 다시 읽는다(하루 몇 건).
// DB 규칙(하루 1발·누르는 순간 소모·점수 서버 계산)은 supabase/add_daily_shot.sql.
// 연습 한 판(2026-11-18): 진짜 한 발 전에 하루 1번, 같은 바람으로 쏴 볼 수 있다. 저장 안 함(이 브라우저에만 기억), 과녁엔 흐리게 남는다.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { displayName } from '@/lib/members'
import { tagColor } from '@/lib/paperTower'
import { getServerOffset } from '@/lib/serverClock'
import { addDays, conditionOf, kstDay, landing, rankOf, scoreOf, sweep, weekStart, type Condition, type ShotRow } from '@/lib/dailyShot'

const VW = 480, VH = 400
const CX = 240, CY = 212, R = 160
const STAGE_T = 6      // 조준 단계마다 제한 시간(초) — 지나면 그 자리에서 자동으로 멈춤
const FLY_T = 0.75
const FONT = '"Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif'
// 과녁 고리 색(바깥→안) — 보라 계열 없음
const RINGS = ['#F4EBD9', '#2F3A45', '#F4EBD9', '#2F3A45', '#F4EBD9', '#3F7F5F', '#F4EBD9', '#3F7F5F', '#E8833A', '#F4EBD9']

type Phase = 'idle' | 'x' | 'y' | 'fly' | 'done'
type Dot = { x: number; y: number; color: string; initial: string; mine: boolean }

const ERR: Record<string, string> = {
  NOT_MEMBER: '팀원 계정으로 로그인해야 쏠 수 있어요',
  ALREADY: '오늘은 이미 쐈어요 — 내일 다시!',
  EXPIRED: '시간이 너무 지나 기록되지 않았어요',
  BAD_INPUT: '기록하지 못했어요',
}
const practiceKey = (me: string, day: string) => `hrm_daily_shot_practice:${me}:${day}`
type Practice = { x: number; y: number; score: number }
const errCode = (e: { message?: string } | null) => Object.keys(ERR).find(k => (e?.message ?? '').includes(k)) ?? null

export default function DailyShot() {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const { allMembers } = useMembers()
  const { me } = useCurrentMember()
  const [rows, setRows] = useState<ShotRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [today, setToday] = useState(() => kstDay(Date.now()))
  const [phase, setPhase] = useState<Phase>('idle')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [practice, setPractice] = useState<Practice | null>(null)   // 오늘 연습 결과(했으면)
  const [practicing, setPracticing] = useState(false)                  // 지금 쏘는 게 연습인지
  const practiceRef = useRef<Practice | null>(null)
  const loadSeq = useRef(0)
  // 조준·비행 상태(그리기용, React 렌더와 분리)
  const g = useRef({ phase: 'idle' as Phase, t: 0, ax: 0, ay: 0, phX: 0, phY: 0, land: { x: 0, y: 0 }, score: 0, popT: 0, raf: 0 as number | 0, practice: false })
  const dotsRef = useRef<Dot[]>([])
  const condRef = useRef<Condition>(conditionOf(today))

  const nameOf = useCallback((id: string) => { const m = allMembers.find(x => x.id === id); return m ? displayName(m) : '누군가' }, [allMembers])

  // 서버 시계 기준 오늘(서울)
  useEffect(() => {
    let alive = true
    void getServerOffset().then(off => { if (alive) setToday(kstDay(Date.now() + off)) })
    return () => { alive = false }
  }, [])
  useEffect(() => { condRef.current = conditionOf(today) }, [today])

  // 오늘 연습했는지(이 브라우저 기억)
  useEffect(() => {
    let v: Practice | null = null
    try { const raw = me ? window.localStorage.getItem(practiceKey(me.id, today)) : null; v = raw ? JSON.parse(raw) as Practice : null } catch {}
    practiceRef.current = v
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 저장값은 마운트 뒤에만 읽을 수 있다
    setPractice(v)
  }, [me, today])

  const lastWeek = addDays(weekStart(today), -7)
  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    const { data, error } = await createClient().from('daily_shots').select('id,member_id,day,x,y,score,started_at').gte('day', lastWeek).order('id')
    if (seq !== loadSeq.current) return
    if (error) { setLoadFailed(true); return }
    setRows((data ?? []) as ShotRow[]); setLoaded(true); setLoadFailed(false)
  }, [lastWeek])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 서버 상태를 마운트 때 받아 온다
    void load()
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | null = null
    const ch = supabase.channel('daily-shot')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_shots' }, () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { void load() }, 300) })
      .subscribe()
    return () => { if (timer) clearTimeout(timer); void supabase.removeChannel(ch) }
  }, [load])

  const todayRows = rows.filter(r => r.day === today)
  const mine = me ? todayRows.find(r => r.member_id === me.id) ?? null : null

  // 과녁에 꽂힌 오늘의 다트들
  useEffect(() => {
    dotsRef.current = todayRows.filter(r => r.x != null && r.y != null).map(r => {
      const m = allMembers.find(x => x.id === r.member_id)
      return { x: r.x!, y: r.y!, color: tagColor(m?.color_key), initial: m ? displayName(m).slice(0, 1) : '?', mine: r.member_id === me?.id }
    })
    draw()
  })

  function draw() {
    const cv = cvRef.current; if (!cv) return
    const w = cv.clientWidth || VW, dpr = window.devicePixelRatio || 1
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(w * dpr * VH / VW) }
    const ctx = cv.getContext('2d'); if (!ctx) return
    const s = cv.width / VW, st = g.current, c = condRef.current
    ctx.setTransform(s, 0, 0, s, 0, 0)
    ctx.fillStyle = '#DCE6E0'; ctx.fillRect(0, 0, VW, VH)
    // 나무 판
    ctx.fillStyle = '#8B6A48'; ctx.beginPath(); ctx.arc(CX, CY, R + 14, 0, Math.PI * 2); ctx.fill()
    RINGS.forEach((col, i) => {
      ctx.beginPath(); ctx.arc(CX, CY, R * (1 - i / RINGS.length), 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill()
    })
    ctx.beginPath(); ctx.arc(CX, CY, R * 0.05, 0, Math.PI * 2); ctx.fillStyle = '#C0392B'; ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1
    for (let i = 0; i < RINGS.length; i++) { ctx.beginPath(); ctx.arc(CX, CY, R * (1 - i / RINGS.length), 0, Math.PI * 2); ctx.stroke() }
    // 고리 점수 표시(오른쪽 가로줄)
    ctx.fillStyle = 'rgba(31,31,29,.55)'; ctx.font = `700 9px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (const d of [0.25, 0.5, 0.75]) ctx.fillText(String(scoreOf(d, 0)), CX + R * d + 8, CY - 6)
    // 오늘의 바람(왼쪽 위)
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = 'rgba(31,31,29,.78)'; ctx.beginPath(); ctx.roundRect(10, 10, 120, 44, 10); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = `800 13px ${FONT}`; ctx.fillText(c.label, 20, 29)
    ctx.font = `600 10.5px ${FONT}`; ctx.fillStyle = '#CFE3D8'; ctx.fillText(c.windLv ? '화살표 쪽으로 밀려요' : '똑바로 날아가요', 20, 46)
    if (c.windLv) {
      const ang = Math.atan2(c.windY, c.windX), ax = 112, ay = 32, L = 8 + c.windLv * 3
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang)
      ctx.strokeStyle = '#FFD27A'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(L, 0); ctx.stroke()
      ctx.fillStyle = '#FFD27A'; ctx.beginPath(); ctx.moveTo(L + 5, 0); ctx.lineTo(L - 3, -6); ctx.lineTo(L - 3, 6); ctx.fill()
      ctx.restore()
    }
    // 꽂힌 다트(팀원 색 + 이름 첫 글자)
    for (const d of dotsRef.current) {
      if (st.phase === 'fly' && d.mine) continue
      dart(ctx, CX + d.x * R, CY + d.y * R, d.color, d.initial, d.mine)
    }
    // 오늘 연습한 자리(흐리게)
    const pr = practiceRef.current
    if (pr && !(st.phase === 'fly' && st.practice)) {
      const m = me ? allMembers.find(a => a.id === me.id) : null
      ctx.globalAlpha = 0.4; dart(ctx, CX + pr.x * R, CY + pr.y * R, tagColor(m?.color_key), '연', false); ctx.globalAlpha = 1
    }
    // 조준선
    if (st.phase === 'x' || st.phase === 'y') {
      const left = Math.max(0, STAGE_T - st.t)
      const lx = st.phase === 'x' ? sweep(st.t, c.speedX, st.phX) : st.ax
      ctx.strokeStyle = '#E8833A'; ctx.lineWidth = 2.5; ctx.setLineDash(st.phase === 'x' ? [] : [6, 5])
      ctx.beginPath(); ctx.moveTo(CX + lx * R, CY - R - 12); ctx.lineTo(CX + lx * R, CY + R + 12); ctx.stroke()
      if (st.phase === 'y') {
        const ly = sweep(st.t, c.speedY, st.phY)
        ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(CX - R - 12, CY + ly * R); ctx.lineTo(CX + R + 12, CY + ly * R); ctx.stroke()
        ctx.beginPath(); ctx.arc(CX + lx * R, CY + ly * R, 7, 0, Math.PI * 2); ctx.stroke()
      }
      ctx.setLineDash([])
      // 남은 시간
      ctx.fillStyle = 'rgba(31,31,29,.6)'; ctx.beginPath(); ctx.roundRect(VW - 110, 14, 96, 10, 5); ctx.fill()
      ctx.fillStyle = left < 2 ? '#E5484D' : '#4caf6a'; ctx.beginPath(); ctx.roundRect(VW - 108, 16, Math.max(0, 92 * left / STAGE_T), 6, 3); ctx.fill()
      ctx.fillStyle = '#1F1F1D'; ctx.font = `800 13px ${FONT}`; ctx.textAlign = 'right'
      ctx.fillText(`${st.practice ? '연습 · ' : ''}${st.phase === 'x' ? '① 좌우 멈추기 (Space)' : '② 위아래 멈추기 (Space)'}`, VW - 14, 44); ctx.textAlign = 'left'
    }
    // 날아가는 다트: 조준점 → 바람에 밀린 자리, 처음엔 크게(가까이) 점점 작게
    if (st.phase === 'fly') {
      const k = Math.min(1, st.t / FLY_T), e = 1 - (1 - k) * (1 - k)
      const x = st.ax + (st.land.x - st.ax) * e, y = st.ay + (st.land.y - st.ay) * e
      const m = me ? allMembers.find(a => a.id === me.id) : null
      dart(ctx, CX + x * R, CY + y * R, tagColor(m?.color_key), m ? displayName(m).slice(0, 1) : '', true, 1 + (1 - e) * 1.6)
    }
    if (st.popT > 0) {
      const a = Math.min(1, st.popT * 2)
      ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.font = `900 44px ${FONT}`; ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(0,0,0,.55)'
      const txt = `${st.practice ? '연습 ' : ''}${st.score >= 100 ? '🎯 100!' : `${st.score}점`}`
      ctx.strokeText(txt, CX, CY - R * 0.45); ctx.fillStyle = st.score >= 80 ? '#FFD27A' : '#fff'; ctx.fillText(txt, CX, CY - R * 0.45)
      ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    }
  }

  function dart(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, initial: string, mine: boolean, big = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(big, big)
    ctx.strokeStyle = '#3b3f46'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(9, -9); ctx.stroke()
    ctx.fillStyle = '#1F1F1D'; ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(13, -13, 8, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
    ctx.lineWidth = mine ? 2.5 : 1.5; ctx.strokeStyle = mine ? '#FFD27A' : '#fff'; ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = `700 9.5px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(initial, 13, -12.5)
    ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  }

  function loop() {
    const st = g.current
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now
      st.t += dt; if (st.popT > 0) st.popT -= dt
      if ((st.phase === 'x' || st.phase === 'y') && st.t >= STAGE_T) tap()
      else if (st.phase === 'fly' && st.t >= FLY_T) { st.phase = 'done'; setPhase('done'); st.popT = 1.8; void finish() }
      draw()
      const busyNow = st.phase === 'x' || st.phase === 'y' || st.phase === 'fly' || st.popT > 0
      st.raf = busyNow ? requestAnimationFrame(step) : 0
    }
    if (!st.raf) st.raf = requestAnimationFrame(step)
  }
  useEffect(() => () => { if (g.current.raf) cancelAnimationFrame(g.current.raf) }, [])

  function tap() {
    const st = g.current, c = condRef.current
    if (st.phase === 'x') { st.ax = sweep(st.t, c.speedX, st.phX); st.phase = 'y'; st.t = 0; setPhase('y') }
    else if (st.phase === 'y') {
      st.ay = sweep(st.t, c.speedY, st.phY)
      const l = landing(st.ax, st.ay, c)
      st.land = { x: Math.max(-1.5, Math.min(1.5, l.x)), y: Math.max(-1.5, Math.min(1.5, l.y)) }
      st.score = scoreOf(st.land.x, st.land.y)
      st.phase = 'fly'; st.t = 0; setPhase('fly')
    }
  }

  async function finish() {
    const st = g.current
    if (st.practice) {
      const p: Practice = { x: st.land.x, y: st.land.y, score: st.score }
      practiceRef.current = p; setPractice(p); setPracticing(false)
      try { if (me) window.localStorage.setItem(practiceKey(me.id, today), JSON.stringify(p)) } catch {}
      setMsg(`연습 ${p.score}점 — 이제 진짜 한 발!`)
      st.phase = 'idle'; st.practice = false; setPhase('idle')
      return
    }
    const { data, error } = await createClient().rpc('daily_shot_finish', { p_x: st.land.x, p_y: st.land.y })
    if (error || !data) { const c = errCode(error); setMsg(c ? ERR[c] : '기록하지 못했어요') }
    else {
      const r = data as ShotRow
      setRows(prev => [...prev.filter(x => x.id !== r.id), r])
      setMsg(r.score! >= 100 ? '🎯 한가운데! 100점' : `🎯 ${r.score}점`)
    }
    void load()
  }

  async function start(isPractice = false) {
    if (busy || g.current.phase !== 'idle') return
    setMsg(null)
    if (!isPractice) {
      setBusy(true)
      const { error } = await createClient().rpc('daily_shot_start')
      setBusy(false)
      if (error) { const c = errCode(error); setMsg(c ? ERR[c] : '지금은 쏠 수 없어요'); void load(); return }
    }
    const st = g.current
    Object.assign(st, { phase: 'x', t: 0, phX: Math.random() * Math.PI * 2, phY: Math.random() * Math.PI * 2, popT: 0, practice: isPractice })
    setPracticing(isPractice); setPhase('x'); loop()
    if (!isPractice) void load()
  }

  useEffect(() => {
    if (phase !== 'x' && phase !== 'y') return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      e.preventDefault(); tap()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  // 창 크기가 바뀌면 다시 그림
  useEffect(() => {
    const cv = cvRef.current; if (!cv) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(cv)
    return () => ro.disconnect()
  })

  // 순위
  const ws = weekStart(today)
  const week = rankOf(rows, ws, addDays(ws, 6))
  const prevWeek = rankOf(rows, lastWeek, addDays(lastWeek, 6))
  const champ = prevWeek[0] ?? null
  const todaySorted = [...todayRows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  const myRank = mine?.score != null ? todaySorted.filter(r => r.score != null).findIndex(r => r.id === mine.id) + 1 : 0
  const aiming = phase === 'x' || phase === 'y'

  const blocked = !loaded ? (loadFailed ? '불러오지 못했어요' : '불러오는 중…') : !me ? '팀원 계정으로 로그인해야 쏠 수 있어요'
    : mine ? (mine.score != null ? `오늘 ${mine.score}점 · ${myRank}위 — 내일 또!` : phase === 'idle' ? '오늘 한 발은 놓쳤어요 — 내일 또!' : null) : null
  const label = aiming ? `${practicing ? '연습 · ' : ''}${phase === 'x' ? '⏸ 좌우 멈추기 (Space)' : '⏸ 위아래 멈추기 (Space)'}`
    : phase === 'fly' ? '🎯 날아가는 중…' : busy ? '준비 중…' : blocked ?? (practice ? '🎯 진짜 한 발 쏘기' : '🎯 진짜 한 발 (기록됨)')
  const canPress = aiming || (phase === 'idle' && !blocked && !busy)
  const medal = ['🥇', '🥈', '🥉']
  // 연습 버튼: 아직 진짜를 안 쐈고 대기 중일 때만
  const showPractice = phase === 'idle' && !blocked && !busy

  return (
    <div className="flex flex-col gap-2">
      <div className="relative w-full rounded-xl overflow-hidden border border-[#E8E8E4] cursor-pointer" onClick={() => { if (aiming) tap() }}>
        <canvas ref={cvRef} className="block w-full" style={{ aspectRatio: `${VW}/${VH}` }} aria-label="오늘의 한 발 과녁" />
      </div>
      <div className="flex items-center justify-between gap-2 text-[12px] text-[#6B6B66] min-h-[18px]">
        <span className="truncate">{msg ?? (champ ? `👑 지난주 1등 ${nameOf(champ.member_id)} (${champ.total}점)` : '하루 한 발 · 바람 반대쪽을 겨눠요')}</span>
        <span className="flex-shrink-0 tabular-nums">오늘 {todayRows.filter(r => r.score != null).length}명 쏨</span>
      </div>
      {/* 오늘 점수 — 높은 순 */}
      <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap text-[11.5px] min-h-[22px] [scrollbar-width:none]">
        {todaySorted.length === 0
          ? <span className="text-[#9C9C96]">{loaded ? '아직 아무도 안 쐈어요 — 오늘 첫 발의 주인공은?' : ''}</span>
          : todaySorted.map(r => {
              const m = allMembers.find(x => x.id === r.member_id)
              return (
                <span key={r.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#F4F4F1]">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: tagColor(m?.color_key) }} />
                  <span className="text-[#1F1F1D]">{nameOf(r.member_id)}</span>
                  <span className="tabular-nums font-semibold">{r.score != null ? r.score : r.member_id === me?.id && phase !== 'idle' ? '…' : '놓침'}</span>
                </span>
              )
            })}
      </div>
      {/* 이번 주 합계 */}
      <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap text-[11.5px] min-h-[22px] [scrollbar-width:none]">
        <span className="text-[#9C9C96] flex-shrink-0">이번 주</span>
        {week.length === 0 ? <span className="text-[#9C9C96]">—</span> : week.map((w, i) => (
          <span key={w.member_id} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ${i === 0 ? 'bg-[#FDEBDC]' : 'bg-[#F4F4F1]'}`}>
            <span>{medal[i] ?? `${i + 1}`}</span>
            <span className="text-[#1F1F1D]">{nameOf(w.member_id)}</span>
            <span className="tabular-nums font-semibold">{w.total}</span>
            <span className="text-[#9C9C96]">({w.days}일)</span>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        {showPractice && (
          <button
            type="button"
            onClick={() => { void start(true) }}
            disabled={!!practice}
            title="같은 바람으로 한 번 쏴 보기 — 기록 안 됨, 하루 1번"
            className="flex-shrink-0 px-3 py-2 rounded-xl text-[12.5px] font-semibold border border-[#E8E8E4] text-[#6B6B66] hover:text-[#1F1F1D] hover:border-[#1F1F1D] disabled:opacity-60 disabled:hover:text-[#6B6B66] disabled:hover:border-[#E8E8E4] transition-colors tabular-nums"
          >{practice ? `연습 ${practice.score}점` : '🏹 연습 한 판'}</button>
        )}
        <button
          type="button"
          onClick={() => { if (aiming) tap(); else void start() }}
          disabled={!canPress}
          className={`flex-1 min-w-0 py-2 rounded-xl text-[13px] font-semibold transition-colors truncate ${aiming ? 'bg-[#E8833A] text-white animate-pulse' : canPress ? 'bg-[#1F1F1D] text-white hover:bg-[#3a3a36]' : 'bg-[#EDEDEA] text-[#9C9C96]'}`}
        >{label}</button>
      </div>
    </div>
  )
}
