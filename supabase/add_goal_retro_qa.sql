-- 월 회고 개인회고 카드 하단의 "서로 질문/답변" 데이터. 질문자(asker)가 회고 작성자(target)에게
-- 남기는 질문 하나와 그에 대한 답변 하나를 (연/월/질문자/대상) 단위로 저장한다.
-- team_log_goal_retros(팀/개인 회고 본문)와는 별개 테이블 — 질문/답변은 작성 권한 주체가
-- asker와 target으로 서로 다르기 때문에 owner_key 하나로는 표현할 수 없다.
CREATE TABLE team_log_goal_retro_qa (
  year int NOT NULL,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  asker_id text NOT NULL,
  target_id text NOT NULL,
  question text NOT NULL DEFAULT '',
  answer text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (year, month, asker_id, target_id)
);

ALTER TABLE team_log_goal_retro_qa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON team_log_goal_retro_qa FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON team_log_goal_retro_qa TO service_role, authenticated;
