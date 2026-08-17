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

function scoreLabel(score: number): string {
  if (score >= 4.5) return '매우 강함'
  if (score >= 3.5) return '안정적'
  if (score >= 3.0) return '경계선'
  if (score >= 2.5) return '취약'
  return '심각'
}

export type HealthInterpretation = {
  overviewLine: string       // 한 줄 총평
  strengthPara: string | null  // 최고점 층 강점 설명
  brokenPara: string | null    // 첫 번째 균열 층 상세 분석
  chainPara: string | null     // 위층 연쇄 영향
  actionPara: string           // 다음 행동 제안
}

/** 점수 조합을 보고 자연어 해석을 생성한다. */
export function interpretHealth(scores: LayerScore[]): HealthInterpretation | null {
  const valid = scores.filter(s => s.responses > 0).sort((a, b) => a.layer.level - b.layer.level)
  if (valid.length === 0) return null

  const overall = overallScore(scores)
  const broken = firstBrokenLayer(scores)
  const sorted = [...valid].sort((a, b) => b.score - a.score)
  const highest = sorted[0]
  const lowest = sorted[sorted.length - 1]

  // ── 총평 ──
  let overviewLine: string
  if (overall >= 4.0) {
    overviewLine = `종합 ${overall.toFixed(1)} / 5.0 — 전반적으로 건강한 팀입니다. 세부 층을 보면서 다음 성장 지점을 찾을 수 있는 상태입니다.`
  } else if (overall >= 3.5) {
    overviewLine = broken
      ? `종합 ${overall.toFixed(1)} / 5.0 — 기준선을 넘겼지만 ${broken.layer.name} 층이 균열 지점입니다. 이 하나를 잡으면 전체가 올라갑니다.`
      : `종합 ${overall.toFixed(1)} / 5.0 — 기준선 위에 있습니다. 가장 낮은 ${lowest.layer.name}을 다음 목표로 삼으면 됩니다.`
  } else if (overall >= 3.0) {
    overviewLine = `종합 ${overall.toFixed(1)} / 5.0 — 기준선(3.5) 아래입니다. 구조적으로 손봐야 할 층이 있습니다.`
  } else {
    overviewLine = `종합 ${overall.toFixed(1)} / 5.0 — 여러 층에서 신호가 나오고 있습니다. 토대부터 차례로 점검이 필요합니다.`
  }

  // ── 강점 ──
  let strengthPara: string | null = null
  if (highest.score >= 3.5) {
    const desc: Record<HealthLayerKey, string> = {
      trust: '팀원들이 서로의 실수나 약점을 드러낼 수 있는 심리적 안전감이 갖춰져 있습니다. 나머지 층을 올리는 데 가장 중요한 토대가 있는 셈입니다.',
      conflict: '솔직한 이견이 오가는 문화가 있습니다. 껄끄러운 주제도 회의 테이블 위에서 다뤄지고 있다는 뜻입니다.',
      commitment: '결정이 나면 팀 전체가 같은 이해를 갖고 움직입니다. 실행 단계에서의 혼선이 적습니다.',
      accountability: '동료 간에 기준을 지적하고 요구하는 문화가 있습니다. 팀장이 모든 피드백을 혼자 감당하지 않아도 됩니다.',
      results: '개인보다 팀 전체 성과를 우선하는 마인드가 있습니다. 팀 지표에 모두가 책임감을 느끼는 상태입니다.',
    }
    strengthPara = `최고점은 ${highest.layer.name}(${highest.score.toFixed(1)}, ${scoreLabel(highest.score)})입니다. ${desc[highest.layer.key]}`
  }

  // ── 첫 번째 균열 ──
  let brokenPara: string | null = null
  if (broken) {
    const prevLayer = valid.find(s => s.layer.level === broken.layer.level - 1)
    const prevHealthy = prevLayer && prevLayer.score >= HEALTH_THRESHOLD

    const analysis: Record<HealthLayerKey, string> = {
      trust: '팀원들이 약점이나 실수를 드러내기 어려운 환경입니다. 겉으로는 협력적으로 보여도 실제로는 각자 방어적으로 움직이고 있을 가능성이 있습니다. 이 상태에서는 그 위의 갈등, 헌신, 책임 모두 표면적으로만 작동합니다.',
      conflict: prevHealthy
        ? '신뢰는 쌓였지만 그 위에서 진짜 이견을 꺼내는 단계까지는 아직 안 됐습니다. 회의가 조용하게 끝나는데 끝나고 나서 딴말이 나오거나, 결정에 납득하지 못한 채 넘어가는 일이 있을 수 있습니다.'
        : '신뢰가 낮으니 건강한 갈등이 나오기 어려운 상황입니다. 이견을 꺼냈다가 관계가 틀어질까봐 조용히 넘어가는 패턴이 반복될 수 있습니다.',
      commitment: prevHealthy
        ? '이견은 나오지만 그것이 진짜 합의로 이어지지 않고 있습니다. 결정이 났는데도 사람마다 이해가 다르거나, 속으로 동의하지 않은 채 넘어가는 경우가 있을 수 있습니다.'
        : '갈등 없이 만들어진 결정은 진심으로 따르기 어렵습니다. "어차피 정해진 거"라는 무력감이 생기기 쉬운 상태입니다.',
      accountability: prevHealthy
        ? '결정에는 헌신하지만 서로의 기준을 요구하는 단계가 아직 안 됐습니다. 기준 미달을 봐도 짚어주기가 어색하고, 피드백은 팀장 몫이 되어버립니다.'
        : '각자 진심으로 결정에 동의하지 않으니 서로 기준을 요구하기도 어렵습니다. 지적은 불편한 일, 팀장이 할 일로 남겨집니다.',
      results: prevHealthy
        ? '각자 책임을 지지만 팀 전체 성과로 시선이 넓어지지 않고 있습니다. 개인 업무 완수가 최우선이 되고, 팀 지표가 나빠도 남 일로 느끼는 분위기가 있을 수 있습니다.'
        : '상호 책임이 없으니 팀 전체 결과에 대한 공동 책임감도 생기기 어렵습니다. 각자 자기 몫만 챙기는 것이 합리적으로 느껴지는 상태입니다.',
    }

    brokenPara = `첫 번째 균열은 ${broken.layer.name}(${broken.score.toFixed(1)}, ${scoreLabel(broken.score)})입니다. ${analysis[broken.layer.key]}`
  }

  // ── 연쇄 영향 ──
  let chainPara: string | null = null
  if (broken) {
    const affected = valid.filter(s => s.layer.level > broken.layer.level && s.score < HEALTH_THRESHOLD)
    if (affected.length > 0) {
      const names = affected.map(s => `${s.layer.name}(${s.score.toFixed(1)})`).join(', ')
      chainPara = `${names}도 기준선 아래입니다. ${broken.layer.name}이 잡히지 않은 상태에서 이 층들만 따로 개선하려 해도 효과가 잘 나지 않습니다 — Lencioni 모델의 핵심이 바로 이 누적 구조입니다.`
    }
  }

  // ── 다음 행동 ──
  let actionPara: string
  if (!broken) {
    const weakest = [...valid].sort((a, b) => a.score - b.score)[0]
    actionPara = `무너진 층은 없습니다. 가장 낮은 ${weakest.layer.name}(${weakest.score.toFixed(1)})을 다음 반기 개선 목표로 잡으면 됩니다. ${weakest.layer.intervention}`
  } else {
    actionPara = `${broken.layer.name}부터 손봐야 합니다. ${broken.layer.intervention}`
  }

  return { overviewLine, strengthPara, brokenPara, chainPara, actionPara }
}
