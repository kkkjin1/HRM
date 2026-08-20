import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

// storage 버킷(history-photos)도 avatar와 동일하게 서비스 키로만 써서 별도 storage RLS가
// 필요 없다 — "로그인 확인은 여기서, 실제 쓰기는 서비스 클라이언트로" 패턴 재사용.
export async function POST(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  const eventId = form?.get('event_id')
  if (!(file instanceof File) || typeof eventId !== 'string' || !eventId) {
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
  const path = `${eventId}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from('history-photos')
    .upload(path, buffer, { contentType: file.type, upsert: true })
  if (uploadError) return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 })

  const { data: pub } = supabase.storage.from('history-photos').getPublicUrl(path)
  // 같은 경로로 덮어써도(upsert) 브라우저/CDN 캐시가 예전 사진을 계속 보여줄 수 있어 쿼리스트링으로 무효화한다.
  const photoUrl = `${pub.publicUrl}?v=${Date.now()}`

  const { data, error } = await supabase
    .from('history_events')
    .update({ photo_url: photoUrl })
    .eq('id', eventId)
    .select('id, photo_url')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, photo_url: data.photo_url })
}
