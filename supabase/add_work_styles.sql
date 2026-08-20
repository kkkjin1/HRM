-- "나와 일하는 법" — 추상적 유형 진단 대신 실제 협업에 필요한 구체적 정보.
-- gives_tags/needs_tags: 강점·필요 태그 배열
-- when_stuck/feedback_pref/focus_time/meeting_pref: 협업 방식 선택지
-- growth_edge: 내가 팀에서 잘 못하는 것 (짧은 자유입력)
-- team_request: 팀에 부탁하고 싶은 것 (짧은 자유입력)

CREATE TABLE IF NOT EXISTS work_styles (
  member_id uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  gives_tags text[] NOT NULL DEFAULT '{}',
  needs_tags text[] NOT NULL DEFAULT '{}',
  when_stuck text,
  feedback_pref text,
  focus_time text,
  meeting_pref text,
  growth_edge text,
  team_request text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE work_styles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all" ON work_styles;

CREATE POLICY "auth_all" ON work_styles FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON work_styles TO authenticated;
GRANT ALL ON work_styles TO service_role;
