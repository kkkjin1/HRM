'use client'

// 회의수정 탭에서 담당자·기한이 설정된 액션아이템 중, 오늘 기준으로 기한이 지났거나
// 오늘이 마감인 "내" 항목을 대시보드 접속 시 강제 확인 모달로 띄운다.
// 알림종(NotificationBell)은 앱이 열려 있어야 눈에 띄므로 놓치기 쉬운데, 이 모달은
// 대시보드에 들어오면 무조건 한 번은 보게 만들어 리마인드 확실성을 높인다.
// 하루 한 번만 뜨도록 localStorage에 확인한 날짜를 남긴다(다음날 여전히 안 끝났으면 다시 뜸).
// 닫은 뒤에도 항목 자체는 ActionItemReminderWidget(우측하단 상시노출)에 계속 남는다.

import { useEffect, useRef, useState } from 'react'
import { todayStr, useMyActionReminders } from '@/lib/useMyActionReminders'

const DISMISS_KEY = 'hrm_action_reminder_dismissed_date'

export default function ActionItemReminderModal({ onGoToMeeting }: { onGoToMeeting?: (meetingId: string) => void }) {
  const items = useMyActionReminders()
  const [open, setOpen] = useState(false)
  const decidedRef = useRef(false)

  useEffect(() => {
    if (decidedRef.current || items.length === 0) return
    decidedRef.current = true
    let dismissedToday = false
    try { dismissedToday = window.localStorage.getItem(DISMISS_KEY) === todayStr() } catch {}
    if (!dismissedToday) setOpen(true)
  }, [items])

  if (!open) return null

  function dismiss() {
    try { window.localStorage.setItem(DISMISS_KEY, todayStr()) } catch {}
    setOpen(false)
  }

  function goTo(meetingId: string) {
    dismiss()
    onGoToMeeting?.(meetingId)
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-[420px] max-h-[80vh] flex flex-col">
        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
          <p className="text-[15px] font-semibold text-gray-800">⏰ 기한 지난 액션아이템이 있어요</p>
          <p className="text-[12px] text-gray-400 mt-1">회의에서 나에게 배정된 항목 {items.length}건</p>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
          {items.map(item => (
            <button
              key={item.id}
              onClick={() => goTo(item.meetingId)}
              className="w-full text-left px-5 py-3 hover:bg-gray-50 flex flex-col gap-1"
            >
              <p className="text-[13.5px] text-gray-800 leading-snug">{item.content}</p>
              <div className="flex items-center gap-2 text-[11.5px]">
                <span className={item.overdue ? 'text-red-500 font-medium' : 'text-amber-600 font-medium'}>
                  {item.overdue ? `기한 ${item.dueDate} 지남` : `오늘 마감 (${item.dueDate})`}
                </span>
                <span className="text-gray-400">· {item.meetingTitle}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button
            onClick={dismiss}
            className="text-[13px] font-medium text-white bg-[#4C7FE0] rounded-lg px-4 py-2 hover:bg-[#3d6bcc]"
          >
            확인했어요
          </button>
        </div>
      </div>
    </div>
  )
}
