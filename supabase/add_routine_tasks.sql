-- 업무 탭의 "캘린더" 서브탭: 팀원들이 직접 입력하는 월별 루틴 업무.
-- 반복 안 함 → task_date에 특정 날짜, 반복(주 단위) → weekday, 반복(월 단위) → month_day/month_last_day로
-- 매월 표시할 날짜를 계산한다. 세 조합 중 정확히 하나만 채워지도록 API 레이어에서 검증한다.
CREATE TABLE team_log_routine_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  assignee text NOT NULL,
  repeat_enabled boolean NOT NULL DEFAULT false,
  repeat_unit text CHECK (repeat_unit IN ('week', 'month')),
  weekday int CHECK (weekday BETWEEN 0 AND 6),
  month_day int CHECK (month_day BETWEEN 1 AND 31),
  month_last_day boolean NOT NULL DEFAULT false,
  task_date date,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE team_log_routine_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON team_log_routine_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX team_log_routine_tasks_assignee_idx ON team_log_routine_tasks (assignee);
