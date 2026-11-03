// R&R 메모 본문 이미지 — 팀 공용(로그인한 팀원 누구나 봄). 첨부와 같은 비공개 버킷의 images/ 폴더에 둔다.
// 화면엔 /api/rr-image/{uuid} 주소를 넣는다(sanitizeNoteHtml이 허용하는 주소).
import { createServiceClient } from '@/lib/supabase/service'
import { RR_ATTACHMENT_BUCKET, RR_ATTACHMENT_MAX_BYTES } from '@/lib/rrMemo'

export const RR_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
export const RR_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const rrImagePath = (id: string) => `images/${id}`

// 이미지를 올리고 본문에 넣을 주소를 돌려준다. 버킷이 아직 없으면(첫 업로드) 만든다.
export async function putRrImage(supabase: ReturnType<typeof createServiceClient>, data: Blob | Buffer, contentType: string) {
  const id = crypto.randomUUID()
  const upload = () => supabase.storage.from(RR_ATTACHMENT_BUCKET).upload(rrImagePath(id), data, { contentType })
  let { error } = await upload()
  if (error && /not found|does not exist/i.test(error.message)) {
    const created = await supabase.storage.createBucket(RR_ATTACHMENT_BUCKET, { public: false, fileSizeLimit: RR_ATTACHMENT_MAX_BYTES })
    if (created.error && !/already exists/i.test(created.error.message)) throw new Error(created.error.message)
    ;({ error } = await upload())
  }
  if (error) throw new Error(error.message)
  return `/api/rr-image/${id}`
}
