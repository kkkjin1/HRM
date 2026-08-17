// DISC 팀 성향 진단 — 워크샵/팀빌딩에서 쓰는 약식 자기인식 버전.
// 결과는 라벨링이 아니라 "팀에서 어떤 에너지가 두텁고, 누구와 어떻게 협력하면 좋은가"에 둔다.

export type DiscType = 'D' | 'I' | 'S' | 'C'

export const DISC_TYPE_INFO: Record<DiscType, {
  name: string
  keyword: string
  color: string
  bg: string
  border: string
  description: string
  strengths: string[]
  growthEdge: string
}> = {
  D: {
    name: '주도형',
    keyword: 'D',
    color: '#DC2626',
    bg: '#FEF2F2',
    border: '#FECACA',
    description: '결과를 향해 직접적으로 움직입니다. 장애물이 있어도 뚫고 나가는 추진력이 강점입니다.',
    strengths: ['빠른 결단', '도전 정신', '목표 집중력'],
    growthEdge: '속도보다 공감이 필요한 순간을 챙기면 더 강해집니다.',
  },
  I: {
    name: '사교형',
    keyword: 'I',
    color: '#D97706',
    bg: '#FFFBEB',
    border: '#FDE68A',
    description: '사람 사이를 밝게 연결합니다. 설득력과 에너지로 팀 분위기를 끌어올리는 역할입니다.',
    strengths: ['관계 구축', '설득력', '긍정 에너지'],
    growthEdge: '아이디어를 실행으로 이어주는 마무리 습관이 강점을 완성합니다.',
  },
  S: {
    name: '안정형',
    keyword: 'S',
    color: '#059669',
    bg: '#ECFDF5',
    border: '#A7F3D0',
    description: '팀의 신뢰 기반을 만듭니다. 꾸준히 지원하고 갈등을 부드럽게 풀어내는 역할입니다.',
    strengths: ['신뢰성', '인내심', '팀 조율'],
    growthEdge: '변화가 필요한 순간 먼저 목소리를 내면 팀이 더 빨리 움직입니다.',
  },
  C: {
    name: '신중형',
    keyword: 'C',
    color: '#2563EB',
    bg: '#EFF6FF',
    border: '#BFDBFE',
    description: '품질과 정확성을 지킵니다. 꼼꼼한 분석으로 팀이 실수를 줄이도록 돕습니다.',
    strengths: ['분석력', '정확성', '체계적 사고'],
    growthEdge: '완벽하지 않아도 공유할 수 있음을 믿으면 속도가 붙습니다.',
  },
}

export type DiscQuestion = {
  id: string
  type: DiscType
  statement: string
}

export const DISC_QUESTIONS: DiscQuestion[] = [
  // D — 주도형
  { id: 'D1', type: 'D', statement: '목표를 정하면 장애물이 있어도 끝까지 밀어붙이는 편이다.' },
  { id: 'D2', type: 'D', statement: '문제가 생기면 내가 먼저 나서서 해결책을 찾는다.' },
  { id: 'D3', type: 'D', statement: '빠른 결정이 필요할 때 머뭇거리지 않고 바로 결단을 내린다.' },
  { id: 'D4', type: 'D', statement: '경쟁 상황에서 오히려 동기부여가 올라간다.' },
  { id: 'D5', type: 'D', statement: '결과를 얻기 위해서라면 직접적으로 말하는 것을 두려워하지 않는다.' },
  // I — 사교형
  { id: 'I1', type: 'I', statement: '처음 만나는 사람과도 금방 편하게 이야기할 수 있다.' },
  { id: 'I2', type: 'I', statement: '팀 분위기를 밝게 만드는 역할을 자주 맡는다.' },
  { id: 'I3', type: 'I', statement: '아이디어를 발표하거나 사람들 앞에 서는 것이 즐겁다.' },
  { id: 'I4', type: 'I', statement: '사람들의 감정 상태를 빠르게 파악하고 반응한다.' },
  { id: 'I5', type: 'I', statement: '설득하거나 동기를 부여하는 상황에서 에너지가 난다.' },
  // S — 안정형
  { id: 'S1', type: 'S', statement: '한 가지 일을 오랫동안 꾸준히 하는 것이 즐겁다.' },
  { id: 'S2', type: 'S', statement: '팀 내 갈등 상황에서 중재자 역할을 자연스럽게 맡는다.' },
  { id: 'S3', type: 'S', statement: '갑작스러운 변화보다는 예측 가능한 환경이 더 편하다.' },
  { id: 'S4', type: 'S', statement: '맡은 일은 끝까지 신뢰할 수 있게 처리하려 노력한다.' },
  { id: 'S5', type: 'S', statement: '동료가 힘들 때 옆에서 지원해주고 싶다는 생각이 든다.' },
  // C — 신중형
  { id: 'C1', type: 'C', statement: '결정 전에 충분한 데이터와 근거를 수집하는 편이다.' },
  { id: 'C2', type: 'C', statement: '실수를 줄이기 위해 일을 꼼꼼하게 검토한다.' },
  { id: 'C3', type: 'C', statement: '규칙이나 절차가 있으면 그것을 따르는 것이 편하다.' },
  { id: 'C4', type: 'C', statement: '품질과 정확성이 속도보다 더 중요하다고 생각한다.' },
  { id: 'C5', type: 'C', statement: '계획 없이 즉흥적으로 일을 처리하는 것이 불편하다.' },
]

export const DISC_SCALE: { value: number; label: string }[] = [
  { value: 1, label: '전혀 아니다' },
  { value: 2, label: '별로' },
  { value: 3, label: '보통' },
  { value: 4, label: '그렇다' },
  { value: 5, label: '매우 그렇다' },
]

export type DiscScores = Record<DiscType, number>

export function calcDiscScores(answers: Record<string, number>): DiscScores {
  const scores: DiscScores = { D: 0, I: 0, S: 0, C: 0 }
  for (const q of DISC_QUESTIONS) {
    scores[q.type] += answers[q.id] ?? 0
  }
  return scores
}

export function primaryType(scores: DiscScores): DiscType {
  return (['D', 'I', 'S', 'C'] as DiscType[]).reduce((best, t) => scores[t] > scores[best] ? t : best)
}

export function secondaryType(scores: DiscScores): DiscType | null {
  const sorted = (['D', 'I', 'S', 'C'] as DiscType[]).sort((a, b) => scores[b] - scores[a])
  const top = scores[sorted[0]]
  const second = scores[sorted[1]]
  // 2위 점수가 1위의 85% 이상이면 부유형으로 표시
  return second >= top * 0.85 ? sorted[1] : null
}

type CompatibilityInfo = {
  emoji: string
  label: string
  description: string
}

const COMPAT_MAP: Record<string, CompatibilityInfo> = {
  'D-D': { emoji: '⚡', label: '에너지 충돌 주의', description: '둘 다 추진력이 강합니다. 방향이 같으면 최강, 다르면 정면충돌 — 역할을 명확히 나누면 시너지가 납니다.' },
  'D-I': { emoji: '🚀', label: '추진력 + 관계력', description: 'D의 결단력과 I의 설득력이 만나면 빠르게 움직이면서 사람도 함께 끌고 갑니다.' },
  'D-S': { emoji: '⚖️', label: '속도 vs 안정', description: 'D는 빠르게, S는 착실하게 — 서로의 속도 차이를 이해하면 탄탄한 실행 팀이 됩니다.' },
  'D-C': { emoji: '🔍', label: '결과 vs 과정', description: 'D는 목표를 향해, C는 품질을 지키며 — 긴장감이 서로의 맹점을 채워 줍니다.' },
  'I-I': { emoji: '🎉', label: '활기찬 조합', description: '에너지와 관계력이 두 배. 분위기는 최고지만 실행과 마감은 함께 챙겨야 합니다.' },
  'I-S': { emoji: '💛', label: '자연스러운 파트너', description: 'I가 앞에서 연결하고, S가 뒤에서 지탱합니다. 가장 자연스럽게 맞물리는 조합입니다.' },
  'I-C': { emoji: '🤝', label: '정반대의 상호보완', description: 'I의 감성과 C의 논리가 균형을 이루면 설득력 있으면서도 근거 있는 결론을 냅니다.' },
  'S-S': { emoji: '🛡️', label: '신뢰와 안정의 팀', description: '서로를 가장 잘 배려하는 조합. 변화가 필요한 순간 함께 용기 내는 약속이 힘이 됩니다.' },
  'S-C': { emoji: '🎯', label: '착실하고 정확한 팀', description: '실수 없이 확실하게 마무리하는 팀. 결정 타이밍을 놓치지 않는 것이 이 조합의 과제입니다.' },
  'C-C': { emoji: '📊', label: '완벽주의 조합', description: '분석과 정확성이 두 배. 품질은 보장되지만 결정 속도를 함께 의식적으로 챙겨야 합니다.' },
}

export function compatibility(a: DiscType, b: DiscType): CompatibilityInfo {
  const key = [a, b].sort().join('-') as keyof typeof COMPAT_MAP
  return COMPAT_MAP[key] ?? { emoji: '🤝', label: '균형 조합', description: '서로 다른 강점이 팀을 풍부하게 만듭니다.' }
}
