-- 목표(Goals) 4단계 계층: 연간 → 반기 → 분기 → 월. 각 단계는 여러 개 존재할 수 있고,
-- parent_id로 상위 목표와 연결된다 (자기참조 FK, ON DELETE CASCADE로 하위 목표까지 함께 삭제 가능).
CREATE TABLE team_log_goals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  level text NOT NULL CHECK (level IN ('yearly', 'half', 'quarter', 'month')),
  parent_id uuid REFERENCES team_log_goals(id) ON DELETE CASCADE,
  year int NOT NULL,
  half text CHECK (half IN ('h1', 'h2')),
  quarter int CHECK (quarter BETWEEN 1 AND 4),
  month int CHECK (month BETWEEN 1 AND 12),
  icon text NOT NULL DEFAULT '🎯',
  description text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE team_log_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON team_log_goals FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX team_log_goals_parent_idx ON team_log_goals (parent_id, sort_order);
CREATE INDEX team_log_goals_year_idx ON team_log_goals (year);
