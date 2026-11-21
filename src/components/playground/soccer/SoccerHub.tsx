'use client'

// ⚽ 운동장 축구장 — 로비(PK·미니 축구) · 대기실 · 모집 카드 · 경기 창 · PK 창을 한 곳에 모은 훅.
// PlaygroundWidget은 이 훅을 부르고(useSoccerHub) 운동장 채널 'sc' 메시지를 onMsg로 넘기고 ui를 그리기만 한다.
// 유니폼은 야구 장비 연동(soccerKit) — 따로 사는 아이템 없음.

import type { GameLayout } from '../GameArena'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import PgModal from '@/components/playground/PgModal'
import { useSeatDrag } from '@/components/playground/useSeatDrag'
import SoccerGame, { teamInfos, type SoccerPerson } from './SoccerGame'
import PenaltyKick from './PenaltyKick'
import { SoccerKid } from './SoccerKid'
import type { SoccerResult } from './SoccerArena'
import { createClient } from '@/lib/supabase/client'
import { KBO_TEAMS, logoUrl, teamOf, type Equip } from '@/lib/baseballGear'
import { autoClub, clubKit, kitNumber, playerKit } from '@/lib/soccerKit'
import { PK_KICKS, keeperOf, parseDetail, pkRank, type PkRow } from '@/lib/soccerPk'
import { scSeatsOf, useSoccerRooms, type ClubPick, type ScGameRelay, type ScRoomMsg, type ScSize } from '@/lib/useSoccerRooms'
import { addDays, kstDay, weekStart } from '@/lib/dailyShot'
import type { Member } from '@/lib/members'
import { displayName } from '@/lib/members'

export function useSoccerHub(opts: {
  myId: string | null
  memberMap: Map<string, Member>
  equips: Map<string, Equip>
  onlineCount: number
  toast: (text: string) => void
  addNews: (text: string) => void
  nickOf: (id: string) => string
  send: (event: string, payload: Record<string, unknown>) => void
  serverNow: () => number
  arena?: { layout: GameLayout; onWindow?: () => void } // 야구식 풀화면 게임 화면
}) {
  const { myId, memberMap, equips, toast, addNews, nickOf, send } = opts
  const [lobby, setLobby] = useState(false)
  const [size, setSize] = useState<ScSize>(2)
  const [pk, setPk] = useState<null | 'daily' | 'practice'>(null)
  const [pkRows, setPkRows] = useState<PkRow[] | null>(null)
  const [pkMissing, setPkMissing] = useState(false)
  const serverNowRef = useRef(opts.serverNow)
  useEffect(() => { serverNowRef.current = opts.serverNow })

  const personOf = useCallback((id: string): SoccerPerson => {
    const m = memberMap.get(id)
    const name = displayName(m) || '?'
    return { name, equip: equips.get(id) ?? null, number: kitNumber(m?.back_number, name) }
  }, [memberMap, equips])
  const personRef = useRef(personOf)
  useEffect(() => { personRef.current = personOf })

  const rooms = useSoccerRooms({
    myId, toast, addNews, nickOf, serverNow: () => serverNowRef.current(),
    send: (event, msg) => send(event, msg as unknown as Record<string, unknown>),
    resolveKits: (players, sz, kits) => {
      const eq = (team: 'A' | 'B') => players.slice(team === 'A' ? 0 : sz, team === 'A' ? sz : sz * 2).filter((x): x is string => !!x).map(id => personRef.current(id).equip)
      return { A: kits.A === 'auto' ? autoClub('A', eq('A')) : kits.A, B: kits.B === 'auto' ? autoClub('B', eq('B')) : kits.B }
    },
  })
  const busy = !!rooms.session || !!rooms.room || !!pk
  // 대기실 자리 끌어놓기 — 방장만
  const seatDrag = useSeatDrag(!!rooms.room && rooms.room.host === myId, rooms.swapSeats)

  // ── PK 기록(이번 주 + 지난주) — 로비를 열 때·찰 때 다시 받는다
  const today = kstDay(opts.serverNow())
  const loadPk = useCallback(async () => {
    const from = addDays(weekStart(today), -7)
    const { data, error } = await createClient().from('soccer_pk').select('member_id,day,detail,goals').gte('day', from)
    if (error) { setPkMissing(true); setPkRows([]); return }
    setPkMissing(false)
    setPkRows((data ?? []) as PkRow[])
  }, [today])
  const openLobby = useCallback(() => { setLobby(true); void loadPk() }, [loadPk])
  const myToday = pkRows?.find(r => r.member_id === myId && r.day === today) ?? null
  const kickPk = useCallback(async (goal: boolean): Promise<string | null> => {
    const { data, error } = await createClient().rpc('soccer_pk_kick', { p_goal: goal })
    if (error) return error.message.includes('FULL') ? '오늘 5번을 다 찼어요' : error.message
    const row = data as PkRow
    setPkRows(list => [...(list ?? []).filter(r => !(r.member_id === row.member_id && r.day === row.day)), row])
    if (row.detail.length === PK_KICKS && myId) {
      const text = `⚽ ${nickOf(myId)} 오늘의 PK ${row.goals}/${PK_KICKS}골${row.goals === PK_KICKS ? ' 🔥 퍼펙트!' : ''}`
      addNews(text)
      send('sc', { type: 'news', text })
    }
    return null
  }, [myId, nickOf, addNews, send])

  // ── 경기 결과 → 소식(사람 2명 이상, 방장만)
  const onEnd = useCallback((r: SoccerResult) => {
    toast(r.winner === 'draw' ? '⚽ 무승부!' : r.winner === r.myTeam ? '⚽ 승리! 🏆' : '⚽ 아쉽게 패배 😵')
    const ses = rooms.session
    if (!ses || !myId || ses.hostId !== myId || ses.players.filter(Boolean).length < 2) return
    const names = (t: 'A' | 'B') => r.players.filter(p => p.team === t && !p.cpu).map(p => p.name).join('·') || 'CPU'
    const top = [...r.players].filter(p => !p.cpu).sort((a, b) => b.goals - a.goals)[0]
    const text = `⚽ 미니 축구 ${names('A')} ${r.score.A}:${r.score.B} ${names('B')}${top && top.goals >= 2 ? ` · ${top.name} ${top.goals}골${top.goals >= 3 ? ' 해트트릭!' : ''}` : ''}`
    addNews(text)
    send('sc', { type: 'news', text })
  }, [rooms.session, myId, toast, addNews, send])

  const enter = useCallback(() => {
    const offer = rooms.offers[0]
    if (offer && offer.count < scSeatsOf(offer.size)) rooms.join(offer)
    else openLobby()
  }, [rooms, openLobby])

  const onMsg = rooms.onMsg as (m: ScRoomMsg | ScGameRelay) => void
  const modalOpen = !!myId && ((lobby && !busy) || (!!rooms.room && !rooms.session))

  const myEquip = myId ? equips.get(myId) ?? null : null
  const me = myId ? personOf(myId) : null
  const myKit = playerKit(myEquip)
  const keeper = keeperOf(today)

  // 이번 주 순위
  const rank = useMemo(() => (pkRows ? pkRank(pkRows, weekStart(today), addDays(weekStart(today), 6)) : []), [pkRows, today])
  const todayRows = useMemo(() => (pkRows ?? []).filter(r => r.day === today).sort((a, b) => b.goals - a.goals), [pkRows, today])

  let ui: ReactNode = null
  if (myId && me) ui = (
    <>
      {lobby && !busy && (
        <PgModal icon="⚽" iconBg="#DCFCE7" title="축구장" sub="오늘의 PK · 미니 축구 1:1~3:3" onClose={() => setLobby(false)} width={820} rightWidth={300}
          left={<>
            <div className="flex items-center gap-3 rounded-xl bg-[#F0FDF4] p-2.5">
              <div className="flex gap-1">
                <SoccerKid kit={myKit} number={me.number} size={44} />
                <SoccerKid kit={myKit} number={me.number} size={44} back name={me.name} />
              </div>
              <div className="min-w-0 leading-tight">
                <p className="text-[11px] text-[#64748B]">내 유니폼 (야구 장비 연동)</p>
                <p className="text-[13px] font-extrabold text-[#0F172A]">{myKit.club ? `${teamOf(myKit.club)?.name} · ${myEquip?.slots.top ? partName(myEquip.slots.top.part) : ''}` : '연습복 (야구 유니폼 없음)'}</p>
                <p className="text-[10.5px] text-[#64748B]">등번호 {me.number} · 야구 꾸미기에서 유니폼을 바꾸면 여기도 바뀌어요{myKit.cap ? ' · 모자도 같이' : ''}</p>
              </div>
            </div>
            {/* ── PK 칸: 혼자 하는 승부차기(인원 고르기 없음) */}
            <div className="rounded-xl border border-[#BBF7D0] bg-white p-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[13.5px] font-extrabold text-[#0F172A]">🥅 오늘의 PK <span className="text-[11px] font-semibold text-[#64748B]">· 혼자 · 하루 {PK_KICKS}번</span></p>
                {myToday && <PkDots detail={myToday.detail} />}
              </div>
              <p className="text-[11px] text-[#475569]">오늘의 골키퍼 <b>{keeper.name}</b> — {keeper.tip}</p>
              {pkMissing && <p className="mt-1 text-[10.5px] text-[#DC2626]">기록을 불러오지 못했어요(연습은 할 수 있어요)</p>}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" disabled={!pkMissing && (!pkRows || (myToday?.detail.length ?? 0) >= PK_KICKS)} onMouseDown={e => e.preventDefault()} onClick={() => setPk('daily')}
                  className="rounded-xl bg-[#15803D] px-3 py-2 text-left text-[12.5px] font-bold text-white transition-colors hover:bg-[#166534] disabled:opacity-45">
                  ⚽ PK 차기 <span className="font-normal text-white/75">· {pkRows ? `남은 ${Math.max(0, PK_KICKS - (myToday?.detail.length ?? 0))}번` : '…'}</span>
                </button>
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setPk('practice')}
                  className="rounded-xl bg-[#F0FDF4] px-3 py-2 text-left text-[12.5px] font-bold text-[#15803D] ring-1 ring-[#BBF7D0] transition-colors hover:bg-[#DCFCE7]">🎯 연습 <span className="font-normal text-[#15803D]/70">· 기록 안 됨</span></button>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-[#F1F5F9] pt-2">
                <div>
                  <p className="mb-1 text-[10.5px] font-bold text-[#94A3B8]">오늘</p>
                  {todayRows.length === 0 ? <p className="text-[11px] text-[#94A3B8]">{pkRows ? '아직 아무도 안 찼어요' : '불러오는 중…'}</p> : todayRows.slice(0, 6).map(r => (
                    <p key={r.member_id} className="flex items-center justify-between text-[11.5px]"><span className={r.member_id === myId ? 'font-extrabold' : ''}>{displayName(memberMap.get(r.member_id)) || '?'}</span><PkDots detail={r.detail} small /></p>
                  ))}
                </div>
                <div>
                  <p className="mb-1 text-[10.5px] font-bold text-[#94A3B8]">이번 주 순위</p>
                  {rank.length === 0 ? <p className="text-[11px] text-[#94A3B8]">-</p> : rank.slice(0, 6).map((r, i) => (
                    <p key={r.member_id} className="flex items-center justify-between text-[11.5px]"><span className={r.member_id === myId ? 'font-extrabold' : ''}>{['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} {displayName(memberMap.get(r.member_id)) || '?'}</span><b>{r.goals}골</b></p>
                  ))}
                </div>
              </div>
            </div>
          </>}
          right={<>
            {/* ── 미니 축구 칸: 인원 고르기는 여기만 */}
            <p className="text-[13.5px] font-extrabold text-[#0F172A]">🏟 미니 축구 <span className="text-[11px] font-semibold text-[#64748B]">· 팀전</span></p>
            <p className="text-[10.5px] leading-relaxed text-[#64748B]">2분, 동점이면 골든골 · 벽에 맞으면 튕겨요<br />방향키 이동 · E 달리기 · D 슛(누른 만큼) · S 패스 · A 태클 · X 개인기/몸통박치기</p>
            <div className="flex gap-1 rounded-xl bg-[#F1F5F9] p-1">
              {([1, 2, 3] as const).map(n => (
                <button key={n} type="button" onMouseDown={e => e.preventDefault()} onClick={() => setSize(n)}
                  className={`flex-1 rounded-lg py-1 text-[12px] font-bold ${size === n ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[#64748B]'}`}>{n}:{n}</button>
              ))}
            </div>
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { rooms.openRoom(size, false); setLobby(false) }}
              className="rounded-xl bg-[#0F172A] px-3 py-2 text-left font-semibold text-white transition-colors hover:bg-[#1E293B]">👥 방 열기 {size}:{size} <span className="font-normal text-white/60">· 팀원 모집, 빈자리는 CPU</span></button>
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { rooms.openRoom(size, true); setLobby(false) }}
              className="rounded-xl bg-[#F1F5F9] px-3 py-2 text-left font-semibold text-[#0F172A] transition-colors hover:bg-[#E2E8F0]">🤖 CPU랑 바로 {size}:{size}</button>
            <p className="text-[10px] text-[#94A3B8]">지금 운동장 연 팀원 {Math.max(0, opts.onlineCount - 1)}명</p>
          </>} />
      )}

      {rooms.room && !rooms.session && (
        <PgModal icon="⚽" iconBg="#DCFCE7" title={`미니 축구 ${rooms.room.size}:${rooms.room.size}`} sub="2분 · 동점이면 골든골" width={820} rightWidth={280}
          left={<>
            <p className="text-[11px] text-[#64748B]">{rooms.room.host === myId ? '팀원이 참가하면 아래에 보여요 · 빈자리는 CPU · 이름을 누르면 옆 자리와 팀이 바뀌어요 · 끌어서 원하는 칸에 놓아도 돼요' : `${nickOf(rooms.room.host)}님이 시작하기를 기다리는 중…`}</p>
            {seatDrag.ghost}
            <div className="grid grid-cols-2 gap-3">
              {(['A', 'B'] as const).map(team => {
                const r = rooms.room!
                const pick = r.kits[team]
                const seatIds = Array.from({ length: scSeatsOf(r.size) }, (_, i) => i).filter(i => (i % 2 === 0) === (team === 'A'))
                const club = pick === 'auto' ? autoClub(team, seatIds.map(i => r.seats[i]).filter(Boolean).map(id => equips.get(id) ?? null)) : pick
                const info = teamInfos({ A: team === 'A' ? club : 'samsung', B: team === 'B' ? club : 'samsung' })[team]
                return (
                  <div key={team} className="rounded-xl border p-2" style={{ borderColor: info.ring + '66' }}>
                    <div className="mb-1.5 flex items-center gap-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={logoUrl(club)} alt="" width={20} height={20} style={{ objectFit: 'contain' }} />
                      <span className="text-[12px] font-extrabold text-[#0F172A]">{team === 'A' ? '홈' : '원정'} · {teamOf(club)?.name}</span>
                    </div>
                    {r.host === myId && <ClubSelect value={pick} onChange={c => rooms.setRoomKit(team, c)} />}
                    <div className="mt-1.5 flex flex-col gap-1">
                      {seatIds.map(i => {
                        const id = r.seats[i] || null
                        const p = id ? personOf(id) : null
                        return (
                          <button key={i} type="button" disabled={r.host !== myId} onMouseDown={e => e.preventDefault()} onClick={() => rooms.swapSeats(i, i % 2 === 0 ? i + 1 : i - 1)}
                            {...seatDrag.seatProps(i, id ? (p?.name ?? '?') : 'CPU')} style={seatDrag.seatStyle}
                            className={`flex items-center gap-2 rounded-lg bg-[#F8FAFC] px-2 py-1 text-left hover:bg-[#F1F5F9] ${seatDrag.seatClass(i)}`}>
                            <SoccerKid kit={clubKit(club, team === 'B', p?.equip)} number={p?.number ?? 90 + i} size={22} />
                            <span className="font-semibold text-[#0F172A]">{id ? `${p?.name}${id === r.host ? ' 👑' : ''}` : 'CPU (빈자리)'}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </>}
          right={<>
            <p className="text-[10.5px] leading-relaxed text-[#64748B]">유니폼: 팀마다 KBO 구단 하나 — 홈은 흰 유니폼, 원정은 구단 색. ‘자동’이면 그 팀 첫 사람이 야구에서 입은 유니폼 구단</p>
            {rooms.room.host === myId && (
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={rooms.start} className="rounded-xl bg-[#0F172A] px-3 py-2.5 text-[13px] font-extrabold text-white hover:bg-[#1E293B]">▶ 시작</button>
            )}
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={rooms.leave} className="rounded-xl bg-[#F1F5F9] px-3 py-2 font-semibold text-[#0F172A] hover:bg-[#E2E8F0]">{rooms.room.host === myId ? '방 닫기' : '나가기'}</button>
          </>} />
      )}

      {rooms.session && (
        <SoccerGame key={rooms.session.bid} session={rooms.session} myId={myId} personOf={personOf}
          relay={payload => send('sc', { type: 'game', bid: rooms.session!.bid, payload } as unknown as Record<string, unknown>)}
          setRelayListener={rooms.setRelayListener}
          onEnd={onEnd}
          onClose={() => rooms.endSession()}
          onRestart={() => { const sz = rooms.session!.size; rooms.endSession(); rooms.openRoom(sz, true) }}
          arena={opts.arena} />
      )}

      {pk && (
        <PenaltyKick day={today} kit={myKit} number={me.number} name={me.name} practice={pk === 'practice'}
          done={pk === 'daily' ? myToday?.detail ?? '' : ''}
          onKick={pk === 'daily' ? kickPk : undefined}
          onClose={() => { setPk(null); openLobby() }} />
      )}
    </>
  )

  // 모집 카드(운동장 위)
  const offerCards = (className: string) => (rooms.offers.length > 0 && !busy ? (
    <div className={`absolute left-1/2 z-[55] flex -translate-x-1/2 flex-col gap-1.5 ${className}`}>
      {rooms.offers.slice(0, 2).map(o => (
        <div key={o.bid} className="flex items-center gap-3 rounded-2xl bg-[#0F172A] py-2 pl-2.5 pr-2 text-white shadow-[0_18px_40px_-12px_rgba(15,23,42,0.6)] ring-1 ring-white/10" style={{ animation: 'pg-toast 220ms ease-out' }}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#22C55E] text-[18px]">⚽</span>
          <div className="leading-tight">
            <p className="text-[12.5px] font-bold">{nickOf(o.host)}님이 미니 축구 {o.size}:{o.size} 모집 중</p>
            <p className="text-[11px] text-white/65">{o.count}/{scSeatsOf(o.size)}명 · 빈자리는 CPU</p>
          </div>
          <button type="button" disabled={o.count >= scSeatsOf(o.size)} onMouseDown={e => e.preventDefault()} onClick={() => { setLobby(false); rooms.join(o) }}
            className="rounded-xl bg-[#FACC15] px-4 py-2 text-[12.5px] font-extrabold text-[#0F172A] transition-colors hover:bg-[#FDE047] disabled:opacity-40">{o.count >= scSeatsOf(o.size) ? '꽉 참' : '참가하기'}</button>
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => rooms.dismissOffer(o.bid)}
            className="rounded-lg px-2 py-1 text-[11px] font-semibold text-white/55 transition-colors hover:text-white">다음에</button>
        </div>
      ))}
    </div>
  ) : null)

  const sub = rooms.offers[0] ? `${rooms.offers[0].count}/${scSeatsOf(rooms.offers[0].size)} 모집 중` : myToday ? `PK ${myToday.goals}골 (${myToday.detail.length}/${PK_KICKS})` : '오늘의 PK · 미니 축구'
  return { ui, offerCards, busy, lobby, setLobby, enter, onMsg, modalOpen, hasOffer: rooms.offers.length > 0, sub }
}

function partName(part: string) {
  return ({ uniform: '홈', away: '원정', military: '밀리터리', retro: '레트로', autumn: '가을야구', holiday: '홀리데이' } as Record<string, string>)[part] ?? ''
}

function ClubSelect({ value, onChange }: { value: ClubPick; onChange: (c: ClubPick) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value as ClubPick)}
      className="w-full rounded-lg border border-[#E2E8F0] bg-white px-2 py-1 text-[11.5px] font-semibold text-[#0F172A]">
      <option value="auto">자동 (야구 유니폼 따라)</option>
      {KBO_TEAMS.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
    </select>
  )
}

function PkDots({ detail, small }: { detail: string; small?: boolean }) {
  const d = parseDetail(detail)
  const sz = small ? 7 : 10
  return (
    <span className="inline-flex gap-[3px]">
      {Array.from({ length: PK_KICKS }, (_, i) => (
        <span key={i} style={{ width: sz, height: sz, borderRadius: 99, background: d[i] === true ? '#22C55E' : d[i] === false ? '#EF4444' : '#E2E8F0' }} />
      ))}
    </span>
  )
}

