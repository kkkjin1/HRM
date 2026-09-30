-- 비거리 야구 1:1 실시간 대결 + 토너먼트. 2026-09-30 Supabase SQL Editor에서 실행 완료.
-- baseball_duels 1행 = 경기 1개. halves[h] = h번째 반 이닝의 투구 이벤트(짝수 = 초: 도전자 투구/상대 타격, 홀수 = 말: 반대),
-- pitch = 지금 날아가는 공(투수가 싣고, 타자 PC가 판정 후 비움). 타자·관전자는 pitch를 처음 본 순간부터 로컬 애니메이션.
-- rps: 토너먼트에서 연장·안타 수까지 같을 때 가위바위보 상태 (2026-09-30 추가·실행 완료)
-- baseball_tournaments: 참가 신청(entrants) → 시작 시 홀수면 랜덤 1명 제외(excluded_id, 우승자 베팅 bet_pick만 가능) → 대진(bracket).

CREATE TABLE IF NOT EXISTS baseball_tournaments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status       text NOT NULL DEFAULT 'recruiting',
  created_by   uuid REFERENCES members(id) ON DELETE SET NULL,
  entrants     jsonb NOT NULL DEFAULT '[]'::jsonb,
  players      jsonb NOT NULL DEFAULT '[]'::jsonb,
  excluded_id  uuid,
  bet_pick     uuid,
  bracket      jsonb NOT NULL DEFAULT '[]'::jsonb,
  champion_id  uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS baseball_duels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   uuid REFERENCES baseball_tournaments(id) ON DELETE CASCADE,
  round           int,
  match_no        int,
  challenger_id   uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  opponent_id     uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'invited',
  halves          jsonb NOT NULL DEFAULT '[[]]'::jsonb,
  pitch           jsonb,
  challenger_runs int NOT NULL DEFAULT 0,
  opponent_runs   int NOT NULL DEFAULT 0,
  winner_id       uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS baseball_duels_status_idx ON baseball_duels (status);

ALTER TABLE baseball_tournaments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON baseball_tournaments;
CREATE POLICY "auth_all" ON baseball_tournaments FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON baseball_tournaments TO service_role, authenticated;

ALTER TABLE baseball_duels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON baseball_duels;
CREATE POLICY "auth_all" ON baseball_duels FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON baseball_duels TO service_role, authenticated;

ALTER TABLE baseball_tournaments REPLICA IDENTITY FULL;
ALTER TABLE baseball_duels REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE baseball_tournaments, baseball_duels;

ALTER TABLE baseball_duels ADD COLUMN IF NOT EXISTS rps jsonb;
