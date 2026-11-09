'use client'

// 🗼 서류탑 기록 — 카드 안에서 탑 화면 대신 보여주는 기록 화면(팝업 없음).
// 이미 쌓인 paper_tower_moves / paper_towers 로 계산한다(DB 변경 없음).
// 기간: 이번 주(월요일부터) · 이번 달 · 전체.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { displayName, type Member } from '@/lib/members'
import { PIECE_LABEL, tagColor } from '@/lib/paperTower'

type Period = 'week' | 'month' | 'all'
type MoveRow = { id: number; tower_id: number; member_id: string; kind: string; result: 'safe' | 'collapse' | null; created_at: string }
type TowerRow = { id: number; floors: number; end_reason: 'collapse' | 'complete' | 'reset' | null; collapsed_by: string | null; started_at: string }

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: '이번 주' },
  { key: 'month', label: '이번 달' },
  { key: 'all', label: '전체' },
]
const MIN_FOR_RATE = 5 // 철벽(세이프 비율)은 이 횟수 이상 놓은 사람만

function periodStart(p: Period): string | null {
  if (p === 'all') return null
  const d = new Date(); d.setHours(0, 0, 0, 0)
  if (p === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // 월요일
  else d.setDate(1)
  return d.toISOString()
}
const md = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}` }

export default function PaperTowerStats({ members }: { members: Member[] }) {
  const [period, setPeriod] = useState<Period>('week')
  const [data, setData] = useState<{ period: Period; moves: MoveRow[]; towers: TowerRow[]; at: number } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const supabase = createClient()
      const start = periodStart(period)
      let q = supabase.from('paper_tower_moves').select('id, tower_id, member_id, kind, result, created_at').order('id').limit(5000)
      if (start) q = q.gte('created_at', start)
      const { data: mv, error } = await q
      if (!active) return
      if (error) { setFailed(true); return }
      const moves = (mv ?? []) as MoveRow[]
      const ids = [...new Set(moves.map(m => m.tower_id))]
      const { data: tw } = ids.length
        ? await supabase.from('paper_towers').select('id, floors, end_reason, collapsed_by, started_at').in('id', ids)
        : { data: [] }
      if (!active) return
      setFailed(false)
      setData({ period, moves, towers: (tw ?? []) as TowerRow[], at: Date.now() })
    })()
    return () => { active = false }
  }, [period])

  const nameOf = (id: string | null) => { const m = members.find(x => x.id === id); return m ? displayName(m) : '누군가' }
  const colorOf = (id: string | null) => tagColor(members.find(x => x.id === id)?.color_key)

  const stats = useMemo(() => {
    if (!data) return null
    const { moves, towers, at: now } = data  // now = 받아 온 시각(시간 초과 판정 기준)
    type P = { id: string; placed: number; safe: number; collapse: number; timeout: number; streak: number; best: number }
    const per = new Map<string, P>()
    const kindCollapse = new Map<string, number>()
    for (const m of moves) {
      let p = per.get(m.member_id)
      if (!p) { p = { id: m.member_id, placed: 0, safe: 0, collapse: 0, timeout: 0, streak: 0, best: 0 }; per.set(m.member_id, p) }
      p.placed++
      if (m.result === 'safe') { p.safe++; p.streak++; p.best = Math.max(p.best, p.streak) }
      else if (m.result === 'collapse') { p.collapse++; p.streak = 0; kindCollapse.set(m.kind, (kindCollapse.get(m.kind) ?? 0) + 1) }
      else if (now - new Date(m.created_at).getTime() > 60_000) p.timeout++ // 놓는 중이 아닌데 결과 없음 = 시간 초과
    }
    const people = [...per.values()].sort((a, b) => b.collapse - a.collapse || b.placed - a.placed)
    const maxCol = Math.max(0, ...people.map(p => p.collapse))
    const culprits = maxCol > 0 ? people.filter(p => p.collapse === maxCol) : []
    const rated = people.filter(p => p.safe + p.collapse >= MIN_FOR_RATE).map(p => ({ ...p, rate: p.safe / (p.safe + p.collapse) }))
    const wall = rated.sort((a, b) => b.rate - a.rate || b.safe - a.safe)[0] ?? null
    const topKind = [...kindCollapse.entries()].sort((a, b) => b[1] - a[1])[0] ?? null
    // 최고 탑: 층수 최대, 꼭대기(그 층에 세이프로 올린 사람)
    const tallest = [...towers].sort((a, b) => b.floors - a.floors || a.id - b.id)[0] ?? null
    let topper: string | null = null
    if (tallest && tallest.floors > 0) {
      const safeInTower = moves.filter(m => m.tower_id === tallest.id && m.result === 'safe')
      topper = safeInTower[tallest.floors - 1]?.member_id ?? safeInTower[safeInTower.length - 1]?.member_id ?? null
    }
    const recent = [...towers].sort((a, b) => b.id - a.id).slice(0, 5).map(t => ({
      ...t, who: [...new Set(moves.filter(m => m.tower_id === t.id).map(m => m.member_id))],
    }))
    return { people, culprits, maxCol, wall, topKind, tallest, topper, recent, total: moves.length }
  }, [data])

  const loading = !data || data.period !== period
  return (
    <div className="w-full rounded-xl border border-[#E8E8E4] bg-[#FBFAF7] overflow-y-auto p-2.5 flex flex-col gap-2.5 text-[12px]" style={{ aspectRatio: '480/400' }}>
      <div className="flex items-center gap-1 flex-shrink-0">
        {PERIODS.map(p => (
          <button key={p.key} type="button" onClick={() => setPeriod(p.key)}
            className={`px-2 py-0.5 rounded-full transition-colors ${period === p.key ? 'bg-[#1F1F1D] text-white font-semibold' : 'text-[#6B6B66] hover:bg-black/[0.05]'}`}>{p.label}</button>
        ))}
        {stats && !loading && <span className="ml-auto text-[11px] text-[#9C9C96] tabular-nums">{stats.total}차례</span>}
      </div>

      {failed ? <p className="text-[#9C9C96]">기록을 불러오지 못했어요</p>
        : loading || !stats ? <p className="text-[#9C9C96]">불러오는 중…</p>
        : stats.total === 0 ? <p className="text-[#9C9C96]">이 기간엔 아직 기록이 없어요</p>
        : (
          <>
            {/* 한눈에 4칸 */}
            <div className="grid grid-cols-2 gap-1.5 flex-shrink-0">
              <Box label="💥 최다 범인" value={stats.culprits.length ? stats.culprits.map(p => nameOf(p.id)).join(', ') : '없음'}
                sub={stats.culprits.length ? `${stats.maxCol}번 무너뜨림 · ☕ 커피 당번 후보` : '아직 아무도 안 무너뜨림'} />
              <Box label="🏗 최고 탑" value={stats.tallest ? `${stats.tallest.floors}층` : '-'}
                sub={stats.tallest ? `${md(stats.tallest.started_at)}${stats.topper ? ` · 꼭대기 ${nameOf(stats.topper)}` : ''}` : ''} />
              <Box label="🛡 철벽(세이프율)" value={stats.wall ? `${nameOf(stats.wall.id)} ${Math.round(stats.wall.rate * 100)}%` : '-'}
                sub={stats.wall ? `${stats.wall.safe}/${stats.wall.safe + stats.wall.collapse}회 세이프` : `${MIN_FOR_RATE}회 이상 놓으면 집계`} />
              <Box label="🧨 범인 물건" value={stats.topKind ? `${PIECE_LABEL[stats.topKind[0]]?.icon ?? ''} ${PIECE_LABEL[stats.topKind[0]]?.name ?? stats.topKind[0]}` : '-'}
                sub={stats.topKind ? `${stats.topKind[1]}번 와르르` : ''} />
            </div>

            {/* 팀원별 */}
            <table className="w-full border-collapse tabular-nums flex-shrink-0">
              <thead>
                <tr className="text-[10.5px] text-[#9C9C96]">
                  <th className="text-left font-normal py-1">이름</th>
                  <th className="text-right font-normal">놓음</th>
                  <th className="text-right font-normal">✅</th>
                  <th className="text-right font-normal">💥</th>
                  <th className="text-right font-normal">세이프율</th>
                  <th className="text-right font-normal" title="가장 길게 이어간 연속 세이프">연속</th>
                </tr>
              </thead>
              <tbody>
                {stats.people.map(p => {
                  const done = p.safe + p.collapse
                  return (
                    <tr key={p.id} className="border-t border-[#EDEDEA]">
                      <td className="py-1"><span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: colorOf(p.id) }} />{nameOf(p.id)}</span></td>
                      <td className="text-right">{p.placed}{p.timeout ? <span className="text-[#9C9C96]" title="시간 초과"> ⌛{p.timeout}</span> : null}</td>
                      <td className="text-right">{p.safe}</td>
                      <td className={`text-right ${p.collapse === stats.maxCol && p.collapse > 0 ? 'text-[#C0392B] font-semibold' : ''}`}>{p.collapse}</td>
                      <td className="text-right">{done ? `${Math.round((p.safe / done) * 100)}%` : '-'}</td>
                      <td className="text-right">{p.best}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* 최근 탑 */}
            <div className="flex flex-col gap-1 flex-shrink-0">
              <p className="text-[10.5px] text-[#9C9C96]">최근 탑</p>
              {stats.recent.map(t => (
                <div key={t.id} className="flex items-center gap-1.5">
                  <span className="text-[#9C9C96] tabular-nums w-[34px]">{md(t.started_at)}</span>
                  <span className="tabular-nums font-semibold w-[30px]">{t.floors}층</span>
                  <span className="truncate flex-1 min-w-0">
                    {t.end_reason === 'collapse' ? `💥 ${nameOf(t.collapsed_by)}` : t.end_reason === 'complete' ? '🏁 완공' : t.end_reason === 'reset' ? '↺ 리셋' : '🗼 쌓는 중'}
                  </span>
                  <span className="flex -space-x-0.5 flex-shrink-0">
                    {t.who.slice(0, 6).map(id => <span key={id} title={nameOf(id)} className="w-2 h-2 rounded-full ring-1 ring-white" style={{ background: colorOf(id) }} />)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
    </div>
  )
}

function Box({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg bg-white border border-[#EDEDEA] px-2 py-1.5 min-w-0">
      <p className="text-[10.5px] text-[#9C9C96]">{label}</p>
      <p className="text-[13px] font-semibold text-[#1F1F1D] truncate">{value}</p>
      {sub && <p className="text-[10.5px] text-[#6B6B66] truncate">{sub}</p>}
    </div>
  )
}
