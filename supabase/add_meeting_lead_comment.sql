-- 회의창 업무보고: 팀원 자유 메모 옆에 팀장 코멘트 칸.
-- 같은 테이블(team_log_meeting_progress)에 kind 칸을 두어 회의×팀원마다 메모(note) 한 칸 + 코멘트(comment) 한 칸.
-- 실시간(supabase_realtime publication)·캐시 무효화는 이미 이 테이블에 걸려 있어 그대로 쓴다.
-- 기존 행은 모두 kind = 'note'가 되어 내용 변화 없음.

ALTER TABLE team_log_meeting_progress ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'note';
ALTER TABLE team_log_meeting_progress DROP CONSTRAINT IF EXISTS team_log_meeting_progress_kind_check;
ALTER TABLE team_log_meeting_progress ADD CONSTRAINT team_log_meeting_progress_kind_check CHECK (kind IN ('note', 'comment'));

-- 유일 조건: (회의, 팀원) → (회의, 팀원, 종류)
ALTER TABLE team_log_meeting_progress DROP CONSTRAINT IF EXISTS team_log_meeting_progress_meeting_id_member_id_key;
ALTER TABLE team_log_meeting_progress DROP CONSTRAINT IF EXISTS team_log_meeting_progress_meeting_member_kind_key;
ALTER TABLE team_log_meeting_progress ADD CONSTRAINT team_log_meeting_progress_meeting_member_kind_key UNIQUE (meeting_id, member_id, kind);

-- 저장 함수에 p_kind 추가(기본 'note'라 예전 호출도 그대로 동작).
DROP FUNCTION IF EXISTS save_meeting_progress(uuid, uuid, text, integer, text);
CREATE OR REPLACE FUNCTION save_meeting_progress(p_meeting_id uuid, p_member_id uuid, p_content text, p_expected_version integer, p_updated_by text, p_kind text DEFAULT 'note')
RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS '
DECLARE
  r team_log_meeting_progress;
BEGIN
  IF p_expected_version = 0 THEN
    INSERT INTO team_log_meeting_progress (meeting_id, member_id, kind, content, version, updated_at, updated_by)
    VALUES (p_meeting_id, p_member_id, p_kind, p_content, 1, now(), p_updated_by)
    ON CONFLICT (meeting_id, member_id, kind) DO NOTHING
    RETURNING * INTO r;
  ELSE
    UPDATE team_log_meeting_progress
       SET content = p_content,
           version = version + 1,
           updated_at = now(),
           updated_by = p_updated_by
     WHERE meeting_id = p_meeting_id AND member_id = p_member_id AND kind = p_kind AND version = p_expected_version
    RETURNING * INTO r;
  END IF;
  IF NOT FOUND THEN
    SELECT * INTO r FROM team_log_meeting_progress WHERE meeting_id = p_meeting_id AND member_id = p_member_id AND kind = p_kind;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(''status'', ''not_found'');
    END IF;
    RETURN jsonb_build_object(''status'', ''conflict'', ''row'', to_jsonb(r));
  END IF;
  RETURN jsonb_build_object(''status'', ''ok'', ''row'', to_jsonb(r));
END
';

REVOKE ALL ON FUNCTION save_meeting_progress(uuid, uuid, text, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION save_meeting_progress(uuid, uuid, text, integer, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';

-- 확인: 유일 조건이 (meeting_id, member_id, kind) 하나만 남아 있어야 한다.
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'team_log_meeting_progress'::regclass AND contype = 'u';
