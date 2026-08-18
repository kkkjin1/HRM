'use client'

import { ROLE_LABEL } from '@/lib/data'
import { displayName, type Member } from '@/lib/members'
import Avatar from '@/components/Avatar'
import { WORK_STYLE_QUESTIONS, labelOf, type WorkStyle } from '@/lib/workStyle'

type Props = {
  member: Member
  onOpenProfile: () => void
  workStyle?: WorkStyle | null
}

export default function TeamMemberCard({ member, onOpenProfile, workStyle }: Props) {
  const hasStyle = workStyle && (workStyle.gives_tags.length > 0 || workStyle.needs_tags.length > 0 || workStyle.when_stuck)

  return (
    <div className="flex flex-col bg-white rounded-2xl border border-[#EEF0F2] p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)] hover:shadow-[0_3px_10px_rgba(16,24,40,0.06)] hover:border-[#E2E6EC] transition-shadow duration-150">
      <div className="flex items-start gap-3 mb-4">
        <Avatar member={member} size={52} ring className="flex-shrink-0" />
        <div className="min-w-0 pt-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[15px] font-semibold text-[#1F2933] truncate">{displayName(member)}</p>
            <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-full bg-[#4C7FE0]/[0.08] text-[#4C7FE0] flex-shrink-0">
              {ROLE_LABEL[member.role]}
            </span>
          </div>
          {member.nickname && <p className="text-[11px] text-[#9AA5B1] truncate mt-0.5">{member.name}</p>}
          {member.position && <p className="text-[12px] text-[#7A8491] truncate mt-0.5">{member.position}</p>}
        </div>
      </div>

      <div className="flex-1 space-y-2.5">
        {hasStyle ? (
          <>
            {/* 협업 방식 칩 */}
            {WORK_STYLE_QUESTIONS.some(q => workStyle[q.key]) && (
              <div className="flex flex-wrap gap-1">
                {WORK_STYLE_QUESTIONS.map(q => {
                  const label = labelOf(q.key, workStyle[q.key])
                  if (!label) return null
                  return (
                    <span key={q.key} className="inline-flex items-center gap-0.5 text-[10.5px] px-1.5 py-0.5 rounded-full bg-[#F0F2F5] text-[#3A4249]">
                      {q.icon} {label}
                    </span>
                  )
                })}
              </div>
            )}

            {/* 보태는 것 */}
            {workStyle.gives_tags.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-[#059669] mb-0.5">보태는 것</p>
                <div className="flex flex-wrap gap-1">
                  {workStyle.gives_tags.map(t => (
                    <span key={t} className="text-[10.5px] px-1.5 py-0.5 rounded-full bg-[#F0F2F5] text-[#3A4249]">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* 기대하는 것 */}
            {workStyle.needs_tags.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-[#B45309] mb-0.5">기대하는 것</p>
                <div className="flex flex-wrap gap-1">
                  {workStyle.needs_tags.map(t => (
                    <span key={t} className="text-[10.5px] px-1.5 py-0.5 rounded-full bg-[#F0F2F5] text-[#3A4249]">{t}</span>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          // 작성 전 fallback — 기존 free text 그대로 보여줌
          <>
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
          </>
        )}
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
