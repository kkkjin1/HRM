// 조하리 창(Johari Window, Luft & Ingham) 약식.
// 원본은 성격 형용사 56개를 쓰지만, 여기서는 업무 맥락에 맞는 강점 형용사로 교체했다.
// (일터에서 성격 라벨링은 방어를 부르고, 행동 기반 어휘라야 피드백으로 이어진다.)
//
// 핵심은 '맹점' 사분면이다 — 나는 인식하지 못하는데 동료들은 보고 있는 강점.
// 워크샵에서 가장 반응이 큰 지점이고, 이 팀에서는 이미 쌓인 "동료가 본 나"와 이어진다.

export type JohariTrait = { key: string; label: string; group: string }

export const JOHARI_TRAITS: JohariTrait[] = [
  // 사고·판단
  { key: 'analytic', label: '분석적인', group: '사고·판단' },
  { key: 'insightful', label: '통찰력 있는', group: '사고·판단' },
  { key: 'logical', label: '논리적인', group: '사고·판단' },
  { key: 'creative', label: '창의적인', group: '사고·판단' },
  { key: 'curious', label: '호기심 많은', group: '사고·판단' },
  { key: 'prudent', label: '신중한', group: '사고·판단' },
  { key: 'strategic', label: '전략적인', group: '사고·판단' },

  // 실행
  { key: 'driving', label: '추진력 있는', group: '실행' },
  { key: 'meticulous', label: '꼼꼼한', group: '실행' },
  { key: 'accountable', label: '책임감 있는', group: '실행' },
  { key: 'diligent', label: '성실한', group: '실행' },
  { key: 'flexible', label: '유연한', group: '실행' },
  { key: 'composed', label: '침착한', group: '실행' },
  { key: 'persistent', label: '끈기 있는', group: '실행' },

  // 관계
  { key: 'considerate', label: '배려하는', group: '관계' },
  { key: 'listener', label: '잘 듣는', group: '관계' },
  { key: 'humorous', label: '유머 있는', group: '관계' },
  { key: 'candid', label: '솔직한', group: '관계' },
  { key: 'warm', label: '다정한', group: '관계' },
  { key: 'inclusive', label: '포용력 있는', group: '관계' },
  { key: 'cooperative', label: '협조적인', group: '관계' },

  // 소통·영향
  { key: 'persuasive', label: '설득력 있는', group: '소통·영향' },
  { key: 'articulate', label: '표현이 명확한', group: '소통·영향' },
  { key: 'questioning', label: '질문을 잘하는', group: '소통·영향' },
  { key: 'feedback', label: '피드백을 잘하는', group: '소통·영향' },
  { key: 'connecting', label: '사람을 잘 연결하는', group: '소통·영향' },

  // 태도
  { key: 'humble', label: '겸손한', group: '태도' },
  { key: 'confident', label: '자신감 있는', group: '태도' },
  { key: 'passionate', label: '열정적인', group: '태도' },
  { key: 'optimistic', label: '낙천적인', group: '태도' },
  { key: 'learning', label: '배우려는', group: '태도' },
]

export const JOHARI_GROUPS = ['사고·판단', '실행', '관계', '소통·영향', '태도']

/** 워크샵 표준과 동일하게 5~6개를 권장하되, 강제는 최소 3개까지만 완화한다. */
export const JOHARI_MIN = 3
export const JOHARI_MAX = 6

export function traitLabel(key: string) {
  return JOHARI_TRAITS.find(t => t.key === key)?.label ?? key
}

export type JohariQuadrants = {
  /** 열린 창 — 나도 알고 남도 안다 */
  open: { key: string; peerCount: number }[]
  /** 맹점 — 나는 모르는데 남은 본다 (가장 가치 있는 사분면) */
  blind: { key: string; peerCount: number }[]
  /** 숨겨진 창 — 나는 아는데 남은 아직 못 봤다 */
  hidden: string[]
  /** 미지의 창 — 아무도 고르지 않음 (개수만 쓴다) */
  unknownCount: number
}

export function computeJohari(self: string[], peerPickLists: string[][]): JohariQuadrants {
  const selfSet = new Set(self)
  const peerCount = new Map<string, number>()
  for (const list of peerPickLists) {
    for (const k of new Set(list)) peerCount.set(k, (peerCount.get(k) ?? 0) + 1)
  }

  const open: { key: string; peerCount: number }[] = []
  const blind: { key: string; peerCount: number }[] = []

  for (const [key, count] of peerCount) {
    if (selfSet.has(key)) open.push({ key, peerCount: count })
    else blind.push({ key, peerCount: count })
  }
  open.sort((a, b) => b.peerCount - a.peerCount)
  blind.sort((a, b) => b.peerCount - a.peerCount)

  const hidden = self.filter(k => !peerCount.has(k))
  const known = new Set([...selfSet, ...peerCount.keys()])

  return { open, blind, hidden, unknownCount: JOHARI_TRAITS.length - known.size }
}
