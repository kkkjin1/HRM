// 커뮤니티데이 — 매월 마지막 주 목요일이 기본이고, 날짜를 옮긴 달은 DB(team_log_community_days)에 남은 날짜를 쓴다.
// 날짜는 모두 'YYYY-MM-DD', 달은 'YYYY-MM'.

const pad = (n: number) => String(n).padStart(2, '0')

export const monthKey = (year: number, month: number) => `${year}-${pad(month)}`

// month: 1~12
export function lastThursday(year: number, month: number): string {
  const last = new Date(year, month, 0) // 그달 말일
  const back = (last.getDay() - 4 + 7) % 7 // 목요일 = 4
  return `${year}-${pad(month)}-${pad(last.getDate() - back)}`
}

export function communityDayOf(year: number, month: number, moved: Record<string, string>): string {
  return moved[monthKey(year, month)] ?? lastThursday(year, month)
}

// 보고 있는 달 앞뒤까지(달력 첫·마지막 주에 이웃 달 날짜가 섞인다) 날짜 → 그 커뮤니티데이가 속한 달.
export function communityDaysAround(year: number, month: number, moved: Record<string, string>): Map<string, string> {
  const out = new Map<string, string>()
  for (let k = -1; k <= 1; k++) {
    const d = new Date(year, month - 1 + k, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    out.set(communityDayOf(y, m, moved), monthKey(y, m))
  }
  return out
}
