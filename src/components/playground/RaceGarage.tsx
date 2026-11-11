'use client'

// 🏎 레이싱 🚗 내 차고 — 운동장 무대 자리에 뜬다.
//   선호 구단(무료·언제든) — 차 도색 + 엠블럼
//   탭: 🛒 부품(🪙 코인으로 사기·끼우고 빼기) / 🪑 실내(운전석 꾸미기 — RaceInterior.tsx) / 🎁 받은 선물(구단 버전·1일권 포함) / 🎁 선물하기(관리자만 — 부품 × 구단 × 영구/1일권)
// 왼쪽 미리보기는 레이스 화면과 같은 그리기 함수(drawKart)라 보이는 그대로 달린다.
// 🎁 선물하기 탭(관리자)에선 왼쪽이 '받는 사람 지금 차 → 선물 끼운 뒤' 미리보기로 바뀐다(2026-11-05).

import { useEffect, useRef, useState } from 'react'
import { H, W } from '@/lib/playground'
import { KBO_TEAMS, logoUrl, teamOf, type TeamKey } from '@/lib/baseballGear'
import {
  RACE_PARTS, RACE_REWARD_TEXT, carOf, giftValid, hasPart, isBodyPart, partInfo,
  type BodyPart, type CarLook, type GarageRow, type RaceGift, type RacePart, type SlotPart,
} from '@/lib/raceGarage'
import { CARS, CAR_BODIES, carInfo } from '@/lib/raceCars'
import { drawKart } from '@/components/playground/raceChase'
import RaceInterior from '@/components/playground/RaceInterior'
import type { Equip, SlotKey } from '@/lib/raceInterior'

type Tab = 'cars' | 'shop' | 'interior' | 'gifts' | 'give'
const isBody = (p: RacePart): p is BodyPart => isBodyPart(p)
const BAR_LABELS: [keyof (typeof CARS)['kart']['bars'], string][] = [['speed', '최고속도'], ['accel', '가속'], ['handling', '핸들링'], ['grip', '안정성'], ['weight', '무게']]
// 선물이 끼워진 모습 — 선물은 받자마자 장착된다. team = null이면 받는 사람 선호 구단을 따라감('own')
export function withGift(c: CarLook, part: RacePart, team: TeamKey | null): CarLook {
  const n: CarLook = { ...c }
  if (isBody(part)) { n.body = part; n.bodyTeam = team }
  else n[part as SlotPart] = team ?? 'own'
  return n
}

export default function RaceGarage(props: {
  name: string
  color: string // 구단을 안 골랐을 때 차 색(팀원 색)
  row: GarageRow | null
  gifts: RaceGift[] // 전체(내 것만 골라 씀)
  nowMs: number // 서버 시각 — 1일권 만료 판정
  missing: boolean
  isAdmin: boolean
  members: { id: string; name: string }[]
  nameOf: (id: string) => string
  buy: (part: RacePart) => Promise<string | null>
  set: (team: TeamKey | null, car: CarLook | null) => Promise<string | null>
  gift: (to: string, part: RacePart, team: TeamKey | null, days: 0 | 1, message: string) => Promise<string | null>
  lookOfMember: (id: string) => { car: CarLook; color: string } // 선물 미리보기용 — 받는 사람 지금 차
  buyInterior: (slot: SlotKey, v: string, team: TeamKey | null) => Promise<string | null>
  drawInterior: () => Promise<{ err: string | null; got: string | null }>
  setInterior: (eq: Equip) => Promise<string | null>
  giftInterior: (to: string, slot: SlotKey, v: string, team: TeamKey | null) => Promise<string | null>
  onClose: () => void
}) {
  const { row, missing, nowMs } = props
  const memberId = row?.member_id ?? null
  const myGifts = props.gifts.filter(g => g.member_id === memberId && giftValid(g, nowMs)).reverse()
  const car = carOf(row, props.gifts, nowMs)
  const coins = row?.coins ?? 0
  const team = teamOf(car.team)
  const [tab, setTab] = useState<Tab>('cars')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // 선물하기 입력
  const [gTo, setGTo] = useState<string>(props.members[0]?.id ?? '')
  const [gPart, setGPart] = useState<RacePart>('wing')
  const [gTeam, setGTeam] = useState<TeamKey | 'follow'>('follow')
  const [gDays, setGDays] = useState<0 | 1>(0)
  const [gMsg, setGMsg] = useState('')
  // 미리보기에 그릴 것: 평소엔 내 차 하나, 선물하기 탭에선 받는 사람 지금 차(작게) → 선물 후(크게)
  const giving = tab === 'give' && props.isAdmin && !!gTo
  const target = giving ? props.lookOfMember(gTo) : null
  const giftTeam = gTeam === 'follow' ? null : gTeam
  const carKey = JSON.stringify(giving && target
    ? { mode: 'give', before: target.car, after: withGift(target.car, gPart, giftTeam), color: target.color, name: props.nameOf(gTo) }
    : { mode: 'mine', after: car, color: props.color, name: props.name })

  // 미리보기 — 부스터 불꽃·깃발 펄럭임이 보이게 계속 그린다
  useEffect(() => {
    let raf = 0
    const cv = canvasRef.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const pv = JSON.parse(carKey) as { mode: 'give' | 'mine'; before?: CarLook; after: CarLook; color: string; name: string }
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = 300 * dpr; cv.height = H * dpr
    const loop = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const g = ctx.createLinearGradient(0, 0, 0, H)
      g.addColorStop(0, '#1F2937'); g.addColorStop(0.62, '#374151'); g.addColorStop(1, '#4B5563')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 300, H)
      ctx.fillStyle = 'rgba(253,230,138,0.18)'
      ctx.beginPath(); ctx.ellipse(150, 250, 130, 26, 0, 0, Math.PI * 2); ctx.fill()
      const boosting = Math.floor(t / 1600) % 2 === 1
      const kart = (look: CarLook, fx: '' | 'boost') => ({ id: 'me', x: 0, y: 0, fx, fin: null, isMe: false, name: pv.name, color: pv.color, car: look })
      if (pv.mode === 'give' && pv.before) {
        drawKart(ctx, 70, 150, 1.5, kart(pv.before, ''), t, false) // 지금
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '900 22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('→', 150, 132)
        drawKart(ctx, 165, 262, 2.6, kart(pv.after, boosting ? 'boost' : ''), t, false) // 선물 후
      } else {
        drawKart(ctx, 150, 250, 3.1, kart(pv.after, boosting ? 'boost' : ''), t, false)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [carKey])

  const run = async (fn: () => Promise<string | null>, ok?: string) => {
    if (busy) return
    setBusy(true)
    const err = await fn()
    setBusy(false)
    setMsg(err ?? ok ?? null)
  }
  // 부위 끼우기/빼기 — variant: 'own'(선호 구단 버전) 또는 구단 키(선물 버전)
  const isOn = (p: RacePart, variant: 'own' | TeamKey) => isBody(p)
    ? car.body === p && (variant === 'own' ? car.bodyTeam === null : car.bodyTeam === variant)
    : car[p as SlotPart] === variant
  const toggle = (p: RacePart, variant: 'own' | TeamKey) => {
    const next: CarLook = { ...car }
    if (isBody(p)) {
      if (isOn(p, variant)) { next.body = 'kart'; next.bodyTeam = null }
      else { next.body = p; next.bodyTeam = variant === 'own' ? null : variant }
    } else {
      next[p as SlotPart] = isOn(p, variant) ? false : variant
    }
    void run(() => props.set(null, next))
  }
  const chip = (on: boolean) => `rounded-md px-2 py-0.5 font-semibold ${on ? 'bg-white text-[#1F2933]' : 'bg-white/10 hover:bg-white/20'}`
  const interiorNew = row?.interior_gifts?.length ?? 0
  const tabs: [Tab, string][] = [['cars', '🚗 차종'], ['shop', '🛒 부품'], ['interior', `🪑 실내${interiorNew ? ` 🎁${interiorNew}` : ''}`], ['gifts', `🎁 받은 선물${myGifts.length ? ` ${myGifts.length}` : ''}`], ...(props.isAdmin ? [['give', '🎁 선물하기(관리자)'] as [Tab, string]] : [])]

  const headerEl = (
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {tabs.map(([k, label]) => (
            <button key={k} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { setTab(k); setMsg(null) }}
              className={`rounded-md px-2.5 py-1 text-[12px] font-bold ${tab === k ? 'bg-white text-[#1F2933]' : 'bg-white/10 text-white hover:bg-white/20'}`}>{label}</button>
          ))}
        </div>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={props.onClose}
          className="rounded-md bg-white/90 px-2.5 py-1 text-[11.5px] font-semibold text-[#1F2933] hover:bg-white">광장으로</button>
      </div>
  )
  if (tab === 'interior') {
    return <RaceInterior row={row} missing={missing} isAdmin={props.isAdmin} members={props.members} header={headerEl}
      buy={props.buyInterior} draw={props.drawInterior} save={props.setInterior} gift={props.giftInterior} />
  }

  return (
    <div className="absolute inset-0 z-[46] flex overflow-hidden bg-[#111827] text-white" style={{ width: W, height: H }}>
      <div className="relative shrink-0" style={{ width: 300, height: H }}>
        <canvas ref={canvasRef} style={{ width: 300, height: H }} aria-label="내 차 미리보기" />
        {giving ? (
          <>
            <div className="absolute inset-x-0 top-3 text-center">
              <p className="text-[14px] font-black">🎁 {props.nameOf(gTo)}님 차 미리보기</p>
              <p className="text-[11px] text-white/70">{giftTeam ? `${teamOf(giftTeam)?.name.split(' ')[0]} ` : ''}{partInfo(gPart)?.emoji} {partInfo(gPart)?.name} 끼우면 이렇게 보여요</p>
            </div>
            <span className="absolute left-[38px] top-[176px] rounded-full bg-white/15 px-2 py-[1px] text-[10px] font-semibold">지금</span>
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-[#DB2777] px-2.5 py-[2px] text-[10.5px] font-bold">선물 후</span>
          </>
        ) : (
          <div className="absolute inset-x-0 top-3 text-center">
            <p className="text-[15px] font-black">{carInfo(car.body).emoji} {carInfo(car.body).name}{team ? ` · ${team.name.split(' ')[0]} 에디션` : ''}</p>
            <p className="text-[11px] text-white/70">{props.name}의 차 · 🪙 {coins}</p>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        {headerEl}
        {missing && <p className="rounded-md bg-[#7F1D1D] px-2 py-1 text-[11px]">차고 저장 테이블이 아직 없어요 — supabase/add_race_garage.sql 실행이 필요해요</p>}

        {tab !== 'give' && tab !== 'cars' && (
          <div>
            <p className="mb-1 text-[11px] font-semibold text-white/70">선호 구단 — 차가 팀 색으로 도색되고 엠블럼이 그려져요(무료, 언제든 바꿈)</p>
            <div className="flex flex-wrap gap-1">
              {KBO_TEAMS.map(t => (
                <button key={t.key} type="button" disabled={busy || missing} onMouseDown={e => e.preventDefault()}
                  onClick={() => void run(() => props.set(t.key, null))}
                  className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] font-semibold ${car.team === t.key ? 'border-[#FACC15] bg-white text-[#1F2933]' : 'border-white/20 bg-white/10 hover:bg-white/20'} disabled:opacity-50`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl(t.key)} alt="" className="h-4 w-4 object-contain" />
                  {t.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'cars' && <p className="mb-1 text-[11px] font-semibold text-white/70">차종마다 달리는 성능과 운전석 승차감이 달라요 — 산 차는 언제든 바꿔 탈 수 있어요(도색·부품은 그대로)</p>}
          {tab === 'cars' && (
            <div className="grid grid-cols-3 gap-1.5">
              {CAR_BODIES.map(b => {
                const info = CARS[b]
                const free = b === 'kart'
                const have = free || hasPart(row, props.gifts, b, null, nowMs)
                const on = car.body === b && (free || car.bodyTeam === null)
                const locked = !!info.needs && !hasPart(row, props.gifts, info.needs as RacePart, null, nowMs)
                return (
                  <div key={b} className={`flex flex-col gap-0.5 rounded-lg border p-1.5 ${on ? 'border-[#FACC15] bg-[#FACC15]/10' : 'border-white/15 bg-white/5'}`}>
                    <p className="text-[12.5px] font-black">{info.emoji} {info.name}</p>
                    <div className="flex flex-col gap-[1px]">
                      {BAR_LABELS.map(([k, label]) => (
                        <div key={k} className="flex items-center gap-1 text-[9.5px] text-white/65">
                          <span className="w-9 shrink-0">{label}</span>
                          <span className="flex gap-[2px]">{[1, 2, 3, 4, 5].map(i => <span key={i} className={`h-[5px] w-[9px] rounded-sm ${i <= info.bars[k] ? 'bg-[#FACC15]' : 'bg-white/15'}`} />)}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[9.5px] leading-tight text-white/70">{info.traits}</p>
                    <p className="text-[9.5px] leading-tight text-[#93C5FD]">🪑 {info.feel}</p>
                    {have ? (
                      <button type="button" disabled={busy || missing || on} onMouseDown={e => e.preventDefault()}
                        onClick={() => void run(() => props.set(null, { ...car, body: b, bodyTeam: null }), `${info.emoji} ${info.name}로 바꿨어요`)}
                        className={`mt-auto rounded-md px-2 py-0.5 text-[11px] font-bold ${on ? 'bg-[#FACC15] text-[#1F2933]' : 'bg-white/15 text-white'} disabled:opacity-90`}>
                        {on ? '타는 중' : '이 차 타기'}
                      </button>
                    ) : (
                      <button type="button" disabled={busy || missing || locked || coins < info.price} onMouseDown={e => e.preventDefault()}
                        onClick={() => void run(() => props.buy(b as RacePart), `${info.emoji} ${info.name} 구매 — 바로 탔어요!`)}
                        className="mt-auto rounded-md bg-[#2563EB] px-2 py-0.5 text-[11px] font-bold text-white disabled:bg-white/10 disabled:text-white/40">
                        {locked ? `${CARS[info.needs!].name} 먼저` : `🪙 ${info.price} 사기`}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'shop' && (
            <div className="grid grid-cols-3 gap-1.5">
              {RACE_PARTS.filter(p => !isBody(p.key)).map(p => {
                const have = hasPart(row, props.gifts, p.key, null, nowMs)
                const on = have && isOn(p.key, 'own')
                const locked = !!p.needs && !hasPart(row, props.gifts, p.needs, null, nowMs)
                return (
                  <div key={p.key} className={`flex flex-col gap-0.5 rounded-lg border p-1.5 ${on ? 'border-[#FACC15] bg-[#FACC15]/10' : 'border-white/15 bg-white/5'}`}>
                    <p className="text-[12px] font-bold">{p.emoji} {p.name}</p>
                    <p className="text-[10px] leading-tight text-white/60">{p.help}</p>
                    {have ? (
                      <button type="button" disabled={busy} onMouseDown={e => e.preventDefault()} onClick={() => toggle(p.key, 'own')}
                        className={`mt-auto rounded-md px-2 py-0.5 text-[11px] font-bold ${on ? 'bg-[#FACC15] text-[#1F2933]' : 'bg-white/15 text-white'} disabled:opacity-50`}>
                        {on ? '장착 중 · 빼기' : '끼우기'}
                      </button>
                    ) : (
                      <button type="button" disabled={busy || missing || locked || coins < p.price} onMouseDown={e => e.preventDefault()}
                        onClick={() => void run(() => props.buy(p.key), `${p.emoji} ${p.name} 장착!`)}
                        className="mt-auto rounded-md bg-[#2563EB] px-2 py-0.5 text-[11px] font-bold text-white disabled:bg-white/10 disabled:text-white/40">
                        {locked ? '스포츠 차체 먼저' : `🪙 ${p.price} 사기`}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'gifts' && (
            myGifts.length === 0 ? <p className="text-[12px] text-white/60">아직 받은 선물이 없어요</p> : (
              <div className="grid grid-cols-3 gap-1.5">
                {myGifts.map(g => {
                  const info = partInfo(g.part)
                  const t = teamOf(g.team)
                  const variant: 'own' | TeamKey = g.team ?? 'own'
                  const on = isOn(g.part, variant)
                  return (
                    <div key={g.id} className={`flex flex-col gap-0.5 rounded-lg border p-1.5 ${on ? 'border-[#FACC15] bg-[#FACC15]/10' : 'border-white/15 bg-white/5'}`}>
                      <p className="flex items-center gap-1 text-[12px] font-bold">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {t && <img src={logoUrl(t.key)} alt="" className="h-4 w-4 object-contain" />}
                        {t ? `${t.name.split(' ')[0]} ` : ''}{info?.emoji} {info?.name}
                      </p>
                      <p className="text-[10px] leading-tight text-white/60">{g.expires_at ? '⏰ 오늘만(1일권)' : '♾ 영구'} · {g.given_by ? props.nameOf(g.given_by) : '관리자'}님 선물{g.message ? ` · "${g.message}"` : ''}</p>
                      <button type="button" disabled={busy} onMouseDown={e => e.preventDefault()} onClick={() => toggle(g.part, variant)}
                        className={`mt-auto rounded-md px-2 py-0.5 text-[11px] font-bold ${on ? 'bg-[#FACC15] text-[#1F2933]' : 'bg-white/15 text-white'} disabled:opacity-50`}>
                        {on ? '장착 중 · 빼기' : '끼우기'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )
          )}

          {tab === 'give' && props.isAdmin && (
            <div className="flex flex-col gap-2 text-[12px]">
              <div className="flex flex-wrap items-center gap-1">
                <span className="w-14 text-white/60">받는 사람</span>
                {props.members.map(m => (
                  <button key={m.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => setGTo(m.id)} className={chip(gTo === m.id)}>{m.name}</button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="w-14 text-white/60">부품</span>
                {RACE_PARTS.map(p => (
                  <button key={p.key} type="button" onMouseDown={e => e.preventDefault()} onClick={() => setGPart(p.key)} className={chip(gPart === p.key)}>{p.emoji} {p.name}</button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="w-14 text-white/60">구단</span>
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setGTeam('follow')} className={chip(gTeam === 'follow')}>받는 사람 선호 구단 따라감</button>
                {KBO_TEAMS.map(t => (
                  <button key={t.key} type="button" onMouseDown={e => e.preventDefault()} onClick={() => setGTeam(t.key)} title={t.name}
                    className={`flex items-center gap-0.5 ${chip(gTeam === t.key)}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoUrl(t.key)} alt="" className="h-3.5 w-3.5 object-contain" />{t.name.split(' ')[0]}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="w-14 text-white/60">기간</span>
                {([[0, '♾ 영구'], [1, '⏰ 1일권(오늘 밤 12시까지)']] as [0 | 1, string][]).map(([d, label]) => (
                  <button key={d} type="button" onMouseDown={e => e.preventDefault()} onClick={() => setGDays(d)} className={chip(gDays === d)}>{label}</button>
                ))}
                <input value={gMsg} onChange={e => setGMsg(e.target.value.slice(0, 30))} placeholder="한마디(선택)"
                  className="ml-2 w-40 rounded-md border border-white/20 bg-white/10 px-2 py-0.5 text-[12px] text-white placeholder:text-white/40 focus:outline-none" />
                <button type="button" disabled={busy || !gTo} onMouseDown={e => e.preventDefault()}
                  onClick={() => void run(async () => {
                    const err = await props.gift(gTo, gPart, gTeam === 'follow' ? null : gTeam, gDays, gMsg)
                    if (!err) setGMsg('')
                    return err
                  }, `🎁 ${props.nameOf(gTo)}님에게 ${gTeam === 'follow' ? '' : `${teamOf(gTeam)?.name.split(' ')[0]} `}${partInfo(gPart)?.name}(${gDays ? '1일권' : '영구'}) 선물 — 바로 장착돼요`)}
                  className="ml-auto rounded-md bg-[#DB2777] px-3 py-1 font-black text-white disabled:opacity-50">🎁 선물하기</button>
              </div>
            </div>
          )}
        </div>
        <p className="text-[10px] text-white/55">{msg ? `💬 ${msg} · ` : ''}{tab === 'give' ? '선물은 받는 사람 차에 바로 끼워져요 · 구단을 정하면 그 부품만 그 구단 색·엠블럼' : RACE_REWARD_TEXT}</p>
      </div>
    </div>
  )
}
