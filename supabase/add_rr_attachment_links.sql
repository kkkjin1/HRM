-- R&R 메모 회차 카드 첨부에 "링크" 추가 — 큰 자료(드라이브·노션 등)는 파일 대신 URL만 붙인다.
-- 링크 행은 url이 있고 path(버킷 경로)가 없다.

ALTER TABLE rr_attachments ADD COLUMN IF NOT EXISTS url text;
ALTER TABLE rr_attachments ALTER COLUMN path DROP NOT NULL;
ALTER TABLE rr_attachments DROP CONSTRAINT IF EXISTS rr_attachments_file_or_link;
ALTER TABLE rr_attachments ADD CONSTRAINT rr_attachments_file_or_link CHECK ((path IS NOT NULL) <> (url IS NOT NULL));

NOTIFY pgrst, 'reload schema';

SELECT count(*) AS url_col FROM information_schema.columns WHERE table_name = 'rr_attachments' AND column_name = 'url';
