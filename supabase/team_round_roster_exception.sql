-- 예외 절차: 진행 중인 진단 회차에서 "아직 제출하지 않은" 팀원을 명단에서 뺀다(장기 부재·퇴사 등).
-- R0는 전원 제출이 원칙이라 팀장도 일부만 받고 마감할 수 없다. 꼭 필요할 때만 팀장이 판단해 아래를 실행한다.
--   · 사유 필수, 이미 제출한 사람은 뺄 수 없다, 명단은 줄어들기만 한다, team_events에 roster_changed로 남는다.
--   · 실행 후 남은 명단 전원이 이미 제출해 있으면 팀 화면의 "마감하기"로 마감한다.

-- 1) 지금 열린 진단과 아직 제출하지 않은 사람 확인 (읽기 전용)
SELECT r.id AS round_id, r.title, m.id AS member_id, m.name
FROM team_rounds r CROSS JOIN LATERAL unnest(r.roster) AS rid(id)
JOIN members m ON m.id = rid.id
WHERE r.closed_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM team_responses t WHERE t.round_id = r.id AND t.member_id = m.id);

-- 2) 제외 실행 — 회차 id, 팀원 id, 사유를 채운 뒤 주석을 풀어 실행
-- SELECT team_round_exclude_member(
--   '<회차_id>'::uuid,
--   '<팀원_id>'::uuid,
--   '사유를 구체적으로 (예: 11/3~12/31 육아휴직)',
--   (SELECT id FROM members WHERE role = 'lead' AND left_at IS NULL LIMIT 1)
-- );
