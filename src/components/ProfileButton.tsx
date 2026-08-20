'use client'

import { useState } from 'react'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { displayNameFull } from '@/lib/members'
import Avatar from '@/components/Avatar'
import ProfileCardModal from '@/components/ProfileCardModal'

type Props = { fallbackName: string; className?: string }

// 헤더의 "프로필" 진입점 — 클릭하면 내 프로필 카드가 뜬다. members 테이블에 매칭되는
// 계정이 아직 없으면(me === null) 그냥 이름 텍스트만 보여주고 클릭은 비활성화한다.
export default function ProfileButton({ fallbackName, className = '' }: Props) {
  const { me } = useCurrentMember()
  const [open, setOpen] = useState(false)

  if (!me) return <span className={`truncate ${className}`}>{fallbackName}</span>

  return (
    <>
      <button onClick={() => setOpen(true)} className={`flex items-center gap-1.5 min-w-0 hover:opacity-80 ${className}`} title="프로필 보기">
        <Avatar member={me} size={22} />
        <span className="truncate">{displayNameFull(me)}</span>
      </button>
      {open && <ProfileCardModal memberId={me.id} onClose={() => setOpen(false)} />}
    </>
  )
}
