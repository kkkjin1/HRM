-- 업무 > 연간계획 > 연간 업무: 연간 전체(연도 바 아래)·상반기·하반기 제목 아래 자유 메모 (2026-11-09)
-- 연도·반기(0 = 연간 전체, 1 = 상반기, 2 = 하반기)마다 한 칸. 팀 공용(누구나 읽고 고침), 마지막 저장이 남는다.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS team_log_yearly_notes (
  year       int  NOT NULL,
  half       int  NOT NULL CHECK (half IN (0, 1, 2)),
  body       text NOT NULL DEFAULT '' CHECK (length(body) <= 5000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (year, half)
);
ALTER TABLE team_log_yearly_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON team_log_yearly_notes;
CREATE POLICY "auth_all" ON team_log_yearly_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON team_log_yearly_notes TO service_role, authenticated;

-- 연간 전체 메모(half 0) 추가 — 연도 바 아래 상자
ALTER TABLE team_log_yearly_notes DROP CONSTRAINT IF EXISTS team_log_yearly_notes_half_check;
ALTER TABLE team_log_yearly_notes ADD CONSTRAINT team_log_yearly_notes_half_check CHECK (half IN (0, 1, 2));

NOTIFY pgrst, 'reload schema';
