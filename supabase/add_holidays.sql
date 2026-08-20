CREATE TABLE IF NOT EXISTS team_log_holidays (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE team_log_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_holidays"  ON team_log_holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_holidays" ON team_log_holidays FOR ALL    TO authenticated USING (true);
