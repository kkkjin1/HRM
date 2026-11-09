-- 업무 > 루틴 > 연간 "범주표" — 엑셀처럼 A열 = 범주(평가보상·페이롤…), B~M열 = 1~12월 (2026-11-09)
-- 범주는 해마다 같은 목록을 쓴다(연도 무관). 업무(team_log_yearly_tasks)는 category_id 로 범주에 속하고, 없으면 "미분류".
-- 범주를 지우면 그 범주 업무는 미분류로(ON DELETE SET NULL). 처음엔 기본 5개를 넣는다(표가 비어 있을 때만).
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS team_log_yearly_categories (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  sort_order int  NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE team_log_yearly_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON team_log_yearly_categories;
CREATE POLICY "auth_all" ON team_log_yearly_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON team_log_yearly_categories TO service_role, authenticated;

ALTER TABLE team_log_yearly_tasks ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES team_log_yearly_categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS team_log_yearly_tasks_category_idx ON team_log_yearly_tasks (category_id);

INSERT INTO team_log_yearly_categories (name, sort_order)
SELECT v.name, v.ord FROM (VALUES ('평가보상', 0), ('페이롤', 1), ('노무', 2), ('채용', 3), ('기획', 4)) AS v(name, ord)
WHERE NOT EXISTS (SELECT 1 FROM team_log_yearly_categories);

-- 범주 색(2026-11-09 추가) — 화면 팔레트(보라 계열 제외) 중 하나. 비어 있으면 범주 순서대로 채운다.
ALTER TABLE team_log_yearly_categories ADD COLUMN IF NOT EXISTS color text CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');
UPDATE team_log_yearly_categories c SET color = (ARRAY['#2563EB','#4F9A3A','#C2410C','#2F9E9A','#B8860B','#B91C1C','#0E7490','#E8833A','#64748B','#8B5E3C'])[(r.rn % 10) + 1]
FROM (SELECT id, row_number() OVER (ORDER BY sort_order, created_at) - 1 AS rn FROM team_log_yearly_categories) r
WHERE c.id = r.id AND c.color IS NULL;

NOTIFY pgrst, 'reload schema';
