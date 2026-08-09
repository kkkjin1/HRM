CREATE TABLE IF NOT EXISTS team_log_family_days (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL UNIQUE,
  note text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE team_log_family_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_family_days"  ON team_log_family_days FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_family_days" ON team_log_family_days FOR ALL    TO authenticated USING (true);
