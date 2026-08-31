-- 목표 탭의 "회고" 화면 전용 데이터. 월/작성자(owner_key)별로 자유 텍스트 회고 하나씩 저장한다.
-- 목표(team_log_goals) 자체와는 아무 관계가 없다 — 그냥 연도+월+작성자를 키로 쓰는 메모장.
-- owner_key 컬럼은 add_goal_retro_owner_key.sql에서 추가되며 PK도 그때 (year, month, owner_key)로 바뀐다.
CREATE TABLE team_log_goal_retros (
  year int NOT NULL,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  content text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (year, month)
);

ALTER TABLE team_log_goal_retros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON team_log_goal_retros FOR ALL TO authenticated USING (true) WITH CHECK (true);
