-- 낙서(doodle)·오늘의 한마디 댓글(message_comments)·팀원(members)을 Realtime publication에 추가.
-- 세 컴포넌트 모두 postgres_changes 구독 코드는 있었지만 publication에 빠져 있어 이벤트가 한 번도 오지 않았다
-- (예전엔 탭 진입마다 재조회해서 가려져 있었음). 일상 탭 keep-alive + MembersProvider 1회 조회 이후로는
-- 이 실시간 이벤트가 유일한 갱신 경로다. 2026-09-29 Supabase SQL Editor에서 실행 완료.
ALTER PUBLICATION supabase_realtime ADD TABLE doodle, message_comments, members;
