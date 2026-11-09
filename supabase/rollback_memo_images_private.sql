-- memo_images_private.sql 되돌리기 — 근태·계약/휴직 캡처 버킷을 다시 공개로(2026-11-10 이전 상태).
UPDATE storage.buckets SET public = true WHERE id = 'meeting-memo-images';
