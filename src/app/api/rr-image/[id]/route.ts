import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentMember } from '@/lib/currentMember'
import { RR_ATTACHMENT_BUCKET } from '@/lib/rrMemo'
import { rrImagePath } from '@/lib/rrImage'

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// R&R 메모 이미지 보기 — 로그인한 팀원이면 누구나(메모 페이지는 팀 공용).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!ID_RE.test(id)) return new NextResponse(null, { status: 404 })
  const session = await getCurrentMember()
  if (!session?.member) return new NextResponse(null, { status: 401 })

  const { data, error } = await createServiceClient().storage.from(RR_ATTACHMENT_BUCKET).download(rrImagePath(id))
  if (error || !data) return new NextResponse(null, { status: 404 })
  return new NextResponse(data, {
    headers: {
      'Content-Type': data.type || 'application/octet-stream',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
