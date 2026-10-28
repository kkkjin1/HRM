-- U2 보완. 기존 익명 팀 건강도 집계 함수에서 응답자 목록(respondent_ids)을 없애고 인원 수(n)만 돌려준다. Safe to re-run.
-- 왜: U1의 team_health_summary()는 기간별로 "누가 응답했는지" member id 목록을 돌려줬다. 응답 내용과 직접 연결되지는 않지만,
--     익명으로 안내하고 모은 설문의 참여자가 드러나고, 응답자가 적으면(2026-2H 3명) 집계와 엮어 추정할 여지가 생긴다.
-- 적용: U2 코드 배포 전이든 후든 상관없다(U2 코드는 n을 읽고, 예전 응답 모양도 인원 수로만 쓴다).
-- 되돌리기: 필요 없음(예전 함수로 돌릴 이유가 없다). 꼭 필요하면 git 이력의 add_auth_identity.sql(2fb3f47) 해당 함수를 다시 실행.

CREATE OR REPLACE FUNCTION team_health_summary() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(x.summary ORDER BY x.period), '[]'::jsonb)
  FROM (
    SELECT p.period, jsonb_build_object(
      'period', p.period,
      'n', (
        SELECT count(*)
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
