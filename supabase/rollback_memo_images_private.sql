-- memo_images_private.sql 되돌리기 — 2026-11-10 이전 상태(공개, 크기·형식 제한 없음).
-- 기준: snapshots/prod-rls-2026-11-10.json buckets[meeting-memo-images]
UPDATE storage.buckets
   SET public = true,
       file_size_limit = NULL,
       allowed_mime_types = NULL
 WHERE id = 'meeting-memo-images';
