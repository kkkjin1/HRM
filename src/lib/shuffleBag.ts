// 셔플백(shuffle bag): 도메인(후보 목록) 전체가 한 번씩 다 나오기 전엔 같은 항목이
// 재등장하지 않도록 날짜 기반으로 순서를 결정한다.
//
// domainKey별로 후보 전체(0..size-1)의 순서를 한 번만 섞어서 고정하고, 그 순서를
// 날짜 인덱스 % size로 순환시킨다(재셔플 없음). 이렇게 하면 시작점이 어디든 상관없이
// "연속된 size일짜리 구간"에는 항상 전체 후보가 정확히 한 번씩만 들어간다 — 사이클
// 경계마다 순서를 새로 섞는 방식은 경계에 걸친 구간에서 두 개의 독립된 순서가 섞여
// 재등장 확률이 오히려 높아지는 문제가 있어 이 방식을 쓰지 않는다.
// 트레이드오프: size일이 지나면 같은 순서가 그대로 반복된다(도메인 자체가 매번 다시
// 섞이진 않음). "최근에 봤던 게 또 나온다"는 체감 중복은 없어지지만, 수개월~수년 뒤
// 아주 긴 안목으로 보면 로테이션 패턴 자체는 고정이다.

function hashSeed(key: string): number {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0
  return hash >>> 0
}

// Mulberry32 — 시드 하나로 재현 가능한 의사난수 생성기.
function seededRandom(seed: number) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffledIndices(domainKey: string, size: number): number[] {
  const indices = Array.from({ length: size }, (_, i) => i)
  const rand = seededRandom(hashSeed(domainKey))
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }
  return indices
}

// dateStr('YYYY-MM-DD') 기준 1970-01-01부터의 날짜 일수.
export function dayIndexOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}

// domainKey: 후보 목록을 구분하는 이름(목록이 달라지면 셔플도 완전히 달라진다).
// size: 후보 개수. dateStr: 서버 오늘 날짜.
// 반환값: 오늘 뽑을 후보의 인덱스(0..size-1). 연속된 size일 구간에는 항상 후보
// 전체가 정확히 한 번씩만 등장한다(구간 시작점과 무관하게 보장됨).
export function shuffleBagIndex(domainKey: string, size: number, dateStr: string): number {
  if (size <= 0) return 0
  const order = shuffledIndices(domainKey, size)
  const position = ((dayIndexOf(dateStr) % size) + size) % size
  return order[position]
}

// 클라이언트 세션 안에서 반복 추첨할 때(예: 버튼 눌러 다시 뽑기) 쓰는 셔플백.
// 목록 전체를 소진하기 전엔 같은 항목을 다시 주지 않는다. 날짜와 무관하게
// Math.random()으로 섞으므로 매 세션(새로고침)마다 순서가 달라진다.
export function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
