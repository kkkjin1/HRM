// ⚽ 오늘의 PK — 순수 로직(화면·DB와 분리, 테스트 가능). 2026-11-19
// 하루 5번(기록) + 연습은 무제한(기록 안 됨). 골키퍼는 NPC — 날짜마다 바뀌고(팀 전원 같은 키퍼) 성향이 있다.
//
// 골대 좌표: 가로 x -1(왼쪽 기둥) ~ 1(오른쪽 기둥), 세로 y 0(땅) ~ 1(크로스바). 밖이면 아웃.
// 조준: 방향키로 조준점(골대 밖까지 갈 수 있음) → Space 누르고 있으면 힘 막대가 오르내림 → 떼면 슛.
//   · 힘이 셀수록 빠르다(키퍼가 못 따라옴) 대신 흔들리고 위로 뜬다(0.82 넘으면 크로스바 위험)
//   · 약하면 정확하지만 느려서 키퍼가 잘 막는다
//   · 구석(기둥 근처)일수록 키퍼가 못 닿지만 골대·아웃 위험
// DB 규칙(하루 5번·차는 순간 1번 소모)은 supabase/add_soccer_pk.sql.

export const PK_KICKS = 5
export const POWER_PERIOD = 1.5 // 힘 막대 한 번 오르내리는 시간(초)

export type PkOutcome = 'goal' | 'save' | 'post' | 'over' | 'wide'
export const OUTCOME_TEXT: Record<PkOutcome, string> = { goal: '골!!', save: '선방!', post: '땡! 골대', over: '하늘로…', wide: '빗나감' }

function seeded(str: string) {
  let h = 2166136261
  for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) }
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const KEEPER_NAMES = ['철벽 박부장', '칼퇴 수호신', '결재 반려왕', '연봉 협상가', '회의실 지박령', '엑셀 장인', '야근 요정', '품의서 문지기', '인사평가 S등급', '출근 1등']

export interface Keeper {
  name: string
  kit: number // GK_KITS 번호
  bias: -1 | 0 | 1 // 자주 뛰는 쪽 (-1 왼쪽 · 0 가운데 버팀 · 1 오른쪽) — 슈터 기준(화면) 방향
  read: number // 조준을 읽어 맞는 쪽으로 뛸 확률
  reach: number // 팔 길이 배수
  react: number // 반응 시간(초)
  tip: string // 오늘의 키퍼 한 줄 소개(성향 힌트)
}

/** 오늘의 골키퍼 — 날짜(YYYY-MM-DD)마다 바뀐다, 팀 전원 같음 */
export function keeperOf(day: string): Keeper {
  const r = seeded(`pk-${day}`)
  const name = KEEPER_NAMES[Math.floor(r() * KEEPER_NAMES.length)]
  const kit = Math.floor(r() * 5)
  const b = r()
  const bias: Keeper['bias'] = b < 0.36 ? -1 : b < 0.72 ? 1 : 0
  const read = 0.72 + r() * 0.16
  const reach = 1.08 + r() * 0.2
  const react = 0.13 + r() * 0.1
  const tip = bias === 0 ? '가운데를 잘 지키고 늦게 움직여요' : `${bias < 0 ? '왼쪽' : '오른쪽'}으로 잘 뛰어요`
  return { name, kit, bias, read, reach, react, tip: `${tip}${reach > 1.2 ? ' · 팔이 길어요' : ''}${react < 0.17 ? ' · 반응이 빨라요' : ''}` }
}

/** 힘 막대(0~1~0 반복) — 누르기 시작한 뒤 sec초 */
export function powerAt(sec: number) {
  const k = (Math.max(0, sec) / POWER_PERIOD) % 1
  return k < 0.5 ? k * 2 : 2 - k * 2
}

export interface Shot { x: number; y: number; flight: number }

/** 조준 + 힘 → 실제로 날아가는 곳·시간 */
export function shotOf(aim: { x: number; y: number }, power: number, rnd: () => number): Shot {
  const p = Math.max(0, Math.min(1, power))
  const err = 0.07 + Math.max(0, p - 0.6) * 0.6
  let x = aim.x + (rnd() - 0.5) * 2 * err
  let y = aim.y + (rnd() - 0.5) * err
  if (p > 0.82) y += (p - 0.82) * 2.4 // 너무 세면 뜬다
  if (p < 0.35) y -= (0.35 - p) * 0.8 // 너무 약하면 땅볼
  y = Math.max(0.03, y)
  x = Math.round(x * 1000) / 1000
  y = Math.round(y * 1000) / 1000
  return { x, y, flight: 0.66 - 0.4 * p }
}

export interface Dive { x: number; y: number } // 키퍼가 뛰는 곳(골대 좌표)

/** 키퍼가 어디로 뛸지 — 차는 순간 정한다 */
export function diveOf(k: Keeper, aim: { x: number; y: number }, rnd: () => number): Dive {
  if (rnd() < k.read) {
    // 읽음: 조준한 쪽으로(조금 덜)
    return { x: Math.max(-0.85, Math.min(0.85, aim.x * 0.85)), y: Math.max(0.2, Math.min(0.8, aim.y)) }
  }
  const r = rnd()
  const w = k.bias === 0 ? [0.3, 0.4, 0.3] : k.bias < 0 ? [0.5, 0.18, 0.32] : [0.32, 0.18, 0.5]
  const side = r < w[0] ? -1 : r < w[0] + w[1] ? 0 : 1
  return { x: side * (0.55 + rnd() * 0.25), y: side === 0 ? 0.5 : rnd() < 0.5 ? 0.28 : 0.68 }
}

/** 키퍼 손 위치(공이 도착하는 순간) — 0초에 가운데 서 있다가 react 뒤 dive로 */
export function keeperAt(k: Keeper, d: Dive, sec: number) {
  const prog = Math.max(0, Math.min(1, (sec - k.react) / 0.4))
  const e = 1 - (1 - prog) * (1 - prog)
  return { x: d.x * e, y: 0.45 + (d.y - 0.45) * e, prog: e }
}

export function judgePk(k: Keeper, shot: Shot, d: Dive): PkOutcome {
  const ax = Math.abs(shot.x)
  // 골대(기둥·크로스바) 맞음
  const hitPost = ax >= 0.965 && ax <= 1.06 && shot.y <= 1.04
  const hitBar = shot.y >= 0.965 && shot.y <= 1.06 && ax <= 1.04
  if (hitPost || hitBar) return 'post'
  if (shot.y > 1.0) return 'over'
  if (ax > 1.0) return 'wide'
  const kp = keeperAt(k, d, shot.flight)
  const dx = (shot.x - kp.x) / (0.3 * k.reach)
  const dy = (shot.y - kp.y) / (0.42 * k.reach)
  if (dx * dx + dy * dy <= 1) return 'save'
  // 가운데 버티는 키퍼 몸통
  if (d.x === 0 && ax < 0.2 && shot.y < 0.8) return 'save'
  return 'goal'
}

/** 화면 표시: OOX-X → [true,true,false,null,false] */
export function parseDetail(detail: string) {
  return detail.split('').map(c => (c === 'O' ? true : c === 'X' ? false : null))
}

export type PkRow = { member_id: string; day: string; detail: string; goals: number }
export type PkRank = { member_id: string; goals: number; kicks: number; days: number }
/** 기간 순위 — 골 많은 순, 같으면 찬 횟수 적은 순(효율) */
export function pkRank(rows: PkRow[], from: string, to: string): PkRank[] {
  const m = new Map<string, PkRank>()
  for (const r of rows) {
    if (r.day < from || r.day > to) continue
    const k = m.get(r.member_id) ?? { member_id: r.member_id, goals: 0, kicks: 0, days: 0 }
    k.goals += r.goals
    k.kicks += r.detail.length
    k.days++
    m.set(r.member_id, k)
  }
  return [...m.values()].sort((a, b) => b.goals - a.goals || a.kicks - b.kicks)
}
