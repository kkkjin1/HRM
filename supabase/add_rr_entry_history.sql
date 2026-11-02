-- R&R 메모 회차 카드 변경 이력(백업). 카드를 고칠 때 바뀌기 전 내용을 남겨, 카드의 "이력"에서 예전 버전을 보고 되돌린다.
-- 자동 저장이 잦아서 매 저장마다가 아니라: 직전 이력보다 10분 넘게 지났을 때 / 다른 사람이 쓴 내용을 덮어쓸 때 / 되돌리기·삭제 직전에만 남긴다.
-- 카드를 지워도 이력은 남도록 FK를 걸지 않는다(삭제 직전 내용도 reason='delete'로 남음).

CREATE TABLE IF NOT EXISTS rr_entry_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL,
  target_id uuid NOT NULL,
  kind text NOT NULL,
  entry_date date NOT NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  version int NOT NULL,
  saved_by text,             -- 이 내용을 마지막으로 저장한 사람
  saved_at timestamptz,      -- 이 내용이 저장된 시각
  reason text NOT NULL DEFAULT 'edit' CHECK (reason IN ('edit', 'restore', 'delete')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rr_entry_history_entry_idx ON rr_entry_history (entry_id, created_at DESC);

ALTER TABLE rr_entry_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rr_entry_history FROM anon, authenticated;
GRANT ALL ON rr_entry_history TO service_role;

NOTIFY pgrst, 'reload schema';

SELECT count(*) AS rr_entry_history_table FROM information_schema.tables WHERE table_name = 'rr_entry_history';
