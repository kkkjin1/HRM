'use client'

// 🐶 강아지 방(자세히) — 성장 단계(직급), 친밀도 순위, 옷장(31일~), 개인기, 최근 기록, 하루 규칙.
import { useEffect, useState } from 'react'
import PetDog, { type Outfit } from '@/components/pet/PetDog'
import { OUTFITS, STAGES, TRICKS, petAct, stageOf, type PetState } from '@/lib/pet'

const KIND_LABEL: Record<string, string> = {
  meal: '밥 한 숟갈', poop: '똥 치우기', snack: '간식', play: '놀아주기', pat: '쓰담쓰담', train: '훈련',
  return: '가출한 호떡 찾음', equip: '옷 갈아입힘',
}

export default function PetRoom({ state: s, nameOf, onClose }: { state: PetState; nameOf: (id: string) => string; onClose: () => void }) {
  const pet = s.pet!
  const age = Math.max(1, pet.age)
  const st = stageOf(age)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const maxPts = Math.max(1, ...s.affection.map(a => a.points))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const equip = async (key: string) => {
    if (busy) return
    setBusy(true)
    const r = await petAct('equip', key)
    setBusy(false)
    setMsg(r.ok ? '갈아입었어요!' : r.error)
  }

  const recentText = (r: PetState['recent'][number]) => {
    if (r.kind === 'walk') return r.result === 'success' ? '산책 성공' : '산책 실패(속상…)'
    return KIND_LABEL[r.kind] ?? r.kind
  }
  const time = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="fixed inset-0 z-[75] bg-black/40 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl w-full max-w-[760px] max-h-[88vh] overflow-y-auto p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div style={{ width: 110 }}><PetDog breed="shiba" age={age} mood="happy" pose="stand" outfit={pet.outfit as Outfit} /></div>
            <div>
              <p className="text-[18px] font-bold">{st.rank} {pet.name}</p>
              <p className="text-[12.5px] text-[#6B6B66]">D+{age} · {st.stage}{pet.status === 'runaway' ? ' · 가출 중' : ''}</p>
              <p className="text-[12.5px] text-[#6B6B66] mt-0.5">❤ 팀 친밀도 <b>{s.team_total}</b> · 오늘 +{s.today_total}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#9C9C96] hover:text-[#1F1F1D] text-[20px] leading-none" aria-label="닫기">×</button>
        </div>

        {/* 성장 = 승진 */}
        <Section title="성장 · 승진">
          <div className="grid grid-cols-5 gap-2">
            {STAGES.map((x, i) => {
              const showAge = i === STAGES.length - 1 ? 30 : x.from + 2
              const now = st.rank === x.rank
              const done = age >= x.from
              return (
                <div key={x.rank} className={`rounded-xl border p-1.5 text-center ${now ? 'border-[#F0A24A] bg-[#FFF8EC]' : 'border-[#EEEEEA]'}`}>
                  <div style={{ opacity: done ? 1 : 0.35 }}><PetDog breed="shiba" age={showAge} mood="normal" /></div>
                  <p className="text-[11.5px] font-semibold">{x.rank}</p>
                  <p className="text-[10.5px] text-[#9C9C96]">{x.from}일~ · {x.stage}</p>
                </div>
              )
            })}
          </div>
          <p className="mt-1.5 text-[11.5px] text-[#9C9C96]">31일부터는 옷을 입히고 개인기를 가르쳐요 · 60일에 졸업</p>
        </Section>

        {/* 친밀도 */}
        <Section title="친밀도">
          {s.affection.length === 0 && <p className="text-[12px] text-[#9C9C96]">아직 기록이 없어요</p>}
          <div className="space-y-1">
            {s.affection.map((a, i) => (
              <div key={a.member_id} className="flex items-center gap-2 text-[12.5px]">
                <span className="w-32 truncate">{i < 3 ? ['🥇', '🥈', '🥉'][i] : '　'} {nameOf(a.member_id)}</span>
                <div className="flex-1 h-2 rounded-full bg-[#F1F1ED] overflow-hidden"><div className="h-full rounded-full bg-[#F0A24A]" style={{ width: `${(a.points / maxPts) * 100}%` }} /></div>
                <span className="w-10 text-right text-[#6B6B66]">{a.points}</span>
              </div>
            ))}
          </div>
        </Section>

        <div className="grid sm:grid-cols-2 gap-x-5">
          {/* 옷장 */}
          <Section title={`옷장 ${age < 31 ? '· 31일부터' : ''}`}>
            <div className="grid grid-cols-5 gap-1.5">
              {OUTFITS.map(o => {
                const unlocked = age >= 31 || o.key === 'none' ? s.team_total >= o.need : false
                const wearing = pet.outfit === o.key
                return (
                  <button key={o.key} onClick={() => unlocked && !wearing && equip(o.key)} disabled={!unlocked || wearing || busy}
                    title={unlocked ? o.label : `팀 친밀도 ${o.need} 필요`}
                    className={`rounded-lg border p-1 text-center ${wearing ? 'border-[#F0A24A] bg-[#FFF8EC]' : 'border-[#EEEEEA] hover:bg-[#F7F7F5]'} disabled:cursor-default`}>
                    <div style={{ opacity: unlocked ? 1 : 0.3, filter: unlocked ? undefined : 'grayscale(1)' }}><PetDog breed="shiba" age={30} mood="normal" outfit={o.key} /></div>
                    <p className="text-[10px] leading-tight">{unlocked ? o.label : `🔒 ${o.need}`}</p>
                  </button>
                )
              })}
            </div>
            {pet.outfit !== 'none' && pet.outfit_by && <p className="mt-1 text-[11px] text-[#9C9C96]">{nameOf(pet.outfit_by)}님이 입혔어요</p>}
            {msg && <p className="mt-1 text-[11.5px] text-[#8A6A3A]">{msg}</p>}
          </Section>

          {/* 개인기 */}
          <Section title={`개인기 · 훈련 ${s.train_total}회`}>
            <ul className="space-y-1">
              {TRICKS.map(t => {
                const done = s.train_total >= t.need
                return (
                  <li key={t.key} className="flex items-center gap-2 text-[12.5px]">
                    <span className={done ? '' : 'opacity-40'}>{done ? '✅' : '⬜'} {t.label}</span>
                    {!done && <span className="ml-auto text-[11px] text-[#9C9C96]">{t.need - s.train_total}회 남음</span>}
                  </li>
                )
              })}
            </ul>
          </Section>
        </div>

        {/* 최근 */}
        <Section title="최근 기록">
          {s.recent.length === 0 && <p className="text-[12px] text-[#9C9C96]">아직 기록이 없어요</p>}
          <ul className="space-y-0.5">
            {s.recent.map((r, i) => (
              <li key={i} className="text-[12px] text-[#4A4A45] flex gap-2">
                <span className="text-[#9C9C96] w-24 flex-shrink-0">{time(r.created_at)}</span>
                <span className="min-w-0 truncate">{nameOf(r.member_id)} · {recentText(r)}{r.points > 0 ? ` +${r.points}` : ''}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="하루 규칙">
          <ul className="text-[12px] text-[#6B6B66] space-y-0.5 list-disc pl-4">
            <li>밥(평일 3번)·산책(평일 2번)은 깜짝! 언제인지 미리 몰라요. 배고파하면 위에 알림이 뜨고 <b>10분</b>만 열려요</li>
            <li>밥은 한 숟갈씩 같이 주기 — 첫 숟갈 +5, 다음 +3, 3명 모이면 모두 +2</li>
            <li>밥 먹고 1시간 뒤 똥 💩 — 먼저 치운 사람 +3</li>
            <li>간식 2번 · 놀기 3번 · 쓰담 5번 · 산책 창마다 1번(성공 +6, 하루 성공 1번) · 31일부터 훈련 3번</li>
            <li>간식·놀기·쓰담·훈련은 하루 동안 하나씩 열려요(못 쓴 건 쌓여요)</li>
            <li>평일 하루 내내 밥을 못 받으면 다음 날 가출해요. 팀이 300번 불러야 돌아와요</li>
            <li>🪙 팀 나무에 물 주면 10코인 — 상점에서 집·장난감을 사 줄 수 있어요</li>
          </ul>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <p className="text-[12.5px] font-semibold text-[#6B6B66] mb-1.5">{title}</p>
      {children}
    </section>
  )
}
