'use client'

import { useState } from 'react'
import Avatar from '@/components/Avatar'
import ProfileCardModal from '@/components/ProfileCardModal'
import type { Member } from '@/lib/members'

type Props = {
  member: Pick<Member, 'id' | 'name' | 'color_key' | 'avatar_url'> | null | undefined
  size: number
  ring?: boolean
  className?: string
}

// 앱 어디서든 사람 아바타를 이걸로 그리면 클릭 시 그 사람 프로필 카드가 뜬다 — 헤더/팀 탭 미니줄
// 뿐 아니라 일상 탭(한마디/낙서보드/메뉴투표)에서도 같은 방식으로 열리도록 통일한다.
export default function ClickableAvatar({ member, size, ring, className }: Props) {
  const [open, setOpen] = useState(false)

  if (!member) return <Avatar member={member} size={size} ring={ring} className={className} />

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex-shrink-0 leading-none" title={`${member.name} 프로필 보기`}>
        <Avatar member={member} size={size} ring={ring} className={className} />
      </button>
      {open && <ProfileCardModal memberId={member.id} onClose={() => setOpen(false)} />}
    </>
  )
}
