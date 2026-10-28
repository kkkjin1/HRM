-- U1 단계 C. 팀 프로필·동료 메시지·기존 익명 응답의 DB 권한(RLS) 강화. Safe to re-run.
-- 반드시 (A) add_auth_identity.sql + verify 확인 + (B) 새 코드 배포·확인 뒤에 실행한다.
--   - 예전 코드(브라우저가 members를 직접 추가·삭제, 조하리·건강도 원본 전체 조회)는 이 단계 뒤 동작하지 않는다.
--   - current_member_id()가 NULL인 계정(연결 안 됨·퇴사)은 아래 쓰기가 모두 막힌다.
--
-- 바뀌는 것 (모두 브라우저 = authenticated 기준. 서버 API의 service_role은 RLS를 거치지 않으므로 영향 없음)
--   members                : 읽기 전원 / 수정은 본인 행만(role·연결·권한·퇴사는 A의 members_guard가 별도로 막음) / 추가·삭제 불가
--   work_styles            : 읽기 전원 / 쓰기는 본인 행만 / 삭제 불가
--   peer_notes             : 읽기 전원 / 작성은 본인 이름으로만(남 사칭 불가) / 삭제는 작성자만 / 수정 불가
--   johari_picks           : 내가 쓴 행만 읽기·쓰기. 남의 선택(작성자 포함)은 johari_summary() 집계로만
--   team_health_responses  : 내 응답만 읽기·쓰기. 팀 결과는 team_health_summary() 집계로만
-- 되돌리기: rollback_tighten_team_rls.sql

-- ── members ──
DROP POLICY IF EXISTS "auth_all" ON members;

DROP POLICY IF EXISTS "members_select" ON members;

DROP POLICY IF EXISTS "members_update_self" ON members;

CREATE POLICY "members_select" ON members FOR SELECT TO authenticated USING (true);

CREATE POLICY "members_update_self" ON members FOR UPDATE TO authenticated
  USING (id = current_member_id()) WITH CHECK (id = current_member_id());

-- ── work_styles ──
DROP POLICY IF EXISTS "auth_all" ON work_styles;

DROP POLICY IF EXISTS "work_styles_select" ON work_styles;

DROP POLICY IF EXISTS "work_styles_insert_self" ON work_styles;

DROP POLICY IF EXISTS "work_styles_update_self" ON work_styles;

CREATE POLICY "work_styles_select" ON work_styles FOR SELECT TO authenticated USING (true);

CREATE POLICY "work_styles_insert_self" ON work_styles FOR INSERT TO authenticated
  WITH CHECK (member_id = current_member_id());

CREATE POLICY "work_styles_update_self" ON work_styles FOR UPDATE TO authenticated
  USING (member_id = current_member_id()) WITH CHECK (member_id = current_member_id());

-- ── peer_notes ──
DROP POLICY IF EXISTS "auth_all" ON peer_notes;

DROP POLICY IF EXISTS "peer_notes_select" ON peer_notes;

DROP POLICY IF EXISTS "peer_notes_insert_self" ON peer_notes;

DROP POLICY IF EXISTS "peer_notes_delete_own" ON peer_notes;

CREATE POLICY "peer_notes_select" ON peer_notes FOR SELECT TO authenticated USING (true);

CREATE POLICY "peer_notes_insert_self" ON peer_notes FOR INSERT TO authenticated
  WITH CHECK (author_id = current_member_id() AND about_id != author_id);

CREATE POLICY "peer_notes_delete_own" ON peer_notes FOR DELETE TO authenticated
  USING (author_id = current_member_id());

-- ── johari_picks (기존 익명 안내 데이터 — 작성자 비공개) ──
DROP POLICY IF EXISTS "auth_all" ON johari_picks;

DROP POLICY IF EXISTS "johari_picks_own" ON johari_picks;

DROP POLICY IF EXISTS "johari_picks_insert_own" ON johari_picks;

DROP POLICY IF EXISTS "johari_picks_update_own" ON johari_picks;

CREATE POLICY "johari_picks_own" ON johari_picks FOR SELECT TO authenticated
  USING (author_id = current_member_id());

CREATE POLICY "johari_picks_insert_own" ON johari_picks FOR INSERT TO authenticated
  WITH CHECK (author_id = current_member_id());

CREATE POLICY "johari_picks_update_own" ON johari_picks FOR UPDATE TO authenticated
  USING (author_id = current_member_id()) WITH CHECK (author_id = current_member_id());

-- ── team_health_responses (기존 익명 안내 데이터 — 개별 응답 비공개) ──
DROP POLICY IF EXISTS "auth_all" ON team_health_responses;

DROP POLICY IF EXISTS "team_health_own" ON team_health_responses;

DROP POLICY IF EXISTS "team_health_insert_own" ON team_health_responses;

DROP POLICY IF EXISTS "team_health_update_own" ON team_health_responses;

CREATE POLICY "team_health_own" ON team_health_responses FOR SELECT TO authenticated
  USING (member_id = current_member_id());

CREATE POLICY "team_health_insert_own" ON team_health_responses FOR INSERT TO authenticated
  WITH CHECK (member_id = current_member_id());

CREATE POLICY "team_health_update_own" ON team_health_responses FOR UPDATE TO authenticated
  USING (member_id = current_member_id()) WITH CHECK (member_id = current_member_id());

-- 확인: verify_auth_identity.sql 의 정책 목록
