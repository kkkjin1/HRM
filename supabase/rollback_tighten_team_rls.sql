-- U1 단계 C 되돌리기 — tighten_team_rls.sql의 정책을 걷어내고 예전 auth_all 정책으로 돌린다. Safe to re-run.
-- A 단계(컬럼·연결·함수·members_guard)는 그대로 둔다 — 새 코드는 A만 있으면 동작하고, 신원 컬럼 보호도 유지된다.

DROP POLICY IF EXISTS "members_select" ON members;

DROP POLICY IF EXISTS "members_update_self" ON members;

DROP POLICY IF EXISTS "auth_all" ON members;

CREATE POLICY "auth_all" ON members FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "work_styles_select" ON work_styles;

DROP POLICY IF EXISTS "work_styles_insert_self" ON work_styles;

DROP POLICY IF EXISTS "work_styles_update_self" ON work_styles;

DROP POLICY IF EXISTS "auth_all" ON work_styles;

CREATE POLICY "auth_all" ON work_styles FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "peer_notes_select" ON peer_notes;

DROP POLICY IF EXISTS "peer_notes_insert_self" ON peer_notes;

DROP POLICY IF EXISTS "peer_notes_delete_own" ON peer_notes;

DROP POLICY IF EXISTS "auth_all" ON peer_notes;

CREATE POLICY "auth_all" ON peer_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "johari_picks_own" ON johari_picks;

DROP POLICY IF EXISTS "johari_picks_insert_own" ON johari_picks;

DROP POLICY IF EXISTS "johari_picks_update_own" ON johari_picks;

DROP POLICY IF EXISTS "auth_all" ON johari_picks;

CREATE POLICY "auth_all" ON johari_picks FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "team_health_own" ON team_health_responses;

DROP POLICY IF EXISTS "team_health_insert_own" ON team_health_responses;

DROP POLICY IF EXISTS "team_health_update_own" ON team_health_responses;

DROP POLICY IF EXISTS "auth_all" ON team_health_responses;

CREATE POLICY "auth_all" ON team_health_responses FOR ALL TO authenticated USING (true) WITH CHECK (true);
