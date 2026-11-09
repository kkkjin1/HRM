import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentMember } from '@/lib/currentMember'

const MAX_BYTES = 3 * 1024 * 1024
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

// storage 버킷(avatars)은 서비스 키로만 쓰도록 만들어서 별도 storage RLS 정책이 필요 없다 —
// 다른 API 라우트들과 동일하게 "로그인 확인은 여기서, 실제 쓰기는 서비스 클라이언트로" 패턴.
// 대상은 항상 로그인한 본인 — 폼의 member_id는 믿지 않는다(예전엔 그 값으로 남의 프로필 사진을 바꿀 수 있었다).
export async function POST(request: NextRequest) {
  const session = await getCurrentMember()
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  if (!session.member) return NextResponse.json({ ok: false, error: '팀원으로 연결된 계정만 사진을 바꿀 수 있습니다.' }, { status: 403 })
  const memberId = session.member.id

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ ok: false, error: 'png/jpeg/webp/gif만 지원합니다.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: '3MB 이하 이미지만 업로드할 수 있습니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const ext = file.type.split('/')[1] ?? 'png'
  const path = `${memberId}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, buffer, { contentType: file.type, upsert: true })
  if (uploadError) return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 })

  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
  // 같은 경로로 덮어써도(upsert) 브라우저/CDN 캐시가 예전 사진을 계속 보여줄 수 있어 쿼리스트링으로 무효화한다.
  const avatarUrl = `${pub.publicUrl}?v=${Date.now()}`

  const { data, error } = await supabase
    .from('members')
    .update({ avatar_url: avatarUrl })
    .eq('id', memberId)
    .select('id, avatar_url')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, avatar_url: data.avatar_url })
}
