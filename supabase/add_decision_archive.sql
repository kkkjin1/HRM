-- 회의 결정사항 → 아카이빙 "정리 필요" 목록. Safe to re-run.
-- Apply this BEFORE deploying the app code that reads these columns.
--
-- archived_at IS NULL 인 결정사항(kind = 'decision')이 아카이빙의 "정리 필요"에 모인다.
-- "사례로 정리"하면 archive_case_id에 만든 사례를, "정리 안 함"이면 archived_at만 남긴다.

ALTER TABLE team_log_meeting_items ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE team_log_meeting_items ADD COLUMN IF NOT EXISTS archive_case_id uuid REFERENCES team_log_archive_cases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS team_log_meeting_items_pending_decision_idx
  ON team_log_meeting_items (created_at) WHERE kind = 'decision' AND archived_at IS NULL;

NOTIFY pgrst, 'reload schema';
