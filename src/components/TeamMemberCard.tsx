'use client'

import { ROLE_LABEL } from '@/lib/data'
import type { Member } from '@/lib/members'
import Avatar from '@/components/Avatar'

type Props = {
  member: Member
  onOpenProfile: () => void
}

// 팀원 한 명 = 카드 하나. "누가 있는지"뿐 아니라 "어떤 역할을 하는 사람인지"를
// 실제 존재하는 필드(gives/needs)만으로 보여준다 — 없는 데이터는 지어내지 않는다.
export default function TeamMemberCard({ member, onOpenProfile }: Props) {
  return (
    <div className="flex flex-col bg-white rounded-2xl border border-[#EEF0F2] p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)] hover:shadow-[0_3px_10px_rgba(16,24,40,0.06)] hover:border-[#E2E6EC] transition-shadow duration-150">
      <div className="flex items-start gap-3 mb-4">
        <Avatar member={member} size={52} ring className="flex-shrink-0" />
        <div className="min-w-0 pt-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[15px] font-semibold text-[#1F2933] truncate">{member.name}</p>
            <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-full bg-[#4C7FE0]/[0.08] text-[#4C7FE0] flex-shrink-0">
              {ROLE_LABEL[member.role]}
            </span>
          </div>
          {member.position && <p className="text-[12px] text-[#7A8491] truncate mt-0.5">{member.position}</p>}
        </div>
      </div>

      <div className="space-y-2.5 flex-1">
        <div>
          <p className="text-[10.5px] font-medium text-[#9AA5B1] mb-0.5">보태는 것</p>
          <p className="text-[12.5px] text-[#3A4249] leading-snug line-clamp-2">
            {member.gives || <span className="text-[#C4CBD2]">아직 작성 전</span>}
          </p>
        </div>
        <div>
          <p className="text-[10.5px] font-medium text-[#9AA5B1] mb-0.5">기대하는 것</p>
          <p className="text-[12.5px] text-[#3A4249] leading-snug line-clamp-2">
            {member.needs || <span className="text-[#C4CBD2]">아직 작성 전</span>}
          </p>
        </div>
      </div>

      <button
        onClick={onOpenProfile}
        className="mt-4 pt-3 border-t border-[#EEF0F2] flex items-center justify-between text-[12px] font-medium text-[#4C7FE0] hover:text-[#3A6CC8] w-full text-left"
      >
        <span>프로필 보기</span>
        <span aria-hidden>→</span>
      </button>
    </div>
  )
}
