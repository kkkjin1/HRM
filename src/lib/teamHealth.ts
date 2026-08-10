// 팀 건강도 진단 — Lencioni <팀이 빠지기 쉬운 5가지 함정> 기반 약식.
//
// 이 모델의 핵심은 5개 층이 '독립 항목'이 아니라 '누적 구조'라는 것이다.
// 신뢰가 없으면 건강한 갈등이 불가능하고, 갈등이 없으면 진짜 헌신이 안 나온다.
// 따라서 개선 지점은 '점수가 가장 낮은 층'이 아니라
// '아래에서부터 올라오며 처음으로 무너진 층'이다 — 그 위를 아무리 손봐도 안 된다.

export type HealthLayerKey = 'trust' | 'conflict' | 'commitment' | 'accountability' | 'results'

export type HealthLayer = {
  key: HealthLayerKey
  /** 1이 토대. 숫자가 클수록 위층 */
  level: number
  name: string
  dysfunction: string
  /** 이 층이 무너졌을 때 팀에서 실제로 보이는 신호 */
  symptom: string
  /** 이 층을 올리기 위한 개입 */
  intervention: string
}

export const HEALTH_LAYERS: HealthLayer[] = [
  {
    key: 'trust', level: 1, name: '신뢰',
    dysfunction: '신뢰의 결여',
    symptom: '약점·실수·도움 요청을 숨긴다. 회의에서 모르는 걸 모른다고 못 한다.',
    intervention: '리더가 먼저 취약성을 드러내기. 실패 공유를 정례화하고, 질문을 성과로 인정하기.',
  },
  {
    key: 'conflict', level: 2, name: '건강한 갈등',
    dysfunction: '갈등에 대한 두려움',
    symptom: '회의는 조용한데 끝나고 딴말이 나온다. 껄끄러운 주제는 안 꺼낸다.',
    intervention: '반대 의견을 배정해서 말하게 하기(devil’s advocate). "이견 없으면 결정 안 함" 규칙.',
  },
  {
    key: 'commitment', level: 3, name: '헌신',
    dysfunction: '헌신의 결여',
    symptom: '결정이 났는데 사람마다 이해가 다르다. 속으로 동의 안 한 채 넘어간다.',
    intervention: '회의 끝에 결정사항·담당·기한을 소리 내어 복창하고 문서로 남기기.',
  },
  {
    key: 'accountability', level: 4, name: '상호 책임',
    dysfunction: '책임 회피',
    symptom: '기준 미달을 봐도 서로 안 짚는다. 지적은 팀장 몫이라고 여긴다.',
    intervention: '팀 기준을 눈에 보이게 공개하고, 동료 간 진척 점검을 짧게 정례화하기.',
  },
  {
    key: 'results', level: 5, name: '결과 몰입',
    dysfunction: '결과에 대한 무관심',
    symptom: '개인 성과·자기 업무만 챙긴다. 팀 지표가 나빠도 남 일 같다.',
    intervention: '팀 단위 지표를 공개하고, 개인 인정보다 팀 성과를 먼저 언급하기.',
  },
]

export type HealthItem = {
  id: string
  layer: HealthLayerKey
  text: string
  /** 역채점 문항 — 동의할수록 건강도가 낮다 */
  reverse?: boolean
}

/** 층당 2문항. 한 문항은 순채점, 한 문항은 역채점으로 두어 무조건 동의하는 응답 편향을 줄인다. */
export const HEALTH_ITEMS: HealthItem[] = [
  { id: 't1', layer: 'trust', text: '이 팀에서는 내 실수나 부족함을 인정해도 불이익이 없다.' },
  { id: 't2', layer: 'trust', text: '도움이 필요할 때 동료에게 요청하기가 어렵다.', reverse: true },

  { id: 'c1', layer: 'conflict', text: '의견이 다를 때 회의에서 솔직하게 말한다.' },
  { id: 'c2', layer: 'conflict', text: '껄끄러운 주제는 회의에서 다루지 않고 넘어가는 편이다.', reverse: true },

  { id: 'm1', layer: 'commitment', text: '회의가 끝나면 무엇을 하기로 했는지 모두가 같게 이해한다.' },
  { id: 'm2', layer: 'commitment', text: '결정이 나도 속으로는 동의하지 않은 채 넘어가는 경우가 있다.', reverse: true },

  { id: 'a1', layer: 'accountability', text: '동료의 일이 기준에 못 미치면 서로 편하게 짚어준다.' },
  { id: 'a2', layer: 'accountability', text: '일정이나 품질이 밀려도 서로 언급하지 않고 지나간다.', reverse: true },

  { id: 'r1', layer: 'results', text: '개인 성과보다 팀 전체 결과를 우선해서 판단한다.' },
  { id: 'r2', layer: 'results', text: '각자 자기 업무만 챙기면 된다는 분위기가 있다.', reverse: true },
]

export const HEALTH_SCALE = [
  { value: 1, label: '전혀 아니다' },
  { value: 2, label: '별로' },
  { value: 3, label: '보통' },
  { value: 4, label: '그렇다' },
  { value: 5, label: '매우 그렇다' },
]

export type HealthAnswers = Record<string, number>

/** 역채점을 반영한 실제 점수(1~5, 클수록 건강함) */
export function itemScore(item: HealthItem, raw: number) {
  return item.reverse ? 6 - raw : raw
}

export type LayerScore = { layer: HealthLayer; score: number; responses: number }

export function layerScores(allAnswers: HealthAnswers[]): LayerScore[] {
  return HEALTH_LAYERS.map(layer => {
    const items = HEALTH_ITEMS.filter(i => i.layer === layer.key)
    const vals: number[] = []
    for (const answers of allAnswers) {
      for (const item of items) {
        const raw = answers[item.id]
        if (typeof raw === 'number' && raw > 0) vals.push(itemScore(item, raw))
      }
    }
    return {
      layer,
      score: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0,
      responses: vals.length,
    }
  })
}

/** 건강하다고 볼 최소선. 이 아래면 '무너진 층'으로 본다. */
export const HEALTH_THRESHOLD = 3.5

/**
 * Lencioni 모델의 핵심 판정 — 최저점 층이 아니라 '아래에서부터 처음 무너진 층'.
 * 토대가 흔들리는데 위층을 손보는 건 효과가 없다는 것이 이 모델의 주장이다.
 */
export function firstBrokenLayer(scores: LayerScore[]): LayerScore | null {
  const scored = scores.filter(s => s.responses > 0).sort((a, b) => a.layer.level - b.layer.level)
  return scored.find(s => s.score < HEALTH_THRESHOLD) ?? null
}

export function overallScore(scores: LayerScore[]) {
  const valid = scores.filter(s => s.responses > 0)
  return valid.length ? valid.reduce((s, v) => s + v.score, 0) / valid.length : 0
}

/** 2026-1H 형태. 반기별로 다시 진단해 추이를 본다. */
export function currentPeriod(today: Date) {
  return `${today.getFullYear()}-${today.getMonth() < 6 ? '1H' : '2H'}`
}
