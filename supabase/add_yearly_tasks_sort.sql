-- 업무 > 루틴 > 연간: 월별 목록 ⠿ 끌어서 순서 바꾸기·다른 달로 옮기기 + 월 미정 보관함(month 0) (2026-11-09)
-- sort_order = 같은 연·월 안의 순서(0부터). 기존 행은 만든 순서대로 채운다.
-- Safe to re-run (이미 있으면 칸 추가는 건너뛰고, 순서가 비어 있는 행만 채움).

ALTER TABLE team_log_yearly_tasks ADD COLUMN IF NOT EXISTS sort_order int;

UPDATE team_log_yearly_tasks t SET sort_order = r.rn
FROM (
  SELECT id, row_number() OVER (PARTITION BY year, month ORDER BY created_at, id) - 1 AS rn
  FROM team_log_yearly_tasks
) r
WHERE t.id = r.id AND t.sort_order IS NULL;

ALTER TABLE team_log_yearly_tasks ALTER COLUMN sort_order SET DEFAULT 0;

-- month 0 = "📌 연간(월 미정)" 보관함 — 월을 아직 안 정한 업무. 끌어서 1~12월로 옮긴다.
ALTER TABLE team_log_yearly_tasks DROP CONSTRAINT IF EXISTS team_log_yearly_tasks_month_check;
ALTER TABLE team_log_yearly_tasks ADD CONSTRAINT team_log_yearly_tasks_month_check CHECK (month BETWEEN 0 AND 12);

NOTIFY pgrst, 'reload schema';
