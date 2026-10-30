'use client'

// 팀 탭 팀원 카드 — 사진·이름·역할·직책·입사일만 간단히. 일하는 방식·특성은 카드를 눌러 프로필 창에서 본다.

import { ROLE_LABEL } from '@/lib/data'
import { displayNameFull, type Member } from '@/lib/members'
import Avatar from '@/components/Avatar'

type Props = {
  member: Member
  onOpenProfile: () => void
}

function seoulToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

// 'YYYY-MM-DD' → "입사 2023.05.02 · 3년차" / 아직이면 "입사 예정 2026.11.03"
function hiredLabel(hiredAt: string | null) {
  if (!hiredAt) return null
  const date = hiredAt.slice(0, 10).replace(/-/g, '.')
  const today = seoulToday()
  if (hiredAt > today) return `입사 예정 ${date}`
  let years = Number(today.slice(0, 4)) - Number(hiredAt.slice(0, 4))
  if (today.slice(5) < hiredAt.slice(5, 10)) years -= 1
  return `입사 ${date} · ${years + 1}년차`
}

export default function TeamMemberCard({ member, onOpenProfile }: Props) {
  const hired = hiredLabel(member.hired_at)
  return (
    <button
      onClick={onOpenProfile}
      title="눌러서 프로필 보기"
      className="w-full h-full flex flex-col items-center text-center bg-white rounded-2xl border border-[#EEF0F2] px-3 pt-6 pb-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)] hover:shadow-[0_3px_10px_rgba(16,24,40,0.06)] hover:border-[#C7D2E6] transition-shadow duration-150"
    >
      <Avatar member={member} size={72} ring className="flex-shrink-0" />
      <p className="text-[15.5px] font-semibold text-[#1F2933] mt-3 truncate max-w-full">{displayNameFull(member)}</p>
      <div className="flex items-center justify-center gap-1 mt-1 flex-wrap max-w-full">
        <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-full bg-[#4C7FE0]/[0.08] text-[#4C7FE0]">{ROLE_LABEL[member.role]}</span>
        {member.position && <span className="text-[11.5px] text-[#7A8491] truncate">{member.position}</span>}
      </div>
      <p className="text-[12px] text-[#9AA3AD] mt-2">{hired ?? '입사일 미입력'}</p>
    </button>
  )
}
