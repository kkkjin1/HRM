// Belbin 팀 역할(Team Roles) 약식 진단.
// 정식 Belbin SPI(자기인식 7섹션 + 관찰자 평가)는 라이선스 도구라 여기서는
// 워크샵 아이스브레이크 수준의 "약식 자기인식 버전"으로만 쓴다. 결과 해석도
// 개인 성향 라벨링이 아니라 "팀 전체에서 어떤 역할이 두텁고 어디가 비었는가"에 둔다.
// — 이게 Belbin의 원래 취지(개인 진단이 아니라 팀 구성 진단)에도 맞다.

export type BelbinRoleKey =
  | 'plant' | 'resource' | 'coordinator'
  | 'shaper' | 'evaluator' | 'teamworker'
  | 'implementer' | 'finisher' | 'specialist'

export type BelbinCategory = 'thinking' | 'people' | 'action'

export const BELBIN_CATEGORY_LABEL: Record<BelbinCategory, string> = {
  thinking: '사고형',
  people: '관계형',
  action: '실행형',
}

export const BELBIN_CATEGORY_DESC: Record<BelbinCategory, string> = {
  thinking: '무엇을 할지 찾아내고 판단하는 역할',
  people: '사람과 자원을 연결하고 조율하는 역할',
  action: '정해진 것을 실제로 굴러가게 만드는 역할',
}

export type BelbinRole = {
  key: BelbinRoleKey
  name: string
  category: BelbinCategory
  /** 진단 문항 — "나와 얼마나 가까운가" 5점 척도 */
  statement: string
  /** 팀에 기여하는 방식 */
  contribution: string
  /** Belbin의 핵심 개념: 강점과 붙어다니는, 팀이 감수할 만한 약점 */
  allowableWeakness: string
}

export const BELBIN_ROLES: BelbinRole[] = [
  {
    key: 'plant',
    name: '창조자',
    category: 'thinking',
    statement: '남들이 놓친 새로운 접근이나 아이디어를 자주 떠올린다.',
    contribution: '틀을 깨는 발상으로 막힌 문제의 실마리를 만든다.',
    allowableWeakness: '세부사항에 소홀하고, 생각을 설명하는 데 서툴 수 있다.',
  },
  {
    key: 'evaluator',
    name: '냉철한 판단자',
    category: 'thinking',
    statement: '결정 전에 대안을 냉정하게 따져보고 허점을 짚는 편이다.',
    contribution: '감정과 분위기에 휩쓸리지 않고 선택지를 객관적으로 평가한다.',
    allowableWeakness: '추진력이 약하고, 지나치게 비판적으로 보일 수 있다.',
  },
  {
    key: 'specialist',
    name: '전문가',
    category: 'thinking',
    statement: '특정 분야의 깊은 전문지식으로 팀에 기여한다.',
    contribution: '남이 대체하기 어려운 영역의 깊이를 책임진다.',
    allowableWeakness: '관심이 좁고, 기술적 세부에 매몰될 수 있다.',
  },
  {
    key: 'coordinator',
    name: '조정자',
    category: 'people',
    statement: '목표를 정리하고 누가 무엇을 할지 정하는 역할을 자연스럽게 맡는다.',
    contribution: '흩어진 논의를 목표로 수렴시키고 역할을 배분한다.',
    allowableWeakness: '자기 몫까지 위임하는 것처럼 비칠 수 있다.',
  },
  {
    key: 'teamworker',
    name: '조력자',
    category: 'people',
    statement: '팀의 분위기와 사람 사이 관계를 살피고 조율한다.',
    contribution: '갈등을 완화하고 말하지 않는 신호를 알아챈다.',
    allowableWeakness: '결정적인 순간에 우유부단할 수 있다.',
  },
  {
    key: 'resource',
    name: '자원탐색가',
    category: 'people',
    statement: '팀 밖의 사람·정보·기회를 찾아 연결하는 데 능하다.',
    contribution: '외부에서 답을 구해오고 판을 넓힌다.',
    allowableWeakness: '초기 열정이 식기 쉽고, 지나치게 낙관할 수 있다.',
  },
  {
    key: 'shaper',
    name: '추진자',
    category: 'action',
    statement: '일이 지지부진하면 내가 밀어붙여서라도 진도를 낸다.',
    contribution: '압박 속에서도 동력을 만들고 장애물을 밀어낸다.',
    allowableWeakness: '도발적이거나 남의 감정을 상하게 할 수 있다.',
  },
  {
    key: 'implementer',
    name: '실행자',
    category: 'action',
    statement: '정해진 것을 구체적인 절차와 일정으로 만들어 굴러가게 한다.',
    contribution: '말로 끝날 것을 실제 운영 가능한 형태로 바꾼다.',
    allowableWeakness: '유연성이 떨어지고 새로운 가능성에 느리게 반응한다.',
  },
  {
    key: 'finisher',
    name: '완결자',
    category: 'action',
    statement: '마감과 품질을 챙기고, 빠진 것이 없는지 끝까지 확인한다.',
    contribution: '오류를 잡아내고 끝을 맺는다.',
    allowableWeakness: '과하게 걱정하고 위임을 꺼릴 수 있다.',
  },
]

export const BELBIN_SCALE: { value: number; label: string }[] = [
  { value: 1, label: '전혀 아니다' },
  { value: 2, label: '별로' },
  { value: 3, label: '보통' },
  { value: 4, label: '그렇다' },
  { value: 5, label: '매우 그렇다' },
]

export type BelbinScores = Partial<Record<BelbinRoleKey, number>>

/** 개인 결과: 점수 높은 순. 동점이면 정의된 순서를 유지한다. */
export function topRoles(scores: BelbinScores, n = 3): BelbinRole[] {
  return BELBIN_ROLES
    .map(r => ({ role: r, score: scores[r.key] ?? 0 }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(x => x.role)
}

export type RoleCoverage = {
  role: BelbinRole
  /** 팀에서 이 역할 점수가 가장 높은 사람의 점수 — 역할이 커버되는지는 '가장 강한 한 명'이 좌우한다 */
  best: number
  bestMemberIds: string[]
  /** 팀 평균 — 여러 명이 함께 받치는지 확인용 */
  avg: number
  level: 'strong' | 'ok' | 'gap'
}

/**
 * 팀 커버리지. Belbin의 핵심은 "모두가 모든 역할을 잘할 필요는 없고,
 * 팀 안에 그 역할이 있으면 된다"는 것이라 평균이 아니라 최고점으로 판정한다.
 */
export function teamCoverage(all: { memberId: string; scores: BelbinScores }[]): RoleCoverage[] {
  return BELBIN_ROLES.map(role => {
    const entries = all
      .map(a => ({ memberId: a.memberId, score: a.scores[role.key] ?? 0 }))
      .filter(e => e.score > 0)
    const best = entries.reduce((mx, e) => Math.max(mx, e.score), 0)
    const avg = entries.length ? entries.reduce((s, e) => s + e.score, 0) / entries.length : 0
    return {
      role,
      best,
      bestMemberIds: entries.filter(e => e.score === best && best > 0).map(e => e.memberId),
      avg,
      level: best >= 4 ? 'strong' : best === 3 ? 'ok' : 'gap',
    }
  })
}

export function categoryBalance(coverage: RoleCoverage[]) {
  const cats: BelbinCategory[] = ['thinking', 'people', 'action']
  return cats.map(cat => {
    const rows = coverage.filter(c => c.role.category === cat)
    const score = rows.reduce((s, r) => s + r.best, 0) / (rows.length || 1)
    return { category: cat, score, gaps: rows.filter(r => r.level === 'gap').map(r => r.role) }
  })
}
