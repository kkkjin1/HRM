-- R&R 메모: 피드백을 별도 카드가 아니라 회차 카드 안의 칸으로(카드 오른쪽, 팀장만 작성).
-- 본문(version)과 피드백(feedback_version)은 따로 충돌을 막는다 — 담당자가 본문을 고치는 동안 팀장이 같은 카드에 피드백을 써도 된다.
-- 이력(백업)에도 피드백을 같이 남긴다.

ALTER TABLE rr_entries ADD COLUMN IF NOT EXISTS feedback text NOT NULL DEFAULT '';
ALTER TABLE rr_entries ADD COLUMN IF NOT EXISTS feedback_version int NOT NULL DEFAULT 0;
ALTER TABLE rr_entries ADD COLUMN IF NOT EXISTS feedback_by text;
ALTER TABLE rr_entries ADD COLUMN IF NOT EXISTS feedback_at timestamptz;

ALTER TABLE rr_entry_history ADD COLUMN IF NOT EXISTS feedback text NOT NULL DEFAULT '';
ALTER TABLE rr_entry_history ADD COLUMN IF NOT EXISTS feedback_version int NOT NULL DEFAULT 0;
ALTER TABLE rr_entry_history DROP CONSTRAINT IF EXISTS rr_entry_history_reason_check;
ALTER TABLE rr_entry_history ADD CONSTRAINT rr_entry_history_reason_check CHECK (reason IN ('edit', 'feedback', 'restore', 'delete'));

NOTIFY pgrst, 'reload schema';

SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'rr_entries' AND column_name LIKE 'feedback%') AS entry_feedback_cols,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'rr_entry_history' AND column_name LIKE 'feedback%') AS history_feedback_cols;
