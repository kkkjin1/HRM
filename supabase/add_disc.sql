-- DISC 팀 성향 진단. 재응답하면 덮어쓰므로 member_id가 PK.
-- answers: {D1: 3, D2: 5, ..., C5: 4} — 20문항 응답 raw
-- scores: {D: 18, I: 12, S: 20, C: 15} — 유형별 합산 점수

CREATE TABLE IF NOT EXISTS disc_responses (
  member_id uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}',
  scores jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE disc_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all" ON disc_responses;

CREATE POLICY "auth_all" ON disc_responses FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON disc_responses TO authenticated;
GRANT ALL ON disc_responses TO service_role;
