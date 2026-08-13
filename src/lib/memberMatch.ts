// 인증 계정 이름(user_metadata.name)이나 일정 담당자 이름은 members.name과 완전히
// 같은 문자열이 아닐 수 있어서(성 포함/생략 등), 포함관계까지 확인해 가장 길게
// 겹치는 이름을 고른다. useCurrentMember와 서버 라우트(일정 알림)가 공유한다.
export function bestNameMatch<T extends { name: string }>(name: string, candidates: T[]): T | null {
  const exact = candidates.find(m => m.name === name)
  if (exact) return exact

  const partial = candidates.filter(m => name.includes(m.name) || m.name.includes(name))
  if (partial.length === 0) return null
  return partial.reduce((best, m) => (m.name.length > best.name.length ? m : best))
}
