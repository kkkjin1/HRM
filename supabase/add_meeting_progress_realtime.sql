-- 팀원별 진행사항(회의수정 탭)이 다른 사람 화면에도 새로고침 없이 반영되도록 realtime 활성화.
-- team_log_meeting_items는 add_meeting_items_realtime.sql에서 이미 퍼블리케이션에 추가됐지만,
-- 같은 회의수정 서랍에 있는 team_log_meeting_progress는 빠져 있어서 다른 사람이 입력한 진행사항이
-- 내 화면에는 새로고침 전까지 비어있는 것처럼 보이는 버그가 있었다.

ALTER PUBLICATION supabase_realtime ADD TABLE team_log_meeting_progress;
