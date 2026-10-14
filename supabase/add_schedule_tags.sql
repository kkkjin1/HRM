-- 일정 태그 목록 — 일정 추가 창의 "태그" 드롭다운에 쓰는 팀 공용 목록(편집 가능). Safe to re-run.
-- Apply this BEFORE deploying the app code that uses this table.
-- 휴가 계열(휴가·오전반차·오후반차·오전반반차·오후반반차)은 달력에서 칸 전체를 휴가로 표시하는 특별 처리를 계속 받는다.

CREATE TABLE IF NOT EXISTS team_log_schedule_tags (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE team_log_schedule_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON team_log_schedule_tags;
CREATE POLICY "auth_all" ON team_log_schedule_tags FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON team_log_schedule_tags TO service_role, authenticated;

-- 처음 목록 = 지금까지 쓰던 기본 태그
INSERT INTO team_log_schedule_tags (name, sort_order) VALUES
  ('중간보고', 0), ('최종보고', 1), ('휴가', 2), ('오전반차', 3), ('오후반차', 4), ('오전반반차', 5), ('오후반반차', 6)
ON CONFLICT (name) DO NOTHING;

NOTIFY pgrst, 'reload schema';
