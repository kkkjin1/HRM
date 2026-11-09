-- 근태·계약/휴직 캡처 버킷(meeting-memo-images)을 비공개로 전환.
-- ⚠ 반드시 "서명 주소" 앱 코드(lib/memoImage.ts, meeting-items API)가 운영에 배포된 뒤에 실행할 것.
--    먼저 실행하면 회의창의 근태 캡처가 깨져 보인다.
-- 되돌리기: rollback_memo_images_private.sql
UPDATE storage.buckets SET public = false WHERE id = 'meeting-memo-images';
