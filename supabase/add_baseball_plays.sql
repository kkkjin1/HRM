-- 비거리 야구(개인전 · 하루 단위 라운드). 게임 1판(3구) = 1행.
-- 각자 자기 PC에서 혼자 치고 결과만 모인다 — 오늘 라운드 목록/랭킹은 play_date=오늘 행으로 계산,
-- 누적 탭은 전체 행으로 계산한다. 하루 게임 수 = 1 + 누적 칭찬 4개당 1 (최대 5)는 클라이언트에서 계산하고,
-- UNIQUE(member_id, play_date, game_no)로 탭 두 개에서 동시에 시작해도 같은 판이 두 번 생기지 않게 막는다.
-- (2026-09-29 초기 설계였던 baseball_game/baseball_records는 테스트 데이터뿐이라 삭제)
-- 2026-09-29 Supabase SQL Editor에서 실행 완료.

DROP TABLE IF EXISTS baseball_records;
DROP TABLE IF EXISTS baseball_game;

CREATE TABLE IF NOT EXISTS baseball_plays (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  play_date     date NOT NULL,
  game_no       int NOT NULL,                       -- 그날 몇 번째 게임 (1~5)
  swings        jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{type, speed, outcome, distance, offset}] 최대 3개
  homeruns      int NOT NULL DEFAULT 0,
  hits          int NOT NULL DEFAULT 0,             -- 홈런 제외 안타
  best_distance numeric(5,1) NOT NULL DEFAULT 0,
  finished      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  UNIQUE (member_id, play_date, game_no)
);
CREATE INDEX IF NOT EXISTS baseball_plays_date_idx ON baseball_plays (play_date);

ALTER TABLE baseball_plays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON baseball_plays FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON baseball_plays TO service_role, authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE baseball_plays;
ALTER TABLE baseball_plays REPLICA IDENTITY FULL;
