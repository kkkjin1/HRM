-- U1 확인용 (읽기 전용 — 아무것도 바꾸지 않는다). add_auth_identity.sql 직후와 tighten_team_rls.sql 직후에 각각 실행한다.

-- 1) 계정 연결 상태: 재직자 전원 linked = true, 팀원 관리 권한(can_manage_members)은 팀장·파트장 2명만 true 여야 다음 단계로 간다.
SELECT m.name, m.role, m.left_at, (m.auth_user_id IS NOT NULL) AS linked, m.can_manage_members,
       (u.raw_user_meta_data ->> 'name') AS auth_name
FROM members m LEFT JOIN auth.users u ON u.id = m.auth_user_id
ORDER BY m.created_at;

-- 2) 연결되지 않은 로그인 계정 (있으면 팀원 관리 화면에서 수동 연결)
SELECT u.id, u.raw_user_meta_data ->> 'name' AS auth_name, u.last_sign_in_at
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM members m WHERE m.auth_user_id = u.id);

-- 3) 업무 팀원 ↔ 프로필 팀원 연결 (member_id 비어 있는 행이 없어야 한다)
SELECT t.name, t.member_id IS NOT NULL AS linked FROM team_log_members t ORDER BY t.sort_order;

-- 4) 정책 목록 (tighten 후: 다섯 테이블에 auth_all이 없어야 한다)
SELECT c.relname AS table_name, c.relrowsecurity AS rls_on, p.policyname, p.cmd, p.roles
FROM pg_class c
LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = c.relname
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname IN ('members', 'work_styles', 'peer_notes', 'johari_picks', 'team_health_responses')
ORDER BY 1, 3;

-- 5) 함수·트리거 존재
SELECT proname FROM pg_proc
WHERE proname IN ('current_member_id', 'is_lead', 'team_health_summary', 'johari_summary', 'members_guard')
ORDER BY 1;

SELECT tgname FROM pg_trigger WHERE tgrelid = 'members'::regclass AND NOT tgisinternal ORDER BY 1;

-- 6) 한 줄 요약 — 기대값: 재직자 5 / 연결 5 / 팀장(lead) 1 / 관리자 2 / 보호 트리거 1
SELECT count(*) FILTER (WHERE left_at IS NULL) AS active,
       count(*) FILTER (WHERE left_at IS NULL AND auth_user_id IS NOT NULL) AS linked,
       count(*) FILTER (WHERE left_at IS NULL AND role = 'lead') AS leads,
       count(*) FILTER (WHERE left_at IS NULL AND can_manage_members) AS member_admins,
       (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'members'::regclass AND tgname = 'members_guard') AS guard_trigger
FROM members;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) (따로 실행) 브라우저 역할로 시험 — 아래 블록만 선택해서 실행한다. 끝이 ROLLBACK이라 아무것도 남지 않는다.
--    <팀원_계정_id> 자리에 일반 팀원 한 명의 로그인 계정 id를 넣는다
--    (SELECT auth_user_id FROM members WHERE role = 'member' LIMIT 1 로 확인).
--    기대: 7-a는 그 팀원 id와 false, 7-b는 "can only be changed by the server" 오류(오류가 나야 정상).
-- BEGIN;
-- SELECT set_config('request.jwt.claims', json_build_object('sub', '<팀원_계정_id>', 'role', 'authenticated')::text, true);
-- SET LOCAL ROLE authenticated;
-- SELECT current_member_id() AS me, is_lead() AS lead;                                   -- 7-a
-- UPDATE members SET role = 'lead' WHERE id = current_member_id();                      -- 7-b (오류가 나야 정상)
-- ROLLBACK;
