-- R&R 메모 페이지 (STEP 3): 회차 카드 첨부파일.
-- 파일 본문은 비공개 버킷 rr-attachments(첫 업로드 때 서버가 자동 생성)에 두고, 이 표엔 목록만 둔다.
-- 브라우저는 표·버킷을 직접 못 만진다 — /api/rr-attachments가 권한 확인 후 업로드 허가 주소/내려받기 주소를 발급한다.

CREATE TABLE IF NOT EXISTS rr_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES rr_entries(id) ON DELETE CASCADE,
  path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  size bigint NOT NULL DEFAULT 0,
  uploaded_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rr_attachments_entry_idx ON rr_attachments (entry_id, created_at);

ALTER TABLE rr_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rr_attachments FROM anon, authenticated;
GRANT ALL ON rr_attachments TO service_role;

NOTIFY pgrst, 'reload schema';

SELECT count(*) AS rr_attachments_table FROM information_schema.tables WHERE table_name = 'rr_attachments';
