-- 결정사항/액션아이템(회의수정 탭)이 다른 사람 화면에도 새로고침 없이 반영되도록 realtime 활성화.

ALTER PUBLICATION supabase_realtime ADD TABLE team_log_meeting_items;
