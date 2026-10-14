-- 고정 안건 "방식" — 회의마다 바뀌지 않고 그 안건에 계속 붙는 자유 텍스트(예: "근태 대시보드 캡처 공유"). Safe to re-run.
-- Apply this BEFORE deploying the app code that reads the note column.

ALTER TABLE team_log_report_items ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '';

NOTIFY pgrst, 'reload schema';
