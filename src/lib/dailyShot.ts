// 🎯 오늘의 한 발 — 순수 로직(화면·DB와 분리, 테스트 가능).
// 과녁 좌표는 반지름 1 기준(가운데 0,0 · 오른쪽 +x · 아래 +y). 점수 계산은 add_daily_shot.sql 의 daily_shot_finish 와 같아야 한다.

export type ShotRow = { id: number; member_id: string; day: string; x: number | null; y: number | null; score: number | null; started_at: string }

/** 맞은 자리 → 점수(0~100). 가운데 0.05 안 100, 그 밖 95×(1-거리), 과녁 밖 0 */
export function scoreOf(x: number, y: number) {
  const d = Math.hypot(x, y)
  if (d <= 0.05) return 100
  if (d >= 1) return 0
  return Math.round(95 * (1 - d))
}

// 날짜 문자열 → 0~1 난수 여러 개(같은 날짜면 모두에게 같은 값)
function seeded(day: string) {
  let h = 2166136261
  for (const c of day) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) }
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Condition = {
  /** 바람(과녁 반지름 기준, 다트가 날아가는 동안 밀리는 양) */
  windX: number; windY: number
  /** 바람 세기 0~3 (표시용) */
  windLv: number
  /** 조준선 왕복 빠르기(초당 왕복 횟수) */
  speedX: number; speedY: number
  label: string
}

/** 오늘의 조건 — 날짜마다 바람·조준 속도가 달라진다(팀 전원 같음) */
export function conditionOf(day: string): Condition {
  const r = seeded(day)
  const lv = Math.floor(r() * 4)                    // 0 무풍 · 1 산들 · 2 바람 · 3 강풍
  const ang = r() * Math.PI * 2
  const mag = [0, 0.08, 0.16, 0.26][lv]
  const speedX = 0.55 + r() * 0.35, speedY = 0.55 + r() * 0.35
  const label = ['🍃 무풍', '🌬 산들바람', '💨 바람', '🌪 강풍'][lv]
  return { windX: Math.cos(ang) * mag, windY: Math.sin(ang) * mag, windLv: lv, speedX, speedY, label }
}

/** 조준선 위치(-1.1~1.1 왕복). t초, 초당 왕복 f, 시작 위상 ph */
export const sweep = (t: number, f: number, ph = 0) => Math.sin(ph + t * f * Math.PI * 2) * 1.1

/** 조준한 자리 + 바람 = 실제로 맞은 자리 */
export function landing(ax: number, ay: number, c: Condition) {
  return { x: ax + c.windX, y: ay + c.windY }
}

/** 서울 날짜(YYYY-MM-DD) */
export const kstDay = (ms: number) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10)

/** 그 날짜가 속한 주의 월요일 */
export function weekStart(day: string) {
  const d = new Date(day + 'T00:00:00Z')
  const dow = (d.getUTCDay() + 6) % 7 // 월=0
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}
export function addDays(day: string, n: number) {
  const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export type Rank = { member_id: string; total: number; days: number; best: number }
/** 기간 합계 순위 — 놓침(점수 없음)은 0점, 같은 합계면 최고점 높은 순 */
export function rankOf(rows: ShotRow[], from: string, to: string): Rank[] {
  const m = new Map<string, Rank>()
  for (const r of rows) {
    if (r.day < from || r.day > to) continue
    const k = m.get(r.member_id) ?? { member_id: r.member_id, total: 0, days: 0, best: 0 }
    const s = r.score ?? 0
    k.total += s; k.days++; k.best = Math.max(k.best, s)
    m.set(r.member_id, k)
  }
  return [...m.values()].sort((a, b) => b.total - a.total || b.best - a.best)
}
