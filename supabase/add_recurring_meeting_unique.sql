-- 고정회의(요일 반복) 중복 생성 방지.
-- 회의 목록 조회(GET /api/meetings)가 "없는 날짜 확인 → 추가"를 하는데, 요청 둘이 거의 동시에 오면 둘 다 없다고 보고
-- 같은 회의를 두 번 넣었다(2026-11-09 위클리미팅 2건, 2026-09-14 생성). 고정회의 표시(is_recurring)를 두고
-- 그 행끼리만 (제목, 날짜) 유일 조건을 건다 — 직접 만든 회의('제목 없음' 등)는 같은 날 여러 개 만들 수 있게 둔다.

ALTER TABLE team_log_meetings ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false;

-- 기존 고정회의 표시 (route.ts RECURRING_MEETINGS 제목)
UPDATE team_log_meetings SET is_recurring = true WHERE title = '인사관리팀 위클리미팅';

CREATE UNIQUE INDEX IF NOT EXISTS team_log_meetings_recurring_unique
  ON team_log_meetings (title, meeting_date) WHERE is_recurring;

NOTIFY pgrst, 'reload schema';

-- 확인: 고정회의 수와, (제목, 날짜) 중복이 0건인지
SELECT count(*) AS recurring_rows,
       count(*) - count(DISTINCT (title, meeting_date)) AS duplicates
  FROM team_log_meetings WHERE is_recurring;
