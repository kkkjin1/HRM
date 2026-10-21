-- 오늘 안건 → 담당자 화면으로 넘기기 위한 "담당자 지정일". Safe to re-run.
-- Apply this BEFORE deploying the app code that reads the assigned_on column.
--
-- 안건(kind = 'agenda')에 담당자를 정한 회의 날짜. 그 회의까지는 오늘 안건 표와 담당자 업무보고 묶음 양쪽에 보이고,
-- 그다음 회의(날짜가 더 늦은 회의)부터는 오늘 안건에서 빠지고 담당자 묶음 맨 위에만 남는다.
-- 담당자를 "없음"으로 바꾸면 NULL로 돌아가 다시 오늘 안건에 보인다.

ALTER TABLE team_log_report_items ADD COLUMN IF NOT EXISTS assigned_on date;

-- 이미 담당자가 있는 안건은 지정일을 모르니 안건을 만든 회의 날짜(start_date)로 채운다.
UPDATE team_log_report_items
SET assigned_on = start_date
WHERE kind = 'agenda' AND member_id IS NOT NULL AND assigned_on IS NULL;

NOTIFY pgrst, 'reload schema';

-- Check after running (expect assigned_on filled on every agenda row that has member_id):
-- SELECT title, member_id, start_date, assigned_on, closed_on, pinned FROM team_log_report_items WHERE kind = 'agenda' ORDER BY start_date;
