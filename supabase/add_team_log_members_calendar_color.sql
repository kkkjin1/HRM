-- 팀 달력(업무 > 요약)에서 팀원이 직접 고르는 달력 전용 색(#RRGGBB).
-- null이면 color_key 순번의 기본색을 쓴다. color_key는 루틴 달력 등 다른 화면도 쓰므로 그대로 둔다.
ALTER TABLE team_log_members ADD COLUMN IF NOT EXISTS calendar_color text;
