-- 조하리 창 약식. (about_id, author_id) 한 쌍당 한 행 — 다시 고르면 덮어쓴다.
-- peer_notes와 달리 about_id = author_id 를 허용한다 (자기 자신에 대한 선택 = self).

CREATE TABLE IF NOT EXISTS johari_picks (
  about_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  traits text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (about_id, author_id)
);

ALTER TABLE johari_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all" ON johari_picks;

CREATE POLICY "auth_all" ON johari_picks FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON johari_picks TO authenticated;

GRANT ALL ON johari_picks TO service_role;
