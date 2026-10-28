-- 개인업무 탭의 "자유노트" — 팀원마다 여러 장을 쓸 수 있다. 다른 사람 것은 보이지 않는다.
-- member_name은 다른 team_log_* 표들의 assignee와 같은 방식(이름 문자열)으로 맞춘다 — API(/api/personal-note)가
-- 로그인 이름으로 본인 행만 읽고 쓴다. Safe to re-run(이전 "팀원당 한 칸" 버전에서도 안전하게 바뀐다).

CREATE TABLE IF NOT EXISTS team_log_personal_notes (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_name text NOT NULL,
  title       text NOT NULL DEFAULT '',
  content     text NOT NULL DEFAULT '',
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 이전 "팀원당 한 칸"(member_name UNIQUE) 버전, "제목 칸 없음" 버전에서 바뀌는 경우를 위한 보정.
ALTER TABLE team_log_personal_notes DROP CONSTRAINT IF EXISTS team_log_personal_notes_member_name_key;
ALTER TABLE team_log_personal_notes ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';
ALTER TABLE team_log_personal_notes ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;
ALTER TABLE team_log_personal_notes ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_team_log_personal_notes_member ON team_log_personal_notes(member_name);

-- 개인 메모라 브라우저(로그인 사용자 키)에서는 직접 못 읽게 막는다 — 읽기·쓰기는 서버 API(service_role)만.
-- RLS를 켜 두고 정책을 두지 않으면 authenticated는 행이 하나도 안 보인다. 권한도 회수해 이중으로 막는다.
ALTER TABLE team_log_personal_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all" ON team_log_personal_notes;
REVOKE ALL ON team_log_personal_notes FROM authenticated;

GRANT ALL ON team_log_personal_notes TO service_role;
