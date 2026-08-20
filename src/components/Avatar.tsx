'use client'

import { DOODLE_PALETTE } from '@/lib/data'
import { displayName, type Member } from '@/lib/members'

type Props = {
  member: Pick<Member, 'name' | 'nickname' | 'color_key' | 'avatar_url'> | null | undefined
  size: number
  ring?: boolean
  className?: string
}

// 사진이 있으면 원형 사진, 없으면 이니셜+색상 원형으로 대체한다. 어디서든(헤더/미니 목록/
// 프로필 카드) 같은 규칙으로 보이도록 이 컴포넌트 하나로 통일한다.
export default function Avatar({ member, size, ring, className = '' }: Props) {
  const palette = DOODLE_PALETTE[(member?.color_key ?? 0) % 8]
  const name = displayName(member)
  const initial = name ? (name.slice(-2, -1) || name.slice(0, 1)) : '?'
  const ringClass = ring ? 'ring-2 ring-white shadow-sm' : ''

  if (member?.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={member.avatar_url}
        alt={name}
        width={size}
        height={size}
        className={`rounded-full object-cover flex-shrink-0 ${ringClass} ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center flex-shrink-0 font-semibold ${ringClass} ${className}`}
      style={{ width: size, height: size, background: palette.bg, color: palette.fg, fontSize: size * 0.4 }}
    >
      {initial}
    </div>
  )
}
