-- 오늘의 한마디에 댓글을 달 수 있게. 사람당 하루 1개(upsert로 수정은 허용).
-- 받은 사람의 댓글은 화면에서 상단 고정으로 보여주기 위해 author_id로 구분한다.

CREATE TABLE IF NOT EXISTS message_comments (
  date date NOT NULL REFERENCES day_state(date) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (date, author_id)
);

ALTER TABLE message_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all" ON message_comments;

CREATE POLICY "auth_all" ON message_comments FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON message_comments TO authenticated;

GRANT ALL ON message_comments TO service_role;
