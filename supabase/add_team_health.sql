-- 팀 건강도 진단(Lencioni 약식). 반기(period)별로 다시 진단해 추이를 본다.
-- 개별 응답은 화면에 절대 노출하지 않고 집계만 쓴다 — 익명이 아니면 솔직한 응답이 안 나온다.
-- (member_id는 '누가 아직 응답 안 했는지'를 알기 위해서만 쓴다.)

CREATE TABLE IF NOT EXISTS team_health_responses (
  period text NOT NULL,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (period, member_id)
);

ALTER TABLE team_health_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all" ON team_health_responses;

CREATE POLICY "auth_all" ON team_health_responses FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON team_health_responses TO authenticated;

GRANT ALL ON team_health_responses TO service_role;
