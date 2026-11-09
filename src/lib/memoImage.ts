import type { SupabaseClient } from '@supabase/supabase-js'

// 회의창 근태·계약/휴직 캡처(meeting-memo-images 버킷).
// DB의 image_url에는 "버킷 안 파일 위치"를 가리키는 고정 주소(getPublicUrl 형식)를 그대로 저장하고,
// 화면에 내려보낼 때만 서명된 임시 주소로 바꾼다. 서명 주소는 버킷이 공개든 비공개든 똑같이 동작하므로
// 버킷을 비공개로 바꾸기 전·후 어느 쪽에서도 이미지가 보인다.
export const MEMO_IMAGE_BUCKET = 'meeting-memo-images'
// 회의창은 하루 종일 열어 두고 캐시해서 쓰는 경우가 많아 하루 근무시간을 덮는 길이로 잡는다.
export const MEMO_IMAGE_SIGN_TTL_SEC = 12 * 60 * 60

const PATH_RE = new RegExp(`/storage/v1/object/(?:public|sign)/${MEMO_IMAGE_BUCKET}/([^?#]+)`)
const FILE_RE = /^[0-9a-f-]{36}\.(png|jpeg|jpg|webp|gif)$/i

// 저장된 주소(공개 형식·서명 형식) 또는 파일명에서 버킷 안 경로를 뽑는다. 이 버킷 파일이 아니면 null.
export function memoImagePath(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(PATH_RE)
  const path = m ? decodeURIComponent(m[1]) : url
  return FILE_RE.test(path) ? path : null
}

type WithImage = { image_url?: string | null }

// 행 목록의 image_url을 서명 주소로 바꾼다(한 번의 요청으로 일괄 서명). 서명에 실패한 행은 원래 주소를 둔다.
export async function signMemoImages<T extends WithImage>(supabase: SupabaseClient, rows: T[]): Promise<T[]> {
  const paths = [...new Set(rows.map(r => memoImagePath(r.image_url)).filter((p): p is string => !!p))]
  if (paths.length === 0) return rows
  const { data, error } = await supabase.storage.from(MEMO_IMAGE_BUCKET).createSignedUrls(paths, MEMO_IMAGE_SIGN_TTL_SEC)
  if (error || !data) return rows
  const signed = new Map(data.filter(d => d.signedUrl && d.path).map(d => [d.path as string, d.signedUrl]))
  return rows.map(r => {
    const p = memoImagePath(r.image_url)
    const s = p ? signed.get(p) : undefined
    return s ? { ...r, image_url: s } : r
  })
}
