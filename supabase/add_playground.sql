-- playground: daily position / side / one-line message per member
CREATE TABLE IF NOT EXISTS playground_state (
  member_id  uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  day        date NOT NULL,
  x          real NOT NULL,
  y          real NOT NULL,
  side       text NOT NULL DEFAULT 'night' CHECK (side IN ('night', 'off')),
  message    text CHECK (message IS NULL OR char_length(message) <= 40),
  attempts   int  NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, day)
);

ALTER TABLE playground_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON playground_state;
CREATE POLICY "auth_all" ON playground_state FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON playground_state TO service_role, authenticated;
