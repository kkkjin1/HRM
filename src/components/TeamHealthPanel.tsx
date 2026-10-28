'use client'

// 팀 건강도 진단 (Lencioni 약식) — 2026-2H에 "익명"으로 안내하고 모은 응답의 집계만 보여 준다(읽기 전용).
// U2부터 새 건강도 응답은 실명 팀 진단(R0·정기 진단)에서 받는다. 익명 자료는 덮어쓰지 않고 작성자 없이 집계로만 읽는다.
// 화면 설계의 핵심: 점수를 나열하지 않고 "어느 층부터 손봐야 하는가" 하나를 지목한다.
// 5개 층이 누적 구조라 토대가 흔들리면 위층 개선은 효과가 없다는 게 이 모델의 주장이라서다.

import { useEffect, useState } from 'react'
import { useAllMembers } from '@/lib/useMembers'
import {
  HEALTH_LAYERS, HEALTH_THRESHOLD,
  layerScoresFromSummary, firstBrokenLayer, overallScore, interpretHealth,
  type HealthPeriodSummary,
} from '@/lib/teamHealth'
import { fetchHealthSummaries } from '@/lib/teamSummaries'

function barColor(score: number) {
  if (score === 0) return 'bg-[#E5E8EB]'
  if (score < 3) return 'bg-[#E8837A]'
  if (score < HEALTH_THRESHOLD) return 'bg-[#E8B84B]'
  return 'bg-[#4C7FE0]'
}

export default function TeamHealthPanel() {
  const { loaded: membersLoaded } = useAllMembers()
  const [summaries, setSummaries] = useState<HealthPeriodSummary[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    fetchHealthSummaries().then(rows => {
      if (!active) return
      setSummaries(rows ?? [])
      setLoadFailed(rows === null)
      setLoaded(true)
    })
    return () => { active = false }
  }, [])

  // 응답을 더 받지 않으므로 "지금 기간"이 아니라 마지막으로 모은 기간을 보여 준다.
  const period = summaries.map(s => s.period).sort().reverse()[0] ?? null

  const thisSummary = summaries.find(s => s.period === period)
  // 응답 인원만 받는다(누가 응답했는지는 받지 않음). fix_legacy_health_summary.sql 적용 전 응답 모양은 목록 길이로만 센다.
  const legacyIds = (thisSummary as { respondent_ids?: unknown[] } | undefined)?.respondent_ids
  const answeredCount = Number(thisSummary?.n ?? legacyIds?.length ?? 0)
  const scores = layerScoresFromSummary(thisSummary?.items ?? {})
  const broken = firstBrokenLayer(scores)
  const overall = overallScore(scores)
  const weakestLayer = [...scores].filter(s => s.responses > 0).sort((a, b) => a.score - b.score)[0] ?? null
  const interpretation = answeredCount > 0 ? interpretHealth(scores) : null

  // 직전 기간과 비교
  const prevPeriods = summaries.map(s => s.period).filter(p => p !== period).sort().reverse()
  const prevPeriod = prevPeriods[0] ?? null
  const prevScores = prevPeriod
    ? layerScoresFromSummary(summaries.find(s => s.period === prevPeriod)?.items ?? {})
    : null


  if (!loaded || !membersLoaded) {
    return <div className="bg-white rounded-xl border border-[#EEF0F2] p-5"><p className="text-[13px] text-[#B0B8C1]">불러오는 중...</p></div>
  }

  return (
    <div className="bg-white rounded-xl border border-[#EEF0F2] p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <p className="text-[13px] font-semibold text-[#1F2933]">팀 건강도 <span className="text-[11px] font-medium text-[#7A8491] bg-[#F0F2F5] rounded-full px-2 py-0.5 ml-1 align-middle">이전 익명 응답 · 집계만</span></p>
          <p className="text-[11.5px] text-[#B0B8C1] mt-0.5">
            Lencioni 5단계 약식 · {period ?? '응답 없음'} · {answeredCount}명 응답 · 새 응답은 팀 진단에서 실명으로 받습니다
          </p>
          {loadFailed && <p className="text-[12px] text-red-500 mt-1">팀 건강도 결과를 불러오지 못했습니다. 새로고침해 주세요.</p>}
        </div>
      </div>

      <p className="text-[12px] text-[#7A8491] leading-relaxed mb-4">
        익명으로 모은 응답이라 개별 응답은 <b>누구에게도 보이지 않고</b> 집계만 표시됩니다.
        5개 층은 쌓이는 구조라, 아래가 흔들리면 위층을 손봐도 잘 안 됩니다.
      </p>

      {answeredCount === 0 ? (
        <p className="text-[12.5px] text-[#B0B8C1] py-6 text-center bg-[#FAFBFB] rounded-lg">
          아직 이번 기간 응답이 없습니다.
        </p>
      ) : (
        <>
          {/* 피라미드 — 위층부터 그린다 */}
          <div className="space-y-1.5 mb-4">
            {[...scores].sort((a, b) => b.layer.level - a.layer.level).map(s => {
              const prev = prevScores?.find(p => p.layer.key === s.layer.key)
              const delta = prev && prev.responses > 0 ? s.score - prev.score : null
              const isBroken = broken?.layer.key === s.layer.key
              return (
                <div
                  key={s.layer.key}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${isBroken ? 'bg-[#FBEAF0] ring-1 ring-[#E8837A]/40' : ''}`}
                  style={{ marginLeft: `${(5 - s.layer.level) * 14}px` }}
                >
                  <span className="text-[10.5px] text-[#B0B8C1] w-3 flex-shrink-0">{s.layer.level}</span>
                  <span className="text-[12.5px] text-[#3A4249] w-[72px] flex-shrink-0">{s.layer.name}</span>
                  <div className="flex-1 h-2.5 bg-[#F0F2F5] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${barColor(s.score)}`} style={{ width: `${(s.score / 5) * 100}%`, transition: 'width .35s' }} />
                  </div>
                  <span className="text-[11.5px] text-[#3A4249] w-8 text-right flex-shrink-0">{s.score.toFixed(1)}</span>
                  {delta !== null && Math.abs(delta) >= 0.1 && (
                    <span className={`text-[10.5px] w-9 text-right flex-shrink-0 ${delta > 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                      {delta > 0 ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex items-center gap-3 text-[11.5px] text-[#7A8491] mb-4">
            <span>종합 <b className="text-[#1F2933] text-[13px]">{overall.toFixed(1)}</b> / 5.0</span>
            {prevPeriod && <span className="text-[#B0B8C1]">직전 {prevPeriod} 대비 변화 표시</span>}
          </div>

          {/* 처방 — 이 도구의 결론 */}
          {broken ? (
            <div className="bg-[#FAFBFB] rounded-lg px-4 py-3.5">
              <p className="text-[11.5px] font-semibold text-[#4B1528] mb-1">
                먼저 손볼 곳 · {broken.layer.level}층 {broken.layer.name} ({broken.score.toFixed(1)})
              </p>
              <p className="text-[12.5px] text-[#3A4249] leading-relaxed mb-2">
                더 낮은 점수의 층이 위에 있더라도, <b>아래에서 처음 무너진 층</b>이 여기입니다.
                토대가 흔들리는 상태에서 위층을 손보면 효과가 나지 않습니다.
              </p>
              <p className="text-[12px] text-[#7A8491] leading-relaxed mb-1">
                <b className="text-[#3A4249]">지금 나타나는 신호</b> · {broken.layer.symptom}
              </p>
              <p className="text-[12px] text-[#7A8491] leading-relaxed">
                <b className="text-[#3A4249]">개입</b> · {broken.layer.intervention}
              </p>
            </div>
          ) : (
            <div className="bg-[#FAFBFB] rounded-lg px-4 py-3.5">
              <p className="text-[11.5px] font-semibold text-[#1F2933] mb-1">5개 층 모두 기준선({HEALTH_THRESHOLD}) 이상</p>
              <p className="text-[12.5px] text-[#3A4249] leading-relaxed">
                구조적으로 무너진 층은 없습니다.
                {weakestLayer && <> 점수가 가장 낮은 층은 <b>{weakestLayer.layer.name}({weakestLayer.score.toFixed(1)})</b>입니다. 다음 반기 개선 목표로 삼아보세요.</>}
              </p>
            </div>
          )}

          {/* 상세 해석 */}
          {interpretation && (
            <details className="mt-3 group" open>
              <summary className="text-[11.5px] font-medium text-[#4C7FE0] cursor-pointer hover:text-[#3A6CC8] list-none flex items-center gap-1">
                <span className="group-open:hidden">▶ 상세 해석 보기</span>
                <span className="hidden group-open:inline">▼ 상세 해석 접기</span>
              </summary>
              <div className="mt-3 space-y-3 border-t border-[#EEF0F2] pt-3">
                {/* 총평 */}
                <p className="text-[12.5px] text-[#1F2933] font-medium leading-relaxed">{interpretation.overviewLine}</p>

                {/* 강점 */}
                {interpretation.strengthPara && (
                  <div className="bg-[#F0F9F4] rounded-lg px-3.5 py-2.5">
                    <p className="text-[10.5px] font-semibold text-[#059669] mb-0.5">강점</p>
                    <p className="text-[12px] text-[#3A4249] leading-relaxed">{interpretation.strengthPara}</p>
                  </div>
                )}

                {/* 첫 번째 균열 */}
                {interpretation.brokenPara && (
                  <div className="bg-[#FEF2F2] rounded-lg px-3.5 py-2.5">
                    <p className="text-[10.5px] font-semibold text-[#DC2626] mb-0.5">첫 번째 균열</p>
                    <p className="text-[12px] text-[#3A4249] leading-relaxed">{interpretation.brokenPara}</p>
                  </div>
                )}

                {/* 연쇄 영향 */}
                {interpretation.chainPara && (
                  <div className="bg-[#FFFBEB] rounded-lg px-3.5 py-2.5">
                    <p className="text-[10.5px] font-semibold text-[#B45309] mb-0.5">연쇄 영향</p>
                    <p className="text-[12px] text-[#3A4249] leading-relaxed">{interpretation.chainPara}</p>
                  </div>
                )}

                {/* 다음 행동 */}
                <div className="bg-[#EEF1FE] rounded-lg px-3.5 py-2.5">
                  <p className="text-[10.5px] font-semibold text-[#3A5BC7] mb-0.5">다음 행동</p>
                  <p className="text-[12px] text-[#3A4249] leading-relaxed">{interpretation.actionPara}</p>
                </div>
              </div>
            </details>
          )}
        </>
      )}

      {/* 층별 설명 */}
      <details className="mt-3">
        <summary className="text-[11.5px] text-[#7A8491] cursor-pointer hover:text-[#4C7FE0]">5개 층이 뭔지 보기</summary>
        <ul className="mt-2 space-y-1.5">
          {[...HEALTH_LAYERS].sort((a, b) => b.level - a.level).map(l => (
            <li key={l.key} className="text-[12px] text-[#7A8491] leading-relaxed">
              <b className="text-[#3A4249]">{l.level}. {l.name}</b> — 무너지면 “{l.dysfunction}”. {l.symptom}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
