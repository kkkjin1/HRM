-- 오늘 하루만 보이는 익명 채팅. 낙서보드(doodle)는 영구 보존이지만, 이건 그날 지나면
-- 화면에서 안 보이게 chat_date로 필터링만 한다(실제 row 삭제는 나중에 배치 정리로 추가 예정).
-- author_id는 저장하지만(악용 방지/추후 관리용) UI에는 절대 표시하지 않는다 — 다만 이 프로젝트
-- RLS가 팀원 전체 read 허용이라 "익명"은 화면상의 약속이지 DB 레벨 익명성은 아니다.

CREATE TABLE anon_chat (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_date  date NOT NULL,
  author_id  uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE anon_chat ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON anon_chat FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON anon_chat TO service_role, authenticated;

CREATE INDEX anon_chat_date_idx ON anon_chat (chat_date);

ALTER PUBLICATION supabase_realtime ADD TABLE anon_chat;
