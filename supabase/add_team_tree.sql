-- 팀 나무 심기. 나무는 팀 전체에 한 그루(team_tree 1행)만 존재하고, 팀원이 하루에 한 번씩
-- 물을 주면(team_tree_waterings 1행) 누적 물주기 횟수만큼 자란다 — 성장 단계는 프론트
-- (components/TeamTree.tsx)에서 총 물주기 수를 기준으로 계산한다.

CREATE TABLE team_tree (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE team_tree_waterings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id      uuid NOT NULL REFERENCES team_tree(id) ON DELETE CASCADE,
  member_id    uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  watered_date date NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tree_id, member_id, watered_date)
);

ALTER TABLE team_tree          ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_tree_waterings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON team_tree          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON team_tree_waterings FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON team_tree, team_tree_waterings TO service_role, authenticated;

CREATE INDEX team_tree_waterings_tree_idx ON team_tree_waterings (tree_id);
CREATE INDEX team_tree_waterings_date_idx ON team_tree_waterings (watered_date);

-- 팀원이 매일 물 주는 걸 실시간으로 반영 (다른 팀원이 물 주면 내 화면도 바로 자란다).
ALTER PUBLICATION supabase_realtime ADD TABLE team_tree_waterings;

-- 나무는 한 그루만 심는다.
INSERT INTO team_tree DEFAULT VALUES;
