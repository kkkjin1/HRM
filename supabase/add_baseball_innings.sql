-- 비거리 야구 3타석제(볼카운트·주자·득점) + 관리자(김진일) 전용 "오늘 게임 횟수 추가".
-- baseball_plays.swings에는 투구 이벤트(스윙/루킹/볼/사구)가 순서대로 쌓이고, 타석·주자·득점은
-- 클라이언트가 그 이벤트를 재생해 계산한다. runs/lob는 랭킹 정렬·표시용으로 같이 저장한다.
-- baseball_bonus: 팀원별·날짜(서버 날짜, KST)별 추가 게임 수. 읽기는 전원, 쓰기는 DB 정책으로 김진일 계정만.

-- 2026-09-29 Supabase SQL Editor에서 실행 완료.
ALTER TABLE baseball_plays ADD COLUMN IF NOT EXISTS runs int NOT NULL DEFAULT 0; -- 득점
ALTER TABLE baseball_plays ADD COLUMN IF NOT EXISTS lob int NOT NULL DEFAULT 0;  -- 잔루

CREATE TABLE IF NOT EXISTS baseball_bonus (
  member_id  uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  play_date  date NOT NULL,
  extra      int NOT NULL DEFAULT 0 CHECK (extra >= 0 AND extra <= 20),
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, play_date)
);
ALTER TABLE baseball_bonus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all" ON baseball_bonus FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_write" ON baseball_bonus FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'email') = 'ji.kim@egnis.kr')
  WITH CHECK ((auth.jwt() ->> 'email') = 'ji.kim@egnis.kr');
GRANT ALL ON baseball_bonus TO service_role, authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE baseball_bonus;
