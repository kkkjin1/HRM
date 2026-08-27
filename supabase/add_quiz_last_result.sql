-- 다음 판이 이미 시작된 뒤에도 "지난 판 결과"를 언제든 확인할 수 있게 하기 위한 스냅샷 컬럼.
-- 기존 word/drawers/guesser/guess/correct/drawings는 "현재 진행 중인 라운드" 값과 같은 컬럼을
-- 재사용하고 있어서, 다음 startGame()이 호출되는 순간 새 라운드 값으로 덮어써진다.
-- reveal(결과 화면)을 놓친 팀원이 새 라운드가 시작된 뒤에는 지난 결과를 영영 볼 수 없었던
-- 버그의 원인. status가 'reveal'이 되는 시점에 이 컬럼들에 스냅샷을 남기고, 이후 라운드가
-- 몇 번을 더 진행되든 다음 reveal 전까지는 그대로 보존한다.
ALTER TABLE quiz_game ADD COLUMN IF NOT EXISTS last_word text;
ALTER TABLE quiz_game ADD COLUMN IF NOT EXISTS last_drawers jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE quiz_game ADD COLUMN IF NOT EXISTS last_guesser text;
ALTER TABLE quiz_game ADD COLUMN IF NOT EXISTS last_guess text;
ALTER TABLE quiz_game ADD COLUMN IF NOT EXISTS last_correct boolean;
ALTER TABLE quiz_game ADD COLUMN IF NOT EXISTS last_drawings jsonb NOT NULL DEFAULT '[]'::jsonb;
