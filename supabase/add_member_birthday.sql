-- 생일. 연도는 의미 없고 월/일만 비교해서 매년 반복 표시한다 (일정 캘린더의 멤버별 셀).
ALTER TABLE members ADD COLUMN IF NOT EXISTS birthday date;
