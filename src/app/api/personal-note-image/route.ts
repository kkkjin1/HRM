import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentMember } from '@/lib/currentMember'

const BUCKET = 'personal-note-images'
const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

// 개인 노트에 붙여넣은 캡처·올린 이미지. 개인 노트는 본인만 봐야 해서 회의 메모(meeting-memo-images, 공개)와 달리
// 비공개 버킷에 `{팀원 id}/{랜덤 id}`로 두고, 화면엔 로그인 본인만 열리는 /api/personal-note-image/{id} 주소를 넣는다.
// 버킷이 아직 없으면(첫 업로드) 비공개로 만들고 다시 올린다.
export async function POST(request: NextRequest) {
  const session = await getCurrentMember()
  const memberId = session?.member?.id
  if (!memberId) return NextResponse.json({ ok: false }, { status: 401 })

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ ok: false, error: 'png/jpeg/webp/gif만 지원합니다.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: '10MB 이하 이미지만 올릴 수 있습니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const id = crypto.randomUUID()
  const path = `${memberId}/${id}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const upload = () => supabase.storage.from(BUCKET).upload(path, buffer, { contentType: file.type })

  let { error } = await upload()
  if (error && /not found/i.test(error.message)) {
    const created = await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_BYTES, allowedMimeTypes: ALLOWED_TYPES })
    if (created.error && !/already exists/i.test(created.error.message)) {
      return NextResponse.json({ ok: false, error: created.error.message }, { status: 500 })
    }
    ;({ error } = await upload())
  }
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, url: `/api/personal-note-image/${id}` })
}
