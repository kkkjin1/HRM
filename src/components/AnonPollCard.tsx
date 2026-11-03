'use client'

// 익명 투표 한 건 — 익명채팅 목록(작게)과 투표 팝업(크게)에서 같이 쓴다.
// mode
//  - select: 팝업에서 고르는 중. 몇 번이든 바꿔 누를 수 있고, 다른 사람 결과는 안 보인다(확인을 눌러야 저장).
//  - view:   이미 투표했거나 내가 올린 투표. 표 수·막대만 보이고 누를 수 없다(실시간 갱신).
//  - locked: 아직 안 찍은 사람이 채팅창에서 볼 때. 선택지 이름만 보이고 결과·클릭 없음(투표는 팝업에서).

type Props = {
  question: string
  options: string[]
  mode: 'select' | 'view' | 'locked'
  counts?: number[]
  total?: number
  picked?: number | null   // select: 지금 고른 항목 / view: 내가 찍은 항목
  onPick?: (idx: number) => void
  disabled?: boolean
  size?: 'sm' | 'lg'
}

export default function AnonPollCard({ question, options, mode, counts = [], total = 0, picked = null, onPick, disabled, size = 'sm' }: Props) {
  const lg = size === 'lg'
  const view = mode === 'view'
  const select = mode === 'select'
  return (
    <div>
      <p className={`${lg ? 'text-[14.5px] mb-3' : 'text-[11px] mb-1'} font-semibold text-[#1F1F1D] leading-snug whitespace-pre-wrap break-words`}>
        {!lg && <span className="text-[#2F6FB0]">투표 · </span>}{question}
      </p>
      <div className={lg ? 'space-y-2' : 'space-y-1'}>
        {options.map((opt, i) => {
          const c = counts[i] ?? 0
          const pct = total > 0 ? Math.round((c / total) * 100) : 0
          const mine = picked === i
          const cls = `relative w-full overflow-hidden text-left border ${lg ? 'rounded-lg px-3 py-2.5 text-[13.5px]' : 'rounded-md px-1.5 py-1 text-[10.5px]'} ${mine ? 'border-[#2F6FB0] bg-[#EEF4FA]' : 'border-[#E8E8E4] bg-white/90'}`
          const inner = (
            <>
              {view && <span className="absolute inset-y-0 left-0 bg-[#2F6FB0]/12" style={{ width: `${pct}%` }} aria-hidden />}
              <span className="relative flex items-center justify-between gap-2">
                <span className={`break-words ${mine ? 'font-semibold text-[#2F6FB0]' : 'text-[#1F1F1D]'}`}>{mine && '✓ '}{opt}</span>
                {view && <span className="flex-shrink-0 text-[#7A8491] tabular-nums">{c}표{lg && ` · ${pct}%`}</span>}
              </span>
            </>
          )
          return select ? (
            <button key={i} type="button" disabled={disabled} onClick={() => onPick?.(i)} className={`${cls} transition-colors disabled:opacity-60 ${mine ? '' : 'hover:border-[#2F6FB0]/60'}`}>
              {inner}
            </button>
          ) : (
            <div key={i} className={cls}>{inner}</div>
          )
        })}
      </div>
      <p className={`${lg ? 'text-[11.5px] mt-2' : 'text-[9px] mt-0.5'} text-[#9C9C96]`}>
        {view
          ? `${picked !== null ? '투표 완료 · ' : ''}총 ${total}명 참여 · 익명`
          : select
            ? '여러 번 바꿔 눌러도 돼요 · 확인을 누르면 저장되고 그 뒤엔 못 바꿔요 · 익명'
            : '아직 투표하지 않았어요 · 투표하면 결과가 보여요'}
      </p>
    </div>
  )
}
