// ⚽ 축구 유니폼 — 야구 꾸미기(baseballGear)와 연동. 새 아이템을 따로 만들지 않고 야구 장비함의 구단·상의 종류를 그대로 입는다.
//   · PK: 내 야구 상의(홈·원정·밀리터리·레트로·가을야구·홀리데이) 그대로 + 등번호(야구 등번호 back_number)
//   · 팀전: 팀마다 구단 하나(대기실에서 방장이 고름, 기본 = 그 팀 첫 사람이 입은 야구 유니폼 구단).
//          A팀은 홈(흰 바탕), B팀은 원정(구단 색 바탕) — 같은 구단끼리 붙어도 구분된다.
//   · 모자: 야구 머리 장비가 있으면 그 구단 모자 색
// 유니폼이 없으면 기본 연습복(회색).

import { KBO_TEAMS, teamOf, uniformTeam, type Equip, type KboTeam, type TeamKey } from './baseballGear'

export type Kit = {
  club: TeamKey | null
  label: string
  jersey: string
  trim: string // 소매·목·번호
  second: string
  shorts: string
  socks: string
  pinstripe?: boolean
  pattern?: 'camo' | 'snow'
  cap: string | null // 야구 모자 색(머리 장비 있을 때)
}

const WHITE = '#FFFFFF'

export function kitOfTeam(t: KboTeam, cap: string | null = null): Kit {
  const white = t.jersey.toUpperCase() === WHITE
  return {
    club: t.name === '기본' ? null : t.key,
    label: t.name,
    jersey: t.jersey,
    trim: t.primary,
    second: t.secondary,
    shorts: white ? t.primary : t.pattern === 'camo' ? '#4A5530' : t.jersey,
    socks: white ? t.secondary : t.primary === WHITE ? t.secondary : t.primary,
    pinstripe: t.pinstripe,
    pattern: t.pattern,
    cap,
  }
}

const capOf = (e: Equip | null | undefined) => {
  const head = e?.slots.head
  return head ? teamOf(head.team)?.cap ?? null : null
}

export const PLAIN_KIT: Kit = { club: null, label: '연습복', jersey: '#E5E7EB', trim: '#6B7280', second: '#9CA3AF', shorts: '#4B5563', socks: '#9CA3AF', cap: null }

/** 내 야구 장비 그대로(상의 종류 포함) — PK·개인 미리보기 */
export function playerKit(e: Equip | null | undefined): Kit {
  const t = uniformTeam(e ?? null)
  return t ? kitOfTeam(t, capOf(e)) : { ...PLAIN_KIT, cap: capOf(e) }
}

/** 팀전 구단 유니폼 — away면 구단 색 바탕 */
export function clubKit(club: TeamKey, away: boolean, e?: Equip | null): Kit {
  const t = teamOf(club) ?? KBO_TEAMS[0]
  const tt: KboTeam = away ? { ...t, jersey: t.primary, primary: WHITE, pinstripe: false } : t
  return kitOfTeam(tt, capOf(e))
}

/** 팀 구단 자동 선택: 그 팀 사람 중 야구 유니폼을 입은 첫 사람의 구단, 없으면 기본(A 삼성 · B KIA) */
export function autoClub(team: 'A' | 'B', equips: (Equip | null | undefined)[]): TeamKey {
  for (const e of equips) if (e?.uniform) return e.uniform
  return team === 'A' ? 'samsung' : 'kia'
}

// PK 골키퍼 — 날마다 바뀌는 형광 골키퍼 옷(보라 계열 제외)
export const GK_KITS: Kit[] = [
  { club: null, label: '라임', jersey: '#A3E635', trim: '#1A2E05', second: '#365314', shorts: '#1A2E05', socks: '#A3E635', cap: null },
  { club: null, label: '오렌지', jersey: '#FB923C', trim: '#431407', second: '#7C2D12', shorts: '#1F2937', socks: '#FB923C', cap: null },
  { club: null, label: '시안', jersey: '#22D3EE', trim: '#083344', second: '#155E75', shorts: '#0F172A', socks: '#22D3EE', cap: null },
  { club: null, label: '옐로', jersey: '#FACC15', trim: '#1F2937', second: '#422006', shorts: '#111827', socks: '#FACC15', cap: null },
  { club: null, label: '핑크', jersey: '#FB7185', trim: '#4C0519', second: '#881337', shorts: '#111827', socks: '#FB7185', cap: null },
]

/** 등번호 — 야구 등번호(members.back_number) 그대로, 없으면 이름으로 정한 번호(baseball/scene.tsx backNumber와 같은 규칙) */
export function kitNumber(backNumber: number | null | undefined, name: string) {
  if (typeof backNumber === 'number') return backNumber
  let h = 7
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 9973
  return (h % 99) + 1
}
