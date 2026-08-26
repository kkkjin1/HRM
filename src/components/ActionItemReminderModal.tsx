'use client'

// 회의수정 탭 액션아이템(기한 지남/오늘마감) + 이번주 일정·보고일정을 대시보드 접속 시
// 하루 1회 강제 확인 모달로 한 번에 보여준다. 알림종(NotificationBell)은 앱이 열려 있어야
// 눈에 띄므로 놓치기 쉬운데, 이 모달은 대시보드에 들어오면 무조건 한 번은 보게 만든다.
// 하루 한 번만 뜨도록 localStorage에 확인한 날짜를 남긴다(다음날 여전히 남아있으면 다시 뜸).
// 닫은 뒤에도 액션아이템은 ActionItemReminderWidget(우측하단 상시노출)에 계속 남는다.

import { useEffect, useRef, useState } from 'react'
import { todayStr, useMyActionReminders } from '@/lib/useMyActionReminders'
import { useMyWeekOutlook } from '@/lib/useMyWeekOutlook'

const DISMISS_KEY = 'hrm_action_reminder_dismissed_date'
const OUTLOOK_KIND_LABEL: Record<'schedule' | 'report', string> = { schedule: '일정', report: '보고일정' }

type NavigateTarget = { section: 'meetings'; meetingId: string } | { section: 'schedule' } | { section: 'work' }

export default function ActionItemReminderModal({ onNavigate }: { onNavigate?: (target: NavigateTarget) => void }) {
  const actionItems = useMyActionReminders()
  const weekOutlook = useMyWeekOutlook()
  const [open, setOpen] = useState(false)
  const decidedRef = useRef(false)
  const totalCount = actionItems.length + weekOutlook.length

  useEffect(() => {
    if (decidedRef.current || totalCount === 0) return
    decidedRef.current = true
    let dismissedToday = false
    try { dismissedToday = window.localStorage.getItem(DISMISS_KEY) === todayStr() } catch {}
    if (!dismissedToday) setOpen(true)
  }, [totalCount])

  if (!open) return null

  function dismiss() {
    try { window.localStorage.setItem(DISMISS_KEY, todayStr()) } catch {}
    setOpen(false)
  }

  function goTo(target: NavigateTarget) {
    dismiss()
    onNavigate?.(target)
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-[760px] max-h-[80vh] flex flex-col">
        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
          <p className="text-[15px] font-semibold text-gray-800">📋 오늘 확인할 게 있어요</p>
          <p className="text-[12px] text-gray-400 mt-1">액션아이템 {actionItems.length}건 · 이번주 예정 {weekOutlook.length}건</p>
        </div>

        <div className="overflow-y-auto flex-1 grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
          <div>
            <p className="px-5 pt-3 pb-1 text-[11.5px] font-semibold text-gray-500">⏰ 기한 지난/오늘마감 액션아이템</p>
            {actionItems.length === 0 ? (
              <p className="px-5 py-4 text-[12px] text-gray-400">해당 없음</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {actionItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => goTo({ section: 'meetings', meetingId: item.meetingId })}
                    className="w-full text-left px-5 py-2.5 hover:bg-gray-50 flex flex-col gap-1"
                  >
                    <p className="text-[13px] text-gray-800 leading-snug">{item.content}</p>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className={item.overdue ? 'text-red-500 font-medium' : 'text-amber-600 font-medium'}>
                        {item.overdue ? `기한 ${item.dueDate} 지남` : `오늘 마감 (${item.dueDate})`}
                      </span>
                      <span className="text-gray-400">· {item.meetingTitle}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="px-5 pt-3 pb-1 text-[11.5px] font-semibold text-gray-500">📅 이번주 예정 업무</p>
            {weekOutlook.length === 0 ? (
              <p className="px-5 py-4 text-[12px] text-gray-400">해당 없음</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {weekOutlook.map(item => (
                  <button
                    key={`${item.kind}-${item.id}`}
                    onClick={() => goTo({ section: item.kind === 'schedule' ? 'schedule' : 'work' })}
                    className="w-full text-left px-5 py-2.5 hover:bg-gray-50 flex flex-col gap-1"
                  >
                    <p className="text-[13px] text-gray-800 leading-snug">{item.title}</p>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-[#4C7FE0] font-medium">{item.date}</span>
                      <span className="text-gray-400">· {OUTLOOK_KIND_LABEL[item.kind]} · {item.context}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end flex-shrink-0">
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
