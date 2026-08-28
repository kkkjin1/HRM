-- 캘린더 루틴 업무에 담당자를 최대 2명까지 지정할 수 있도록 assignee(text) → assignees(text[])로 변경.
ALTER TABLE team_log_routine_tasks ADD COLUMN assignees text[] NOT NULL DEFAULT '{}';

UPDATE team_log_routine_tasks SET assignees = ARRAY[assignee] WHERE assignee IS NOT NULL;

DROP INDEX IF EXISTS team_log_routine_tasks_assignee_idx;
ALTER TABLE team_log_routine_tasks DROP COLUMN assignee;
CREATE INDEX team_log_routine_tasks_assignees_idx ON team_log_routine_tasks USING GIN (assignees);
