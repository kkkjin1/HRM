// 메뉴 카탈로그 · 한마디 프리셋 · 색상 팔레트. DB가 아니라 TS 상수로 두는 것들.
// 멤버 이름은 여기 어디에도 등장하지 않는다 — 항상 members 테이블을 런타임에 읽어라.

export type Weather = 'clear' | 'hot' | 'rain' | 'cold'
export type Mood = 'good' | 'tired' | 'spicy' | 'hearty' | 'light' | 'none'
export type MemberRole = 'lead' | 'part_lead' | 'member'

export type MenuItem = {
  name: string
  icon: string
  w: Record<Weather, number>
  m: Record<Exclude<Mood, 'none'>, number>
}

export const WEATHER_OPTIONS: { key: Weather; label: string; icon: string }[] = [
  { key: 'clear', label: '맑음', icon: '☀️' },
  { key: 'hot', label: '더움', icon: '🥵' },
  { key: 'rain', label: '비', icon: '🌧️' },
  { key: 'cold', label: '추움', icon: '🥶' },
]

export const MOOD_OPTIONS: { key: Exclude<Mood, 'none'>; label: string }[] = [
  { key: 'good', label: '기분좋음' },
  { key: 'tired', label: '지침' },
  { key: 'spicy', label: '매운거' },
  { key: 'hearty', label: '든든하게' },
  { key: 'light', label: '가볍게' },
]
export const MOOD_NONE: { key: 'none'; label: string } = { key: 'none', label: '아무거나' }

export const ROLE_LABEL: Record<MemberRole, string> = {
  lead: '팀장',
  part_lead: '파트장',
  member: '팀원',
}

// 낙서 8색 (배경/텍스트)
export const DOODLE_PALETTE: { bg: string; fg: string }[] = [
  { bg: '#FAEEDA', fg: '#412402' },
  { bg: '#E1F5EE', fg: '#04342C' },
  { bg: '#FBEAF0', fg: '#4B1528' },
  { bg: '#EEEDFE', fg: '#26215C' },
  { bg: '#E6F1FB', fg: '#042C53' },
  { bg: '#EAF3DE', fg: '#173404' },
  { bg: '#F1EFE8', fg: '#2C2C2A' },
  { bg: '#FAECE7', fg: '#4A1B0C' },
]

export const MENU_CATALOG: MenuItem[] = [
  { name: '김치찌개', icon: '🍲', w: { clear: 3, hot: 1, rain: 4, cold: 5 }, m: { good: 3, tired: 4, spicy: 3, hearty: 4, light: 1 } },
  { name: '냉면', icon: '🍜', w: { clear: 3, hot: 5, rain: 1, cold: 0 }, m: { good: 3, tired: 2, spicy: 1, hearty: 1, light: 4 } },
  { name: '삼겹살', icon: '🥓', w: { clear: 4, hot: 2, rain: 3, cold: 5 }, m: { good: 5, tired: 2, spicy: 1, hearty: 5, light: 0 } },
  { name: '비빔밥', icon: '🥗', w: { clear: 4, hot: 3, rain: 2, cold: 2 }, m: { good: 4, tired: 3, spicy: 2, hearty: 2, light: 4 } },
  { name: '짜장면', icon: '🍜', w: { clear: 3, hot: 2, rain: 4, cold: 3 }, m: { good: 3, tired: 3, spicy: 0, hearty: 3, light: 2 } },
  { name: '짬뽕', icon: '🌶️', w: { clear: 2, hot: 1, rain: 5, cold: 3 }, m: { good: 2, tired: 2, spicy: 5, hearty: 3, light: 1 } },
  { name: '초밥', icon: '🍣', w: { clear: 4, hot: 4, rain: 1, cold: 1 }, m: { good: 4, tired: 2, spicy: 0, hearty: 1, light: 5 } },
  { name: '파스타', icon: '🍝', w: { clear: 4, hot: 2, rain: 3, cold: 3 }, m: { good: 4, tired: 2, spicy: 1, hearty: 3, light: 3 } },
  { name: '샐러드', icon: '🥙', w: { clear: 3, hot: 5, rain: 1, cold: 0 }, m: { good: 3, tired: 4, spicy: 0, hearty: 0, light: 5 } },
  { name: '도시락', icon: '🍱', w: { clear: 4, hot: 3, rain: 2, cold: 2 }, m: { good: 3, tired: 3, spicy: 1, hearty: 2, light: 4 } },
  { name: '마라탕', icon: '🌶️', w: { clear: 2, hot: 0, rain: 3, cold: 5 }, m: { good: 2, tired: 3, spicy: 5, hearty: 3, light: 0 } },
  { name: '곰탕', icon: '🍲', w: { clear: 2, hot: 0, rain: 3, cold: 5 }, m: { good: 3, tired: 5, spicy: 0, hearty: 4, light: 1 } },
  { name: '쌀국수', icon: '🍜', w: { clear: 3, hot: 2, rain: 4, cold: 3 }, m: { good: 3, tired: 4, spicy: 2, hearty: 2, light: 3 } },
  { name: '돈까스', icon: '🍖', w: { clear: 4, hot: 2, rain: 2, cold: 3 }, m: { good: 5, tired: 2, spicy: 0, hearty: 4, light: 1 } },
  { name: '국밥', icon: '🍚', w: { clear: 2, hot: 0, rain: 3, cold: 5 }, m: { good: 2, tired: 5, spicy: 1, hearty: 4, light: 1 } },
  { name: '떡볶이', icon: '🍢', w: { clear: 3, hot: 2, rain: 3, cold: 2 }, m: { good: 2, tired: 4, spicy: 5, hearty: 2, light: 1 } },
  { name: '갈비탕', icon: '🍖', w: { clear: 2, hot: 0, rain: 2, cold: 5 }, m: { good: 3, tired: 4, spicy: 0, hearty: 5, light: 1 } },
  { name: '스테이크', icon: '🥩', w: { clear: 4, hot: 1, rain: 2, cold: 3 }, m: { good: 5, tired: 1, spicy: 0, hearty: 5, light: 1 } },
  { name: '샌드위치', icon: '🥪', w: { clear: 3, hot: 5, rain: 1, cold: 0 }, m: { good: 2, tired: 3, spicy: 0, hearty: 1, light: 5 } },
  { name: '만두', icon: '🥟', w: { clear: 3, hot: 1, rain: 4, cold: 4 }, m: { good: 3, tired: 3, spicy: 1, hearty: 3, light: 2 } },
]

export type MessagePresetTone = '칭찬형' | '장난형' | '뜬금형'

// {name}은 수신자명으로 치환된다. LLM 실시간 생성 금지 — 통제되지 않은 문구가
// 특정 개인에게 붙으면 안 되므로 항상 이 고정 목록에서만 뽑는다.
export const MESSAGE_PRESETS: Record<MessagePresetTone, string[]> = {
  칭찬형: [
    '{name}님, 오늘도 든든하게 팀을 지켜주셔서 감사해요.',
    '{name}님 덕분에 오늘 하루도 든든했습니다.',
    '{name}님, 항상 꼼꼼하게 챙겨주셔서 배울 게 많아요.',
    '{name}님의 센스는 우리 팀의 자랑입니다.',
    '{name}님 오늘도 최고예요, 인정!',
    '{name}님 없으면 우리 팀 안 돌아갑니다. 진심으로 감사해요.',
    '{name}님, 항상 밝은 에너지 감사해요.',
    '{name}님의 일처리는 언제나 신뢰가 갑니다.',
    '{name}님 오늘 유난히 멋있으신데요?',
    '{name}님, 늘 든든한 지원군이 되어주셔서 고마워요.',
  ],
  장난형: [
    '{name}님, 오늘 커피는 저 대신 사주시는 거죠?',
    '{name}님 혹시... 오늘 점심 메뉴 정해주실 수 있나요? (반협박)',
    '{name}님, 다음 룰렛은 안 걸릴 것 같은 느낌이 드는데요?',
    '{name}님 오늘 유독 운이 좋아 보이던데, 룰렛도 잘 되길!',
    '{name}님, 저 몰래 간식 숨겨두신 거 다 알아요.',
    '{name}님, 오늘 왠지 법인카드 각인데요?',
    '{name}님 자리에 슬쩍 과자 놓고 갈까요?',
    '{name}님, 오늘의 럭키 아이템은 {name}님입니다.',
    '{name}님, 혹시 오늘 기분 "매운거" 아니에요?',
    '{name}님, 오늘 하루도 무사히 버텨봅시다 (같이 웃어요).',
  ],
  뜬금형: [
    '{name}님, 문어는 심장이 3개래요. 알쓸신잡 나눔.',
    '{name}님, 오늘 점심시간에 갑자기 궁금해졌어요 — 짜장면 대 짬뽕?',
    '{name}님, 만약 회사가 우주선이라면 {name}님은 함장일 것 같아요.',
    '{name}님, 오늘의 운세: 서쪽에서 좋은 소식이 옵니다.',
    '{name}님, 갑자기 국밥이 먹고 싶어지는 하루네요.',
    '{name}님, 퀴즈: 대한민국에서 가장 긴 강은? (정답은 몰라도 됩니다)',
    '{name}님, 오늘 날씨처럼 마음도 맑으시길.',
    '{name}님, 고양이도 회의를 한다면 몇 시간이 걸릴까요.',
    '{name}님, 문득 궁금한데 라면에 계란은 풀어 드시나요, 통으로 드시나요?',
    '{name}님, 오늘 하루의 BGM은 무엇인가요?',
  ],
}

export function fillPreset(template: string, receiverName: string) {
  return template.split('{name}').join(receiverName)
}

// 한마디·낙서에서 공통으로 쓰는 빠른 반응 이모지.
export const QUICK_REACTIONS = ['❤️', '😂', '👍', '🎉']

// 멤버 관리(설정) 접근을 허용하는 계정. 명시적으로 두 사람만 지정해달라는 요청이라
// (역할이 아니라 "계정" 단위 제한) 여기서는 의도적으로 이메일을 하드코딩한다.
export const SETTINGS_ADMIN_EMAILS = ['ji.kim@egnis.kr', 'daseul.kim@egnis.kr']
