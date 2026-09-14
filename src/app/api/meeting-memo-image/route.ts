import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

// 회의 메모에 붙여넣은 캡처화면 업로드. 기존 row에 매달리는 avatar/history-photo와 달리
// 메모 아이템은 이미지를 붙여넣는 시점엔 아직 존재하지 않을 수 있어 랜덤 파일명을 쓴다.
// storage 버킷(meeting-memo-images)은 avatars/history-photos와 동일하게 미리 만들어 둬야 한다(public read).
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ ok: false, error: 'png/jpeg/webp/gif만 지원합니다.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: '5MB 이하 이미지만 업로드할 수 있습니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const ext = file.type.split('/')[1] ?? 'png'
  const path = `${crypto.randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from('meeting-memo-images')
    .upload(path, buffer, { contentType: file.type })
  if (uploadError) return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 })

  const { data: pub } = supabase.storage.from('meeting-memo-images').getPublicUrl(path)
  return NextResponse.json({ ok: true, url: pub.publicUrl })
}
