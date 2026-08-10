-- 팀 페이지: 개인 소개가 아니라 "서로 어떻게 맞물리는가"를 담는다.
-- 1) 주고받음(members 컬럼) 2) 팀의 약속 3) 동료가 본 나 4) Belbin 역할 진단
--
-- 주의: Supabase SQL Editor는 전체를 한 번에 실행하다 하나라도 실패하면 전부 롤백한다.
-- 그래서 파서가 걸릴 만한 문법(다중 객체 GRANT, <> 연산자, 명명 제약)은 쓰지 않는다.

ALTER TABLE members ADD COLUMN IF NOT EXISTS gives text;

ALTER TABLE members ADD COLUMN IF NOT EXISTS needs text;

CREATE TABLE IF NOT EXISTS team_principles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 자기소개가 아니라 동료가 써주는 한 줄. 자기 자신에 대해서는 못 쓰도록 DB에서 막는다.
CREATE TABLE IF NOT EXISTS peer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  about_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CHECK (about_id != author_id)
);

-- Belbin 팀 역할 약식 진단. 재응답하면 덮어쓰므로 member_id가 PK.
CREATE TABLE IF NOT EXISTS belbin_responses (
  member_id uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  scores jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE team_principles ENABLE ROW LEVEL SECURITY;

ALTER TABLE peer_notes ENABLE ROW LEVEL SECURITY;

ALTER TABLE belbin_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all" ON team_principles;

DROP POLICY IF EXISTS "auth_all" ON peer_notes;

DROP POLICY IF EXISTS "auth_all" ON belbin_responses;

CREATE POLICY "auth_all" ON team_principles FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all" ON peer_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_all" ON belbin_responses FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON team_principles TO authenticated;

GRANT ALL ON team_principles TO service_role;

GRANT ALL ON peer_notes TO authenticated;

GRANT ALL ON peer_notes TO service_role;

GRANT ALL ON belbin_responses TO authenticated;

GRANT ALL ON belbin_responses TO service_role;

CREATE INDEX IF NOT EXISTS peer_notes_about_idx ON peer_notes (about_id, created_at DESC);
