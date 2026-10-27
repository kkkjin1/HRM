-- 커뮤니티데이 — 기본은 매월 마지막 주 목요일(화면이 계산). 날짜를 옮긴 달만 여기에 남는다(month 'YYYY-MM' → date).
CREATE TABLE IF NOT EXISTS team_log_community_days (
  month      text PRIMARY KEY CHECK (month ~ '^[0-9]{4}-[0-9]{2}$'),
  date       date NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE team_log_community_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON team_log_community_days;
CREATE POLICY "auth_all" ON team_log_community_days FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON team_log_community_days TO service_role, authenticated;

-- 확인용:
-- SELECT * FROM team_log_community_days ORDER BY month;
