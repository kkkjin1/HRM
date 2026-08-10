-- 팀 페이지: 개인 소개가 아니라 "서로 어떻게 맞물리는가"를 담는다.
-- 1) 팀의 약속(개인 위의 공통 원칙) 2) 주고받음(members 컬럼) 3) 동료가 본 나(peer_notes)

-- 주고받음 — 팀에 보태는 것 / 팀에 기대는 것
ALTER TABLE members ADD COLUMN IF NOT EXISTS gives text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS needs text;

CREATE TABLE IF NOT EXISTS team_principles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content    text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 자기소개가 아니라 동료가 써주는 한 줄. about != author 를 DB에서 강제한다.
CREATE TABLE IF NOT EXISTS peer_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  about_id   uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  content    text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT peer_notes_not_self CHECK (about_id <> author_id)
);

ALTER TABLE team_principles ENABLE ROW LEVEL SECURITY;
ALTER TABLE peer_notes      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all" ON team_principles;
DROP POLICY IF EXISTS "auth_all" ON peer_notes;
CREATE POLICY "auth_all" ON team_principles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON peer_notes      FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON team_principles, peer_notes TO service_role, authenticated;

CREATE INDEX IF NOT EXISTS peer_notes_about_idx ON peer_notes (about_id, created_at DESC);
