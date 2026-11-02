import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentMember } from '@/lib/currentMember'
import { RR_IMAGE_MAX_BYTES, RR_IMAGE_TYPES, putRrImage } from '@/lib/rrImage'

// R&R 메모 카드 본문에 붙여넣은 캡처·올린 이미지(팀 공용).
export async function POST(request: NextRequest) {
  const session = await getCurrentMember()
  if (!session?.member) return NextResponse.json({ ok: false }, { status: 401 })
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  if (!RR_IMAGE_TYPES.includes(file.type)) return NextResponse.json({ ok: false, error: 'png/jpeg/webp/gif만 지원합니다.' }, { status: 400 })
  if (file.size > RR_IMAGE_MAX_BYTES) return NextResponse.json({ ok: false, error: '10MB 이하 이미지만 올릴 수 있습니다.' }, { status: 400 })
  try {
    const url = await putRrImage(createServiceClient(), Buffer.from(await file.arrayBuffer()), file.type)
    return NextResponse.json({ ok: true, url })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
