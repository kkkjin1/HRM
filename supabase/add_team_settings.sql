-- 팀 공용 화면 설정(키 → 값) — 팀장이 바꾸면 모든 팀원 화면에 똑같이 보인다.
-- 지금은 회의창 박스 순서(key 'meeting_block_order', value ["pinned","today",...])만 쓴다.
-- 읽기·쓰기는 서버 API(/api/team-settings, service_role)만 — 쓰기는 거기서 팀장인지 확인한다. Safe to re-run.
CREATE TABLE IF NOT EXISTS team_log_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 브라우저(로그인 사용자 키)로 직접 바꾸면 팀장 확인을 건너뛰게 되니 막는다 — RLS만 켜고 정책은 두지 않는다.
ALTER TABLE team_log_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON team_log_settings FROM authenticated;
GRANT ALL ON team_log_settings TO service_role;

-- 확인용:
-- SELECT * FROM team_log_settings;
