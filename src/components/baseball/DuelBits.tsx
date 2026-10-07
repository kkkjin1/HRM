'use client'

// 대결 화면 조각 — 현재 타자(타순·능력치), 타자 노림 선택, 투수 제구 막대.
// 그림·입력만 담당한다. 판정은 baseball.ts(judgeSwing·resolvePitch), 타순·막대 구간은 baseballDuel.ts.

import type { Ref } from 'react'
import { CATEGORY_LABEL, HEIGHT_LABEL, type HeightBand, type PitchCategory, type ReadGuess } from '@/lib/baseball'
import { GAUGE_PERFECT_SHOW_ERR, PERFECT_ERR, type DuelBatter, type GaugeGrade } from '@/lib/baseballDuel'

function Stars({ n }: { n: number }) {
  return (
    <span className="tracking-[-1px]" aria-label={`${n}/3`}>
      <span className="text-[#E0A526]">{'★'.repeat(n)}</span><span className="text-[#D5DAE0]">{'★'.repeat(3 - n)}</span>
    </span>
  )
}

// 타순·유형 + 작은 능력치 3개. dim이면(공이 날아오는 중) 흐리게 — 타격 중엔 눈에 덜 띄게
export function BatterBadge({ batter, dim = false }: { batter: DuelBatter; dim?: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-[10.5px] leading-none text-[#5B6472] transition-opacity ${dim ? 'opacity-45' : ''}`} data-batter={batter.key}>
      <span className="font-semibold text-[#1F2933] whitespace-nowrap">{batter.order}번 · {batter.label}</span>
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <span>컨택 <Stars n={batter.stars.contact} /></span>
        <span>파워 <Stars n={batter.stars.power} /></span>
        <span title="도루(다음 업데이트)에서 쓰여요" className="opacity-70">스피드 <Stars n={batter.stars.speed} /></span>
      </span>
    </div>
  )
}

const CATS: (PitchCategory | null)[] = [null, 'FAST', 'BREAK', 'DROP']
const BANDS: (HeightBand | null)[] = [null, 'HIGH', 'MID', 'LOW']

function Segmented<T extends string | null>({ label, options, value, onChange, text, locked }: {
  label: string; options: T[]; value: T; onChange: (v: T) => void; text: (v: T) => string; locked: boolean
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-[46px] flex-shrink-0 text-[10px] text-[#7A8491]">{label}</span>
      <div className="inline-flex flex-wrap rounded-lg border border-[#E5E8EB] bg-white/85 p-0.5 gap-0.5" role="radiogroup" aria-label={label}>
        {options.map(o => {
          const on = o === value
          return (
            <button key={o ?? 'none'} type="button" role="radio" aria-checked={on} disabled={locked}
              // 마우스·터치로 눌러도 포커스가 남지 않게 — 포커스가 남으면 Space(스윙)가 이 버튼을 누를 수 있다
              onMouseDown={e => e.preventDefault()}
              onClick={() => onChange(o)}
              className={`min-h-[26px] rounded-md px-2 text-[11px] whitespace-nowrap transition-colors ${
                on ? (o === null ? 'bg-[#EEF0F2] text-[#3A4249] font-medium' : 'bg-[#1F2933] text-white font-semibold') : 'text-[#5B6472] hover:bg-[#F3F4F6]'
              } disabled:cursor-not-allowed`}>
              {text(o)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// 타자 노림: 투구 전 구종 계열·높이(둘 다 기본 "안 노림"). 공이 출발하면 잠긴다.
// onChange는 바뀐 쪽만 넘긴다 — 부모가 이전 값에 합친다(연달아 바꿔도 앞 선택이 덮이지 않게)
export function ReadPicker({ value, onChange, locked }: { value: ReadGuess; onChange: (patch: Partial<ReadGuess>) => void; locked: boolean }) {
  return (
    <div className={`flex flex-col gap-1 transition-opacity ${locked ? 'opacity-50' : ''}`} data-read-locked={locked || undefined}>
      <Segmented label="구종 노림" options={CATS} value={value.category} locked={locked}
        onChange={c => onChange({ category: c })} text={c => (c ? CATEGORY_LABEL[c] : '안 노림')} />
      <Segmented label="높이 노림" options={BANDS} value={value.height} locked={locked}
        onChange={h => onChange({ height: h })} text={h => (h ? HEIGHT_LABEL[h] : '안 노림')} />
    </div>
  )
}

const GRADE_TEXT: Record<GaugeGrade, { text: string; color: string }> = {
  PERFECT: { text: '완벽!', color: '#15803D' },
  GOOD: { text: '좋음', color: '#2F7D4F' },
  MISS: { text: '빗나감', color: '#B42318' },
}

// 투수 제구 막대 — 왕복·판정 로직은 DuelView 그대로(CSS 애니메이션 + 화면 위치 읽기). 여기는 모양만.
// 구간: 빗나감(연분홍) | 좋음(초록, PERFECT_ERR — 고른 코스·구속 그대로) | 완벽(가운데 진한 초록, 표시용 — 효과는 좋음과 같음).
// 필살마구 초정밀 구간을 넣을 때는 완벽 띠 안에 같은 방식으로 한 겹 더 그리면 된다.
export function GaugeBar({ trackRef, markerRef, runKey, periodMs, stoppedPos, feedback }: {
  trackRef: Ref<HTMLDivElement>
  markerRef: Ref<HTMLDivElement>
  runKey: number | null              // 막대가 움직이는 중이면 시작 시각(애니메이션 key), 아니면 null
  periodMs: number
  stoppedPos: number | null
  feedback: { id: number; grade: GaugeGrade } | null
}) {
  const band = (err: number) => ({ left: `${(0.5 - err / 2) * 100}%`, width: `${err * 100}%` })
  const marker = (
    <>
      <span className="absolute -top-px left-1/2 -translate-x-1/2 border-x-[4px] border-x-transparent border-t-[5px] border-t-[#1F2933]" />
      <span className="absolute -bottom-px left-1/2 -translate-x-1/2 border-x-[4px] border-x-transparent border-b-[5px] border-b-[#1F2933]" />
    </>
  )
  const markerCls = 'absolute top-0 bottom-0 w-[3px] -ml-[1.5px] rounded-full bg-[#1F2933] shadow-[0_0_0_1px_rgba(255,255,255,0.7)]'
  return (
    <div className="relative flex-1">
      <style>{'@keyframes bb-gauge{0%{transform:translateX(0)}50%{transform:translateX(100%)}100%{transform:translateX(0)}}'
        + '@keyframes bb-gauge-fb{0%{opacity:0;transform:translate(-50%,3px) scale(.9)}18%{opacity:1;transform:translate(-50%,0) scale(1.06)}70%{opacity:1;transform:translate(-50%,0) scale(1)}100%{opacity:0;transform:translate(-50%,-2px)}}'
        + '@keyframes bb-gauge-pop{0%{transform:scaleY(1)}40%{transform:scaleY(1.25)}100%{transform:scaleY(1)}}'}</style>
      {feedback && stoppedPos !== null && (
        <span key={feedback.id} className="absolute -top-[17px] z-10 text-[11px] font-bold whitespace-nowrap pointer-events-none"
          style={{ left: `${stoppedPos * 100}%`, color: GRADE_TEXT[feedback.grade].color, animation: 'bb-gauge-fb 450ms ease-out forwards' }}
          data-gauge-feedback={feedback.grade}>
          {GRADE_TEXT[feedback.grade].text}
        </span>
      )}
      <div ref={trackRef} className="relative h-5 rounded-full bg-[#FBEAEA] border border-[#EFD9D9] shadow-[inset_0_1px_2px_rgba(16,24,40,0.08)] overflow-hidden">
        <div className="absolute inset-y-0 bg-[#BDEFCD]" style={band(PERFECT_ERR)} />
        <div className="absolute inset-y-0 bg-[#7AD69F]" style={band(GAUGE_PERFECT_SHOW_ERR)} />
        {/* 좋음 구간 경계 눈금 */}
        {[0.5 - PERFECT_ERR / 2, 0.5 + PERFECT_ERR / 2].map(x => <div key={x} className="absolute inset-y-0 w-px bg-[#5DB884]" style={{ left: `${x * 100}%` }} />)}
        {runKey !== null ? (
          <div key={runKey} className="absolute inset-0" style={{ animation: `bb-gauge ${periodMs}ms linear infinite`, willChange: 'transform' }}>
            <div ref={markerRef} className={`${markerCls} left-0`}>{marker}</div>
          </div>
        ) : stoppedPos !== null ? (
          <div key={feedback?.id} className={markerCls} style={{ left: `${stoppedPos * 100}%`, animation: 'bb-gauge-pop 160ms ease-out' }}>{marker}</div>
        ) : null}
      </div>
    </div>
  )
}
