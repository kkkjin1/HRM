-- 2026-10-22 Member back number (baseball jersey). Safe to re-run.
-- NULL = not chosen (the app falls back to a number derived from the name). 0-99, no two members share a number.
ALTER TABLE members ADD COLUMN IF NOT EXISTS back_number int CHECK (back_number IS NULL OR (back_number >= 0 AND back_number <= 99));
CREATE UNIQUE INDEX IF NOT EXISTS members_back_number_key ON members (back_number) WHERE back_number IS NOT NULL;
