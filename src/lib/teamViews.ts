// 팀 탭 세부 화면 목록 — page.tsx 상단 공용 세부탭 바가 쓴다.
// TeamPersona 본체를 홈 첫 로딩 묶음에서 빼려고(필요할 때만 불러오기) 상수만 따로 둔다.
export type TeamView = 'members' | 'plan'
export const TEAM_VIEWS: { key: TeamView; label: string }[] = [
  { key: 'members', label: '팀원·프로필' }, { key: 'plan', label: '팀빌딩' },
]
