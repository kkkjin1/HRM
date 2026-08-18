-- 닉네임제. members.name(실명)은 로그인 매칭(useCurrentMember의 bestNameMatch)과 관리자
-- 화면에 계속 쓰이므로 그대로 두고, 화면 표시용 별칭만 이 컬럼에 추가한다.
-- 값이 없으면(NULL) 프론트 어디서나 실명으로 폴백한다 (lib/members.ts의 displayName).
ALTER TABLE members ADD COLUMN IF NOT EXISTS nickname text;
