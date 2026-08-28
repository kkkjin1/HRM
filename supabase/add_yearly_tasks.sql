-- 업무 탭 > 캘린더 서브탭의 "연간" 화면: 연도별 1~12월 중요 업무 리스트(담당자 없이 텍스트만).
CREATE TABLE team_log_yearly_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  year int NOT NULL,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  title text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE team_log_yearly_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON team_log_yearly_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX team_log_yearly_tasks_year_month_idx ON team_log_yearly_tasks (year, month);

GRANT ALL ON team_log_yearly_tasks TO service_role, authenticated;
