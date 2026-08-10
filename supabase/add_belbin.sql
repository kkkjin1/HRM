-- Belbin 팀 역할 약식 진단 응답. 재응답하면 덮어쓰므로 member_id를 PK로 둔다.
CREATE TABLE IF NOT EXISTS belbin_responses (
  member_id  uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  scores     jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE belbin_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON belbin_responses;
CREATE POLICY "auth_all" ON belbin_responses FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON belbin_responses TO service_role, authenticated;
