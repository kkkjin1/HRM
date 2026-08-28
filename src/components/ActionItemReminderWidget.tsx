'use client'

// AnonChat(좌측하단, 투명도 0.35)과 같은 패턴의 우측하단 상시노출 위젯.
// 강제모달(ActionItemReminderModal)을 "확인했어요"로 닫아도 항목이 사라지는 게 아니라
// 여기 계속 남아서 하루 중 언제든 다시 훑어볼 수 있게 한다. 좌측 채팅창보다는 조금 더
// 또렷하게(기본 투명도 0.65) — 완전히 무시되지 않도록.
import { useMyActionReminders } from '@/lib/useMyActionReminders'

export default function ActionItemReminderWidget({ onGoToMeeting }: { onGoToMeeting?: (meetingId: string) => void }) {
  const items = useMyActionReminders()

  if (items.length === 0) return null

  return (
    <div
      style={{ width: 220, height: 200 }}
      className="hidden lg:flex fixed right-4 bottom-4 z-40 flex-col bg-white/85 backdrop-blur-sm border border-[#E8E8E4] rounded-xl px-3 py-2.5 opacity-[0.65] hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 resize overflow-auto min-w-[180px] min-h-[120px] max-w-[420px] max-h-[70vh]"
    >
      <p className="text-[10.5px] text-[#9C9C96] flex-shrink-0 mb-1.5">⏰ 내 액션아이템 ({items.length})</p>

      <div className="flex-1 min-h-0 space-y-1 overflow-y-auto">
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => onGoToMeeting?.(item.meetingId)}
            className="w-full text-left bg-[#F7F7F5]/80 hover:bg-[#EFEFEC] rounded-lg px-2 py-1"
          >
            <p className="text-[11px] text-[#1F1F1D] leading-snug truncate">{item.content}</p>
            <p className={`text-[9.5px] ${item.overdue ? 'text-red-500' : 'text-amber-600'}`}>
              {item.overdue ? `${item.dueDate} 지남` : '오늘 마감'} · {item.meetingTitle}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
