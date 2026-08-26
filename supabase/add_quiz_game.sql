-- 연상퀴즈(그림 전달)를 "한 기기를 돌려쓰는 게임"에서 "각자 자기 PC에서 실시간 동기화되는 게임"으로
-- 전환하기 위한 상태 테이블. 팀 전체가 공유하는 게임은 항상 하나뿐이라 싱글턴 row(id='main')로 관리하고,
-- Realtime UPDATE를 구독해 모든 클라이언트가 같은 상태(누구 차례인지/타이머/그림/정답)를 따라간다.

DROP TABLE IF EXISTS quiz_game CASCADE;
DROP TABLE IF EXISTS quiz_meta CASCADE;

CREATE TABLE quiz_game (
  id              text PRIMARY KEY DEFAULT 'main',
  status          text NOT NULL DEFAULT 'setup', -- setup | drawing | guessing | reveal
  present_members jsonb NOT NULL DEFAULT '[]'::jsonb,
  guesser         text,
  drawers         jsonb NOT NULL DEFAULT '[]'::jsonb, -- 그리는 순서 (이름 배열)
  word            text,
  round           int NOT NULL DEFAULT 0,
  drawings        jsonb NOT NULL DEFAULT '[]'::jsonb, -- dataURL 배열, round 순서대로 누적
  guess           text,
  correct         boolean,
  phase_deadline  timestamptz, -- 현재 라운드(그리기/정답 맞추기) 종료 시각. 전 클라이언트가 이 값으로 타이머를 동기화.
  started_by      text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
INSERT INTO quiz_game (id) VALUES ('main');

-- 같은 사람이 연속으로 정답자/첫 드로어가 되거나 같은 단어가 바로 다시 나오는 걸 피하기 위한
-- 최근 이력. 이전에는 기기별 localStorage(hrm_dg_used_words)로만 관리해서 팀원이 서로 다른 기기로
-- 접속하면 무의미했다 — 이제 "주사위를 굴리는 사람이 누구든" 팀 전체 기준으로 공정하게 순환하도록
-- 서버에 둔다.
CREATE TABLE quiz_meta (
  id               text PRIMARY KEY DEFAULT 'main',
  used_words       jsonb NOT NULL DEFAULT '[]'::jsonb,
  recent_guessers  jsonb NOT NULL DEFAULT '[]'::jsonb, -- 최근 정답자 이름(최대 3개, 최신이 뒤)
  recent_firsts    jsonb NOT NULL DEFAULT '[]'::jsonb, -- 최근 "첫 드로어" 이름(최대 3개, 최신이 뒤)
  updated_at       timestamptz NOT NULL DEFAULT now()
);
INSERT INTO quiz_meta (id) VALUES ('main');

ALTER TABLE quiz_game ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON quiz_game FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON quiz_game TO service_role, authenticated;

ALTER TABLE quiz_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON quiz_meta FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON quiz_meta TO service_role, authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE quiz_game;
