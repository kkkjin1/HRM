// 결과는 서버에서 하루 1회 확정되어 팀 전체가 동일하게 보지만, "재미"를 위해
// 각자의 PC에서는 애니메이션(룰렛/사다리타기)을 한 번씩 직접 재생해볼 수 있게 한다.
// 이 값은 그 PC가 이미 재생했는지만 기록하는 로컬 상태라, 결과 자체에는 영향이 없다.
function key(feature: string, date: string) {
  return `fun_watched_${feature}_${date}`
}

export function hasWatched(feature: string, date: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(key(feature, date)) === '1'
  } catch {
    return false
  }
}

export function markWatched(feature: string, date: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key(feature, date), '1')
  } catch {
    // localStorage 접근 불가(시크릿 모드 등)는 조용히 무시 — 매번 다시 볼 수 있는 정도의 불편함일 뿐.
  }
}
