import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentMember } from '@/lib/currentMember'

const BUCKET = 'personal-note-images'
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// 개인 노트 이미지 보기 — 로그인한 본인 폴더({팀원 id}/)에서만 찾는다. 주소를 알아도 남의 이미지는 404.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!ID_RE.test(id)) return new NextResponse(null, { status: 404 })

  const session = await getCurrentMember()
  const memberId = session?.member?.id
  if (!memberId) return new NextResponse(null, { status: 401 })

  const { data, error } = await createServiceClient().storage.from(BUCKET).download(`${memberId}/${id}`)
  if (error || !data) return new NextResponse(null, { status: 404 })

  return new NextResponse(data, {
    headers: {
      'Content-Type': data.type || 'application/octet-stream',
      // 같은 id에 다른 내용이 올라가는 일이 없어 오래 캐시해도 된다. private — 공유 캐시(CDN)에는 남기지 않는다.
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
