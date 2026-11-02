-- R&R 메모 페이지 (STEP 2): R&R 업무 → 프로젝트 고정 + 회차 카드(1차 기획 → 피드백 → 2차 개선 …).
-- 브라우저는 이 테이블을 직접 못 만진다. 읽기·쓰기는 /api/rr-entries(service role)로만 — 권한(담당자·팀장, 피드백은 팀장만)을 서버가 판단한다.
-- 2027 업무 지도 전환 대비: 카드는 (target_type, target_id)로 대상에 붙는다. 지금은 'rr_item'(team_log_items)만 쓴다.

-- 1) R&R 업무 프로젝트 고정
ALTER TABLE team_log_items ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

-- 2) 회차 카드
CREATE TABLE IF NOT EXISTS rr_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL DEFAULT 'rr_item' CHECK (target_type IN ('rr_item')),
  target_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('plan', 'feedback', 'improve', 'report', 'etc')),
  entry_date date NOT NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  author_id uuid REFERENCES members(id) ON DELETE SET NULL,
  author_name text NOT NULL DEFAULT '',
  version int NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

CREATE INDEX IF NOT EXISTS rr_entries_target_idx ON rr_entries (target_type, target_id, entry_date, created_at);

ALTER TABLE rr_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rr_entries FROM anon, authenticated;
GRANT ALL ON rr_entries TO service_role;

NOTIFY pgrst, 'reload schema';

-- 확인: pinned 칸과 rr_entries 테이블
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'team_log_items' AND column_name = 'pinned') AS pinned_col,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'rr_entries') AS rr_entries_table;
