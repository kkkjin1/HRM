-- 일정 진행상태(완료/지연/취소) 도장 표시 + 수정 팝업의 진행상태 선택 기능용 컬럼.
ALTER TABLE team_log_schedule
  ADD COLUMN status text CHECK (status IN ('done', 'delayed', 'cancelled'));
