-- 근태·계약/휴직 캡처 버킷(meeting-memo-images)을 비공개로 전환 + 버킷 단에서도 5MB·이미지 형식 제한.
-- ⚠ 반드시 "서명 주소" 앱 코드(lib/memoImage.ts, meeting-items API)가 운영에 배포된 뒤에 실행할 것.
--    먼저 실행하면 회의창의 근태 캡처가 깨져 보인다.
-- 제한 값은 업로드 API(api/meeting-memo-image)와 같다: 5MB, png/jpeg/webp/gif.
-- 되돌리기: rollback_memo_images_private.sql
UPDATE storage.buckets
   SET public = false,
       file_size_limit = 5242880,
       allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
 WHERE id = 'meeting-memo-images';
