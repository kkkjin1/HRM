-- U1 단계 A. 신원 판별을 auth.uid() 기준으로 바꾸기 위한 컬럼·함수·계정 연결 + 신원 컬럼 보호. Safe to re-run.
--
-- 왜: 지금은 로그인 계정의 user_metadata.name ↔ members.name 이름 매칭으로 "나"와 팀장을 판별한다.
--     user_metadata는 로그인한 사용자가 auth.updateUser({ data })로 직접 바꿀 수 있어서, 이름을 팀장 이름으로
--     바꾸면 팀장 전용 API를 통과할 수 있다. → members.auth_user_id(바꿀 수 없는 auth.uid())로 연결한다.
--
-- 이 파일은 기존 코드와 함께 돌아가도 기존 기능을 바꾸지 않는다(정책 auth_all은 그대로 둔다). 단 하나의 예외:
--   members_guard 트리거가 브라우저에서 role·auth_user_id·can_manage_members·left_at을 바꾸는 것을 막는다.
--   → 이 파일 적용 ~ 새 코드 배포 사이(수 분)에는 예전 팀원 관리 화면의 "역할 변경"과 "팀장/파트장 역할로 추가"가 실패한다.
--   트리거를 뒤로 미루면 그 사이 브라우저에서 팀장 행의 auth_user_id를 자기 계정으로 바꿔 팀장이 될 수 있어서 여기 둔다.
--
-- 순서: (A) 이 파일 → verify_auth_identity.sql 확인 → (B) 새 코드 배포·확인 → (C) tighten_team_rls.sql
-- 되돌리기: (C)만 → rollback_tighten_team_rls.sql / (A)까지 → 이전 코드로 되돌린 뒤 rollback_add_auth_identity.sql
-- Supabase SQL Editor는 전체를 한 트랜잭션으로 실행한다(하나라도 실패하면 전부 롤백). DO 블록은 쓰지 않는다.

-- ── 1) 컬럼 ─────────────────────────────────────────────────────────────
ALTER TABLE members ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS members_auth_user_id_key ON members (auth_user_id) WHERE auth_user_id IS NOT NULL;

-- 퇴사일. 행을 지우면 CASCADE로 기록이 함께 사라지므로, 앞으로는 지우지 않고 퇴사 처리한다.
ALTER TABLE members ADD COLUMN IF NOT EXISTS left_at date;

-- 팀원 관리(/fun/settings/members) 권한. 예전엔 코드의 관리자 이메일 목록으로 판별했다 → 계정 연결된 행의 플래그로.
-- 이 값은 화면·API 어디서도 바꿀 수 없고 SQL로만 바꾼다(아래 트리거).
ALTER TABLE members ADD COLUMN IF NOT EXISTS can_manage_members boolean NOT NULL DEFAULT false;

-- 업무 쪽 팀원(team_log_members)과 프로필 팀원(members)을 id로 잇는다. 지금은 이름으로만 이어져 있다.
ALTER TABLE team_log_members ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES members(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS team_log_members_member_id_key ON team_log_members (member_id) WHERE member_id IS NOT NULL;

-- ── 2) 신원 컬럼 보호 — 브라우저(authenticated)는 바꿀 수 없다 ─────────────────────────
-- 서버(service_role, /api/members-admin)와 SQL Editor(postgres), SECURITY DEFINER 함수·트리거는 그대로 바꿀 수 있다.
-- 트리거는 백필보다 먼저 만든다(백필은 SQL Editor = postgres라 통과).
CREATE OR REPLACE FUNCTION members_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.role IS DISTINCT FROM 'member' OR NEW.auth_user_id IS NOT NULL
         OR NEW.can_manage_members OR NEW.left_at IS NOT NULL THEN
        RAISE EXCEPTION 'members: role, auth_user_id, can_manage_members, left_at can only be set by the server' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
       OR NEW.can_manage_members IS DISTINCT FROM OLD.can_manage_members
       OR NEW.left_at IS DISTINCT FROM OLD.left_at THEN
      RAISE EXCEPTION 'members: role, auth_user_id, can_manage_members, left_at can only be changed by the server' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS members_guard ON members;

CREATE TRIGGER members_guard BEFORE INSERT OR UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION members_guard();

-- ── 3) 기존 데이터 연결(백필) ──────────────────────────────────────────────
-- 이름(앞뒤 공백 무시)이 "양쪽 모두 정확히 하나"일 때만 잇는다. 동명이인·불일치는 비워 두고 팀원 관리 화면에서 수동 연결한다.
-- 이 백필 한 번만 이름을 쓴다(SQL Editor에서 관리자가 실행·확인). 이후 앱은 이름으로 신원을 판별하지 않는다.
UPDATE members m
SET auth_user_id = u.id
FROM auth.users u
WHERE m.auth_user_id IS NULL
  AND trim(coalesce(u.raw_user_meta_data ->> 'name', '')) = trim(m.name)
  AND (SELECT count(*) FROM auth.users u2 WHERE trim(coalesce(u2.raw_user_meta_data ->> 'name', '')) = trim(m.name)) = 1
  AND (SELECT count(*) FROM members m2 WHERE trim(m2.name) = trim(m.name)) = 1
  AND NOT EXISTS (SELECT 1 FROM members m3 WHERE m3.auth_user_id = u.id);

-- 팀원 관리 권한: 지금까지 코드에 적혀 있던 관리자 계정 2개(팀장·파트장) 그대로. 계정 id로 연결된 행에만 준다.
UPDATE members m
SET can_manage_members = true
FROM auth.users u
WHERE u.id = m.auth_user_id
  AND lower(u.email) IN ('ji.kim@egnis.kr', 'daseul.kim@egnis.kr')
  AND m.can_manage_members = false;

UPDATE team_log_members t
SET member_id = m.id
FROM members m
WHERE t.member_id IS NULL
  AND trim(t.name) = trim(m.name)
  AND (SELECT count(*) FROM members m2 WHERE trim(m2.name) = trim(t.name)) = 1
  AND (SELECT count(*) FROM team_log_members t2 WHERE trim(t2.name) = trim(t.name)) = 1
  AND NOT EXISTS (SELECT 1 FROM team_log_members t3 WHERE t3.member_id = m.id);

-- ── 4) 신원·권한 함수 ─────────────────────────────────────────────────────
-- 지금 로그인한 사람의 members.id. 연결이 없거나 퇴사했으면 NULL.
CREATE OR REPLACE FUNCTION current_member_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM members WHERE auth_user_id = auth.uid() AND left_at IS NULL
$$;

CREATE OR REPLACE FUNCTION is_lead() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM members WHERE id = current_member_id() AND role = 'lead')
$$;

REVOKE EXECUTE ON FUNCTION current_member_id() FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION is_lead() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION current_member_id() TO authenticated;

GRANT EXECUTE ON FUNCTION current_member_id() TO service_role;

GRANT EXECUTE ON FUNCTION is_lead() TO authenticated;

GRANT EXECUTE ON FUNCTION is_lead() TO service_role;

-- ── 5) 기존 익명 응답 집계 함수 ──────────────────────────────────────────────
-- 새 코드는 team_health_responses·johari_picks 원본(작성자 포함)을 읽지 않고 이 집계만 받는다(내 응답 행만 따로 읽음).
-- 직접 읽기 차단은 tighten_team_rls.sql. 이 함수들은 작성자와 응답을 잇는 값을 돌려주지 않는다.

-- 팀 건강도: 기간별 응답자 목록(기존 화면의 "미응답자" 표시용, 응답 내용과 연결되지 않음)과 문항별 합계·개수.
CREATE OR REPLACE FUNCTION team_health_summary() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(x.summary ORDER BY x.period), '[]'::jsonb)
  FROM (
    SELECT p.period, jsonb_build_object(
      'period', p.period,
      'respondent_ids', (
        SELECT coalesce(jsonb_agg(r.member_id ORDER BY r.member_id), '[]'::jsonb)
        FROM team_health_responses r JOIN members m ON m.id = r.member_id AND m.left_at IS NULL
        WHERE r.period = p.period),
      'items', (
        SELECT coalesce(jsonb_object_agg(t.k, jsonb_build_object('sum', t.s, 'count', t.c)), '{}'::jsonb)
        FROM (
          SELECT e.key AS k, sum((e.value #>> '{}')::numeric) AS s, count(*) AS c
          FROM team_health_responses r
          JOIN members m ON m.id = r.member_id AND m.left_at IS NULL
          CROSS JOIN LATERAL jsonb_each(r.answers) e
          WHERE r.period = p.period
            AND jsonb_typeof(e.value) = 'number'
            AND (e.value #>> '{}')::numeric > 0
          GROUP BY e.key
        ) t)
    ) AS summary
    FROM (SELECT DISTINCT period FROM team_health_responses) p
  ) x
  WHERE current_member_id() IS NOT NULL
$$;

-- 조하리: 대상자별 본인 선택(본인이 고른 것이라 원래 공개)과 동료 선택의 형용사별 인원 수. 동료 작성자는 돌려주지 않는다.
CREATE OR REPLACE FUNCTION johari_summary() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'about_id', m.id,
    'self_traits', (SELECT to_jsonb(p.traits) FROM johari_picks p WHERE p.about_id = m.id AND p.author_id = m.id),
    'peer_n', (SELECT count(*) FROM johari_picks p WHERE p.about_id = m.id AND p.author_id != m.id),
    'peer_counts', (
      SELECT coalesce(jsonb_object_agg(z.trait, z.c), '{}'::jsonb)
      FROM (
        SELECT tr AS trait, count(DISTINCT p.author_id) AS c
        FROM johari_picks p CROSS JOIN LATERAL unnest(p.traits) AS tr
        WHERE p.about_id = m.id AND p.author_id != m.id
        GROUP BY tr
      ) z)
  ) ORDER BY m.created_at), '[]'::jsonb)
  FROM members m
  WHERE m.left_at IS NULL AND current_member_id() IS NOT NULL
$$;

REVOKE EXECUTE ON FUNCTION team_health_summary() FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION johari_summary() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION team_health_summary() TO authenticated;

GRANT EXECUTE ON FUNCTION johari_summary() TO authenticated;

-- ── 6) 이름 동기화 트리거 확장: 새로 생기는 짝에 member_id도 채운다 ──────────────────────
-- sync_members.sql의 두 함수에 member_id 연결만 더한다(삭제는 여전히 따라가지 않는다).
CREATE OR REPLACE FUNCTION sync_member_to_team_log() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM team_log_members WHERE trim(name) = trim(NEW.name)) THEN
      INSERT INTO team_log_members (name, sort_order, color_key, member_id)
      VALUES (trim(NEW.name), COALESCE((SELECT max(sort_order) + 1 FROM team_log_members), 0), COALESCE(NEW.color_key, 0), NEW.id);
    ELSE
      UPDATE team_log_members SET member_id = NEW.id
      WHERE trim(name) = trim(NEW.name) AND member_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM team_log_members t2 WHERE t2.member_id = NEW.id);
    END IF;
  ELSIF TG_OP = 'UPDATE' AND trim(NEW.name) != trim(OLD.name) THEN
    UPDATE team_log_members SET name = trim(NEW.name) WHERE trim(name) = trim(OLD.name);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_team_log_to_member() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  linked uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM members WHERE trim(name) = trim(NEW.name)) THEN
      INSERT INTO members (name, color_key) VALUES (trim(NEW.name), COALESCE(NEW.color_key, 0) % 8) RETURNING id INTO linked;
    ELSE
      SELECT id INTO linked FROM members WHERE trim(name) = trim(NEW.name) LIMIT 1;
    END IF;
    IF NEW.member_id IS NULL AND linked IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM team_log_members t2 WHERE t2.member_id = linked) THEN
      UPDATE team_log_members SET member_id = linked WHERE id = NEW.id;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND trim(NEW.name) != trim(OLD.name) THEN
    UPDATE members SET name = trim(NEW.name) WHERE trim(name) = trim(OLD.name);
  END IF;
  RETURN NEW;
END;
$$;

-- 확인: verify_auth_identity.sql
