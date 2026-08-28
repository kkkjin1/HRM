'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { displayNameFull } from '@/lib/members'
import ClickableAvatar from '@/components/ClickableAvatar'
import { FATES } from '@/lib/fates'

function hashString(s: string) {
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0
  return Math.abs(hash)
}

// 오늘 하루 팀원 1명 + 운명 문구 1개를 날짜 시드로 결정적으로 뽑는다 — 서버 오늘 날짜(today_date)를
// 시드로 쓰기 때문에 새로고침하거나 누가 보든 하루 종일 전원에게 같은 결과가 보인다.
export default function TeamFate() {
  const { members, loaded: membersLoaded } = useMembers()
  const [today, setToday] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    supabase.rpc('today_date').then(({ data }) => {
      if (active) setToday(data as string)
    })
    return () => { active = false }
  }, [])

  if (!membersLoaded || !today || members.length === 0) {
    return (
      <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5 h-full">
        <p className="text-[13px] text-[#9C9C96]">불러오는 중...</p>
      </div>
    )
  }

  const member = members[hashString(`${today}:member`) % members.length]
  const fate = FATES[hashString(`${today}:fate`) % FATES.length]

  return (
    <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5 h-full flex flex-col">
      <p className="text-[12px] text-[#9C9C96] mb-3 flex-shrink-0">🎰 오늘의 팀 운명</p>
      <div className="flex-1 flex flex-col min-h-0 pt-3">
        <div className="flex-[7] flex flex-col items-center justify-center gap-2 min-h-0">
          <ClickableAvatar member={member} size={104} ring />
          <p className="text-[13.5px] font-medium text-[#6B6B66]">{displayNameFull(member)}</p>
        </div>
        <div className="flex-[3] flex items-center justify-center px-2 min-h-0">
          <p className="text-[14px] font-bold text-[#1F1F1D] truncate">{fate}</p>
        </div>
      </div>
    </div>
  )
}
