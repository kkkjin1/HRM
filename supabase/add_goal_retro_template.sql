-- 개인 회고 작성 시 참고하는 공통 질문 양식. 월/작성자 구분 없이 팀 전체가 공유하는 문서 한 장이라
-- team_log_goal_retros(연/월/작성자별 회고 본문)와는 별개의 싱글턴 테이블로 둔다.
-- 내용은 사용자가 직접 채워 넣는다 — 앱에서 기본 텍스트를 넣지 않는다.
CREATE TABLE team_log_goal_retro_template (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  content text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

INSERT INTO team_log_goal_retro_template (id, content) VALUES (1, '');

ALTER TABLE team_log_goal_retro_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON team_log_goal_retro_template FOR ALL TO authenticated USING (true) WITH CHECK (true);
