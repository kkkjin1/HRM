-- 안건 담당자 여러 명 — member_id는 첫 번째(대표) 담당자로 그대로 두고, 나머지 담당자를 co_member_ids에 둔다.
-- 기존 행은 빈 배열로 시작하므로 지금 화면·데이터는 그대로다.
ALTER TABLE team_log_report_items ADD COLUMN IF NOT EXISTS co_member_ids uuid[] NOT NULL DEFAULT '{}';

-- 확인용:
-- SELECT title, member_id, co_member_ids, assigned_on FROM team_log_report_items WHERE kind = 'agenda' ORDER BY start_date DESC LIMIT 20;
