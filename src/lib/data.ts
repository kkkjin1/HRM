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

export type LotteryMood =
  | 'great' | 'joyful' | 'excited' | 'rested'
  | 'focused' | 'relaxed' | 'neutral'
  | 'tired' | 'exhausted' | 'stressed'

export const LOTTERY_MOOD_OPTIONS: { key: LotteryMood; label: string }[] = [
  { key: 'great',    label: '기분좋음' },
  { key: 'joyful',   label: '즐거움' },
  { key: 'excited',  label: '설렘' },
  { key: 'rested',   label: '잘잠' },
  { key: 'focused',  label: '집중' },
  { key: 'relaxed',  label: '여유로움' },
  { key: 'neutral',  label: '별생각없음' },
  { key: 'tired',    label: '피곤함' },
  { key: 'exhausted',label: '지침' },
  { key: 'stressed', label: '스트레스' },
]

export type LotteryPreset = {
  phrase: string
  hanja: string
  sub: string
  moods: LotteryMood[]
  weathers: Weather[]
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
  { name: '한식', icon: '🍚', w: { clear: 4, hot: 3, rain: 4, cold: 5 }, m: { good: 4, tired: 4, spicy: 3, hearty: 4, light: 2 } },
  { name: '중식', icon: '🥢', w: { clear: 3, hot: 2, rain: 4, cold: 4 }, m: { good: 3, tired: 3, spicy: 3, hearty: 4, light: 2 } },
  { name: '일식', icon: '🍱', w: { clear: 5, hot: 4, rain: 2, cold: 2 }, m: { good: 4, tired: 3, spicy: 0, hearty: 2, light: 5 } },
  { name: '동남아', icon: '🍜', w: { clear: 4, hot: 3, rain: 3, cold: 2 }, m: { good: 4, tired: 3, spicy: 5, hearty: 3, light: 3 } },
  { name: '양식', icon: '🍝', w: { clear: 4, hot: 2, rain: 3, cold: 4 }, m: { good: 5, tired: 2, spicy: 0, hearty: 4, light: 2 } },
]

export const LOTTERY_PRESETS: LotteryPreset[] = [
  // ── 에너지 높음 (great · joyful · excited · rested) ────────────────
  { phrase: '순풍만범', hanja: '順風滿帆', sub: '돛에 바람이 가득 찼다. 오늘 시작하는 모든 일이 순조롭게 흘러갈 운이다. 오전 중 결정하면 더욱 좋다.', moods: ['great', 'joyful', 'rested'], weathers: ['clear', 'hot'] },
  { phrase: '금상첨화', hanja: '錦上添花', sub: '좋은 것 위에 더 좋은 것이 찾아온다. 오늘 팀에 예상치 못한 반가운 소식이 하나 더 추가될 운이다.', moods: ['great', 'joyful'], weathers: ['clear', 'hot'] },
  { phrase: '만사형통', hanja: '萬事亨通', sub: '오늘은 무엇을 시도해도 막히지 않는 날이다. 평소 미뤄뒀던 일을 꺼내기 좋은 절호의 타이밍이다.', moods: ['great', 'excited', 'rested'], weathers: ['clear'] },
  { phrase: '일취월장', hanja: '日就月將', sub: '날로 달로 성장 중. 오늘의 작은 노력이 한 달 뒤 큰 차이를 만든다. 기록해두면 나중에 뿌듯해진다.', moods: ['great', 'focused', 'rested'], weathers: ['clear', 'hot'] },
  { phrase: '청출어람', hanja: '靑出於藍', sub: '오늘 이 팀은 어제의 자신을 뛰어넘는다. 누군가의 의외의 아이디어가 터질 가능성이 높다.', moods: ['great', 'excited'], weathers: ['clear', 'hot'] },
  { phrase: '호연지기', hanja: '浩然之氣', sub: '거대하고 올바른 기운이 팀 안에 충만하다. 오늘 자신감이 붙어 있을 때 도전하라.', moods: ['great', 'excited', 'rested'], weathers: ['clear'] },
  { phrase: '위풍당당', hanja: '威風堂堂', sub: '당당하고 위엄 있는 하루. 오늘 발표나 보고가 있다면 걱정하지 마라. 잘 된다.', moods: ['great', 'excited'], weathers: ['clear', 'hot'] },
  { phrase: '쾌도난마', hanja: '快刀亂麻', sub: '엉킨 실타래를 단번에 자른다. 오늘 오래 묵은 문제가 시원하게 해결되는 날이다.', moods: ['great', 'focused'], weathers: ['clear', 'hot', 'rain'] },
  { phrase: '파죽지세', hanja: '破竹之勢', sub: '대나무를 쪼개듯 거침없이 나아간다. 오늘 이 팀 앞의 장벽은 모두 종이 호랑이다.', moods: ['great', 'excited'], weathers: ['clear', 'hot'] },
  { phrase: '군계일학', hanja: '群鷄一鶴', sub: '닭 무리 사이의 학처럼. 오늘 팀의 존재감이 유독 빛나는 날이다. 외부에서 주목받을 운이다.', moods: ['great', 'joyful'], weathers: ['clear'] },
  { phrase: '탄탄대로', hanja: '坦坦大路', sub: '평탄하고 넓은 길이 앞에 펼쳐졌다. 오늘 굳이 돌아갈 필요 없다. 곧장 가면 된다.', moods: ['great', 'rested', 'relaxed'], weathers: ['clear', 'hot'] },
  { phrase: '천의무봉', hanja: '天衣無縫', sub: '흠 하나 없이 매끄럽다. 오늘 팀의 협업은 칼같이 맞아떨어질 운이다.', moods: ['great', 'joyful', 'rested'], weathers: ['clear'] },
  { phrase: '일기당천', hanja: '一騎當千', sub: '혼자서 천 명을 당해낼 기세. 오늘 팀원 각자의 역량이 최대치로 발휘된다.', moods: ['great', 'excited'], weathers: ['clear', 'hot'] },
  { phrase: '백발백중', hanja: '百發百中', sub: '쏘는 족족 명중이다. 오늘 선택하고 결정하는 것마다 좋은 방향으로 향한다.', moods: ['great', 'focused', 'rested'], weathers: ['clear', 'hot'] },
  { phrase: '명실상부', hanja: '名實相符', sub: '이름값을 제대로 한다. 오늘 이 팀이 소문대로 실력을 보여주는 날이다.', moods: ['great', 'joyful'], weathers: ['clear', 'hot'] },
  { phrase: '화기애애', hanja: '和氣靄靄', sub: '화목한 기운이 팀 안에 가득하다. 오늘 분위기가 좋으면 일도 잘 된다. 작은 칭찬 한마디가 힘이 된다.', moods: ['great', 'joyful', 'rested'], weathers: ['clear', 'rain', 'cold'] },
  { phrase: '박장대소', hanja: '拍掌大笑', sub: '손뼉 치며 크게 웃는 날. 오늘 팀에 웃음이 끊이지 않을 운이다. 웃음이 곧 에너지다.', moods: ['joyful', 'great'], weathers: ['clear', 'hot'] },
  { phrase: '청천벽력', hanja: '靑天霹靂', sub: '맑은 하늘의 벼락처럼. 오늘 예상치 못한 좋은 소식이 갑자기 찾아온다. 알림을 끄지 마라.', moods: ['excited', 'joyful'], weathers: ['clear', 'hot'] },
  { phrase: '천군만마', hanja: '千軍萬馬', sub: '천 명의 군사와 만 마리의 말이 뒤에 있는 듯. 오늘 팀의 기세는 어디서도 꺾이지 않는다.', moods: ['excited', 'great'], weathers: ['clear', 'hot'] },
  { phrase: '각골난망', hanja: '刻骨難忘', sub: '오늘은 뼈에 새길 만큼 기억에 남는 하루가 된다. 좋은 일이든 배움이든, 오래 간직될 무언가가 있다.', moods: ['excited', 'joyful', 'rested'], weathers: ['clear', 'cold'] },
  { phrase: '우후죽순', hanja: '雨後竹筍', sub: '비 온 뒤 죽순처럼 쑥쑥. 오늘 아이디어와 해결책이 연달아 쏟아질 운이다. 메모장을 준비하라.', moods: ['excited', 'great', 'joyful'], weathers: ['rain'] },
  { phrase: '이열치열', hanja: '以熱治熱', sub: '열로 열을 다스린다. 오늘의 뜨거운 에너지로 뜨거운 문제를 정면으로 돌파하라.', moods: ['excited', 'great'], weathers: ['hot'] },
  { phrase: '개과천선', hanja: '改過遷善', sub: '새롭게 시작하는 날. 어제까지의 실수나 아쉬움은 오늘부터 뒤로한다. 리셋 버튼을 눌러라.', moods: ['rested', 'great', 'neutral'], weathers: ['clear', 'cold'] },
  { phrase: '심기일전', hanja: '心機一轉', sub: '마음을 완전히 새로 바꾸는 날. 어제와 다른 방식으로 접근하면 오늘은 다른 결과가 나온다.', moods: ['rested', 'excited'], weathers: ['clear', 'rain'] },

  // ── 집중 · 여유 · 별생각없음 (focused · relaxed · neutral) ─────────
  { phrase: '명경지수', hanja: '明鏡止水', sub: '맑은 거울과 고요한 물처럼 마음이 투명하다. 오늘 판단이 정확하게 들어맞는 날이다.', moods: ['focused', 'relaxed', 'rested'], weathers: ['clear'] },
  { phrase: '절차탁마', hanja: '切磋琢磨', sub: '끊임없이 갈고 닦는다. 오늘의 0.1% 성장이 나중에 큰 차이가 된다. 지금 그 과정 중이다.', moods: ['focused', 'neutral'], weathers: ['clear', 'rain', 'cold'] },
  { phrase: '격물치지', hanja: '格物致知', sub: '사물의 이치를 파악하여 앎에 이른다. 오늘 깊이 파고들수록 예상치 못한 해답이 보인다.', moods: ['focused'], weathers: ['clear', 'rain'] },
  { phrase: '자강불식', hanja: '自强不息', sub: '스스로 강해지기를 멈추지 않는다. 오늘도 어제의 나보다 조금 더 나아진다.', moods: ['focused', 'great', 'neutral'], weathers: ['clear', 'hot', 'cold'] },
  { phrase: '유비무환', hanja: '有備無患', sub: '준비된 자에게 걱정이 없다. 오늘 미리 챙겨두면 나중에 여유로워진다. 지금 준비하라.', moods: ['focused', 'neutral'], weathers: ['clear', 'cold'] },
  { phrase: '지피지기', hanja: '知彼知己', sub: '상대를 알고 나를 안다. 오늘 정확한 상황 파악이 최고의 전략이다. 섣불리 움직이지 마라.', moods: ['focused', 'stressed'], weathers: ['clear', 'rain', 'cold'] },
  { phrase: '초지일관', hanja: '初志一貫', sub: '처음 뜻을 끝까지 관철한다. 오늘 흔들리는 것들이 있어도 방향만 잃지 않으면 된다.', moods: ['focused', 'neutral', 'tired'], weathers: ['clear', 'cold', 'rain'] },
  { phrase: '무아지경', hanja: '無我之境', sub: '자신을 잊을 만큼 몰입하는 경지. 오늘 한 번쯤 그 상태에 들어갈 운이 있다. 방해 요소를 줄여라.', moods: ['focused'], weathers: ['clear', 'rain'] },
  { phrase: '호시탐탐', hanja: '虎視耽耽', sub: '호랑이처럼 기회를 노린다. 오늘 좋은 타이밍이 한 번 온다. 놓치지 마라.', moods: ['focused', 'neutral'], weathers: ['clear', 'cold'] },
  { phrase: '단도직입', hanja: '單刀直入', sub: '칼 하나로 직접 돌입한다. 오늘 빙빙 돌지 말고 핵심을 바로 꺼내는 게 훨씬 빠르다.', moods: ['focused', 'stressed'], weathers: ['clear', 'hot', 'rain'] },
  { phrase: '적소성대', hanja: '積小成大', sub: '작은 것이 쌓여 큰 것이 된다. 오늘의 자그마한 진전이 결국 팀의 큰 성과로 이어진다.', moods: ['focused', 'neutral', 'tired'], weathers: ['clear', 'rain', 'cold'] },
  { phrase: '암중모색', hanja: '暗中摸索', sub: '어둠 속에서도 길을 더듬어 찾는다. 오늘 답이 바로 보이지 않아도 끝까지 찾아내는 날이다.', moods: ['focused', 'stressed', 'tired'], weathers: ['rain', 'cold'] },
  { phrase: '촌철살인', hanja: '寸鐵殺人', sub: '짧지만 핵심을 찌르는 한마디. 오늘 이 팀의 예리함이 회의실을 지배한다.', moods: ['focused', 'great'], weathers: ['clear', 'hot'] },
  { phrase: '심사숙고', hanja: '深思熟考', sub: '깊이 생각하고 신중히 헤아린다. 오늘 서두르지 않고 천천히 생각하면 더 나은 답이 나온다.', moods: ['focused', 'relaxed', 'neutral'], weathers: ['rain', 'cold', 'clear'] },
  { phrase: '유유자적', hanja: '悠悠自適', sub: '여유롭고 자유롭게. 오늘은 서두르지 않아도 모든 게 제자리를 찾는 날이다. 숨 한 번 크게 쉬어라.', moods: ['relaxed', 'neutral'], weathers: ['clear', 'hot'] },
  { phrase: '청풍명월', hanja: '淸風明月', sub: '맑은 바람과 밝은 달처럼. 오늘 마음을 비우면 오히려 좋은 것들이 채워진다.', moods: ['relaxed', 'neutral', 'rested'], weathers: ['clear', 'cold'] },
  { phrase: '소요자재', hanja: '逍遙自在', sub: '제약 없이 자유롭게 거닌다. 오늘 너무 애쓰지 않아도 된다. 흐름에 몸을 맡기면 그게 답이다.', moods: ['relaxed', 'neutral'], weathers: ['rain', 'clear'] },
  { phrase: '안빈낙도', hanja: '安貧樂道', sub: '소박하게 즐기는 삶의 지혜. 오늘 작은 것에서 생각지 못한 기쁨을 발견한다.', moods: ['relaxed', 'neutral'], weathers: ['rain', 'cold'] },
  { phrase: '무위자연', hanja: '無爲自然', sub: '억지 없이 자연스럽게. 오늘 억지로 뭔가를 만들려 하지 않아도 된다. 자연스럽게 두면 답이 나온다.', moods: ['relaxed', 'neutral'], weathers: ['clear', 'hot'] },
  { phrase: '천하태평', hanja: '天下太平', sub: '세상이 평화롭다. 오늘 팀 안에 고요하고 평온한 기운이 가득하다. 이런 날이 오래가길.', moods: ['relaxed', 'neutral', 'rested'], weathers: ['clear'] },
  { phrase: '새옹지마', hanja: '塞翁之馬', sub: '인생은 새옹지마. 오늘 일이 잘 안 풀려도 결국 균형을 찾는다. 너무 심각하게 보지 말자.', moods: ['neutral', 'tired', 'relaxed'], weathers: ['rain', 'cold', 'clear'] },
  { phrase: '오비이락', hanja: '烏飛梨落', sub: '까마귀 날자 배 떨어진다. 오늘 우연한 타이밍에 예상치 못한 좋은 일이 생길 수 있다.', moods: ['neutral', 'relaxed'], weathers: ['clear', 'rain'] },
  { phrase: '비몽사몽', hanja: '非夢似夢', sub: '꿈인지 생시인지. 오늘은 너무 빡빡하게 가지 않아도 된다. 여유 있게 흘러가도 결과는 나온다.', moods: ['neutral', 'tired', 'rested'], weathers: ['clear', 'rain'] },
  { phrase: '역지사지', hanja: '易地思之', sub: '입장을 바꿔 생각한다. 오늘 상대방의 시각으로 한 번만 봐도 팀 내 오해가 많이 풀린다.', moods: ['neutral', 'relaxed', 'focused'], weathers: ['clear', 'rain', 'cold'] },
  { phrase: '동고동락', hanja: '同苦同樂', sub: '힘든 것도 즐거운 것도 함께 나눈다. 오늘도 이 팀이 같이 있다는 것 자체가 운이다.', moods: ['neutral', 'relaxed', 'joyful'], weathers: ['clear', 'rain', 'cold'] },
  { phrase: '사필귀정', hanja: '事必歸正', sub: '모든 일은 결국 바르게 돌아온다. 지금 당장 결과가 안 보여도 결국 제자리를 찾는다.', moods: ['neutral', 'tired', 'stressed'], weathers: ['rain', 'cold', 'clear'] },

  // ── 피곤함 · 지침 (tired · exhausted) ────────────────────────────
  { phrase: '고진감래', hanja: '苦盡甘來', sub: '쓴 것이 다하면 단 것이 온다. 오늘의 고생은 반드시 내일의 달콤함으로 돌아온다. 조금만 더.', moods: ['tired', 'exhausted'], weathers: ['rain', 'cold', 'clear'] },
  { phrase: '와신상담', hanja: '臥薪嘗膽', sub: '땔감 위에 눕고 쓸개를 핥는다. 지금 힘든 게 당연하다. 이 과정이 나중의 큰 성취를 만든다.', moods: ['tired', 'exhausted'], weathers: ['cold', 'rain'] },
  { phrase: '칠전팔기', hanja: '七顚八起', sub: '일곱 번 넘어져도 여덟 번 일어선다. 오늘 쓰러져도 내일 일어나면 된다. 그게 이 팀의 방식이다.', moods: ['tired', 'exhausted', 'stressed'], weathers: ['rain', 'cold'] },
  { phrase: '백절불굴', hanja: '百折不屈', sub: '백 번 꺾여도 굽히지 않는다. 지쳐 있어도 이 팀의 근성은 어디 가지 않는다. 믿어라.', moods: ['tired', 'exhausted'], weathers: ['hot', 'rain', 'cold'] },
  { phrase: '마부작침', hanja: '磨斧作針', sub: '도끼를 갈아 바늘을 만든다. 오늘 느리더라도 포기하지 않으면 언젠가 완성된다.', moods: ['tired', 'exhausted'], weathers: ['cold', 'rain'] },
  { phrase: '권토중래', hanja: '捲土重來', sub: '흙먼지를 털고 다시 일어선다. 오늘 실패하거나 지쳐도 내일 다시 시작하면 그만이다.', moods: ['tired', 'exhausted'], weathers: ['clear', 'hot'] },
  { phrase: '전화위복', hanja: '轉禍爲福', sub: '불행이 뒤집히면 복이 된다. 지금 힘든 상황이 결국 더 나은 방향으로 이어질 운이다.', moods: ['tired', 'exhausted', 'stressed'], weathers: ['rain', 'cold'] },
  { phrase: '고목발춘', hanja: '枯木發春', sub: '마른 나무에도 봄이 온다. 지쳐 있어도 끝이 있고, 끝에서 새로운 것이 반드시 돋아난다.', moods: ['tired', 'exhausted'], weathers: ['rain', 'cold'] },
  { phrase: '불요불굴', hanja: '不撓不屈', sub: '휘지도 굽히지도 않는다. 오늘 버티는 것 자체가 가장 강한 행동이다. 아무것도 안 해도 버티면 된다.', moods: ['tired', 'exhausted'], weathers: ['cold', 'hot', 'rain'] },
  { phrase: '절처봉생', hanja: '絶處逢生', sub: '막다른 곳에서 살 길을 만난다. 오늘 한계라고 느끼는 그 지점이 새로운 길의 시작이다.', moods: ['exhausted', 'stressed'], weathers: ['rain', 'cold'] },
  { phrase: '구사일생', hanja: '九死一生', sub: '아홉 번 죽을 뻔하고 한 번 산다. 이 팀은 이미 최악을 버텨낸 경험이 있다. 오늘도 버텨낼 수 있다.', moods: ['exhausted', 'stressed'], weathers: ['cold', 'rain'] },
  { phrase: '도광양회', hanja: '韜光養晦', sub: '빛을 감추고 때를 기다린다. 지금은 실력을 쌓는 시간이다. 눈에 안 띄어도 괜찮다. 때가 온다.', moods: ['tired', 'exhausted', 'neutral'], weathers: ['rain', 'cold'] },
  { phrase: '대기만성', hanja: '大器晩成', sub: '큰 그릇은 늦게 완성된다. 지금 당장 결과가 없어도 괜찮다. 이 팀의 때는 반드시 온다.', moods: ['tired', 'neutral', 'exhausted'], weathers: ['cold', 'rain'] },
  { phrase: '우공이산', hanja: '愚公移山', sub: '우직하게 포기하지 않으면 산도 옮긴다. 오늘의 한 걸음이 결국 산을 넘는다. 멈추지만 마라.', moods: ['tired', 'exhausted', 'focused'], weathers: ['cold', 'rain', 'hot'] },
  { phrase: '형설지공', hanja: '螢雪之功', sub: '반딧불과 눈빛으로 공부한 노력. 오늘의 작은 노력이 쌓여 나중에 빛나는 결실이 된다.', moods: ['tired', 'focused'], weathers: ['cold', 'clear'] },
  { phrase: '등고자비', hanja: '登高自卑', sub: '높이 오르려면 낮은 곳에서 시작한다. 오늘 기초를 다지는 시간이 나중의 높이를 결정한다.', moods: ['tired', 'focused', 'neutral'], weathers: ['clear', 'cold', 'rain'] },

  // ── 스트레스 (stressed) ────────────────────────────────────────────
  { phrase: '일도양단', hanja: '一刀兩斷', sub: '한 칼에 시원하게 결판낸다. 오늘 복잡하게 생각하지 말고 빠르게 결정하는 게 훨씬 낫다.', moods: ['stressed', 'focused'], weathers: ['hot', 'clear', 'rain'] },
  { phrase: '용호상박', hanja: '龍虎相搏', sub: '용과 호랑이의 팽팽한 맞대결. 오늘의 긴장감이 오히려 팀을 각성시켜준다. 압박 속에서 강해진다.', moods: ['stressed', 'excited'], weathers: ['rain', 'cold', 'hot'] },
  { phrase: '발분망식', hanja: '發憤忘食', sub: '분발해서 밥 먹는 것도 잊어버릴 정도. 오늘 그만큼 집중하고 몰입할 수 있다는 뜻이기도 하다.', moods: ['stressed', 'focused'], weathers: ['cold', 'hot'] },
  { phrase: '결자해지', hanja: '結者解之', sub: '묶은 사람이 직접 풀어야 한다. 오늘 문제의 실마리는 바로 그 문제를 만든 곳에 있다.', moods: ['stressed', 'focused'], weathers: ['clear', 'rain'] },
  { phrase: '노심초사', hanja: '勞心焦思', sub: '마음이 타고 애가 탄다. 그 걱정과 열정이 결국 좋은 결과를 만드는 원동력이 된다.', moods: ['stressed', 'tired'], weathers: ['rain', 'cold'] },
  { phrase: '좌충우돌', hanja: '左衝右突', sub: '이리 부딪히고 저리 부딪히며 나아간다. 시행착오 속에서도 팀은 오늘도 한 발 앞으로 나아간다.', moods: ['stressed', 'excited', 'tired'], weathers: ['hot', 'rain'] },
  { phrase: '오리무중', hanja: '五里霧中', sub: '짙은 안개 속에서 길을 찾는다. 오늘 방향이 보이지 않아도 계속 걷다 보면 안개가 걷힌다.', moods: ['stressed', 'neutral', 'tired'], weathers: ['rain', 'cold'] },
  { phrase: '전전긍긍', hanja: '戰戰兢兢', sub: '신중하고 조심스럽게. 오늘의 신중함이 나중에 큰 실수를 막아준다. 천천히 가는 것도 전략이다.', moods: ['stressed', 'focused'], weathers: ['rain', 'cold'] },
  { phrase: '동분서주', hanja: '東奔西走', sub: '동서남북 바쁘게 뛰어다닌다. 바쁜 오늘, 그 모든 움직임이 헛되지 않다. 다 쌓인다.', moods: ['stressed', 'tired', 'excited'], weathers: ['hot', 'clear', 'rain'] },
  { phrase: '기사회생', hanja: '起死回生', sub: '죽을 뻔했다가 다시 살아난다. 오늘 막혔던 상황에서 극적인 반전이 일어날 운이다.', moods: ['stressed', 'exhausted', 'tired'], weathers: ['rain', 'cold'] },

  // ── 공통 / 다중 기분 ─────────────────────────────────────────────
  { phrase: '수어지교', hanja: '水魚之交', sub: '물과 물고기처럼 서로 없어선 안 되는 관계. 오늘 팀의 유대가 그 어느 때보다 깊다.', moods: ['great', 'joyful', 'relaxed', 'rested'], weathers: ['clear', 'rain', 'cold'] },
  { phrase: '의기투합', hanja: '意氣投合', sub: '뜻이 맞아 힘을 합친다. 오늘 팀원 사이에 신기하게도 호흡이 딱딱 맞아떨어진다.', moods: ['great', 'joyful', 'excited'], weathers: ['clear', 'hot'] },
  { phrase: '이심전심', hanja: '以心傳心', sub: '마음에서 마음으로. 오늘 말 없이도 서로를 이해하는 날이다. 긴 설명 없이도 통한다.', moods: ['relaxed', 'neutral', 'joyful', 'rested'], weathers: ['clear', 'rain', 'cold'] },
  { phrase: '동심협력', hanja: '同心協力', sub: '한마음으로 힘을 합치면 못 할 일이 없다. 오늘 팀으로 움직이면 혼자보다 열 배 강하다.', moods: ['great', 'joyful', 'rested', 'neutral'], weathers: ['clear', 'rain', 'cold'] },
  { phrase: '혼연일체', hanja: '渾然一體', sub: '완전히 하나가 된 팀. 오늘 팀원들 사이의 경계가 사라지고 완벽하게 맞아들어가는 날이다.', moods: ['great', 'joyful', 'focused'], weathers: ['clear', 'rain', 'cold'] },
  { phrase: '상부상조', hanja: '相扶相助', sub: '서로 도우며 이겨낸다. 오늘 힘든 팀원에게 먼저 손을 내밀면 내게도 복이 돌아온다.', moods: ['tired', 'exhausted', 'neutral', 'relaxed'], weathers: ['rain', 'cold', 'clear'] },
  { phrase: '온고지신', hanja: '溫故知新', sub: '옛것을 익혀 새것을 안다. 오늘 팀의 경험치가 최고의 무기다. 과거 방식에서 힌트를 찾아라.', moods: ['neutral', 'relaxed', 'focused', 'tired'], weathers: ['cold', 'rain', 'clear'] },
  { phrase: '가화만사성', hanja: '家和萬事成', sub: '팀이 화목하면 모든 일이 된다. 오늘 이 팀은 이미 절반은 이기고 있다.', moods: ['joyful', 'great', 'rested', 'relaxed'], weathers: ['clear', 'hot', 'rain'] },
  { phrase: '입신양명', hanja: '立身揚名', sub: '뜻을 세우고 이름을 빛낸다. 오늘 팀의 노력이 언젠가 밖에서도 인정받을 날이 온다.', moods: ['focused', 'great', 'excited', 'tired'], weathers: ['clear', 'hot'] },
  { phrase: '지성감천', hanja: '至誠感天', sub: '지극한 정성이 하늘을 감동시킨다. 오늘의 진심 어린 노력은 반드시 상대에게도 통한다.', moods: ['tired', 'focused', 'great'], weathers: ['clear', 'rain', 'cold'] },
  { phrase: '임기응변', hanja: '臨機應變', sub: '상황에 따라 유연하게 대처한다. 오늘 예상 밖의 변수가 와도 이 팀은 거뜬히 넘긴다.', moods: ['excited', 'great', 'stressed', 'neutral'], weathers: ['clear', 'hot', 'rain', 'cold'] },
  { phrase: '환골탈태', hanja: '換骨奪胎', sub: '완전히 새로운 모습으로 거듭난다. 오늘 변화의 시작점에 서 있다. 변화가 두렵지 않은 날이다.', moods: ['excited', 'rested', 'great'], weathers: ['clear', 'hot'] },
  { phrase: '합종연횡', hanja: '合縱連橫', sub: '전략적으로 힘을 합친다. 오늘 팀 내 협력이 가장 강력한 무기가 된다. 혼자 하지 말고 함께 움직여라.', moods: ['great', 'focused', 'joyful'], weathers: ['clear', 'hot', 'rain'] },
  { phrase: '질풍노도', hanja: '疾風怒濤', sub: '거친 바람과 노도처럼. 오늘 이 에너지를 모아 장벽을 통째로 넘어라. 멈추면 지는 날이다.', moods: ['excited', 'stressed', 'great'], weathers: ['hot', 'rain'] },
  { phrase: '막상막하', hanja: '莫上莫下', sub: '위도 아래도 없이 막상막하. 오늘 팀원들의 역량이 고르게 빛난다. 누가 더 잘하는지보다 함께가 답이다.', moods: ['neutral', 'relaxed', 'focused'], weathers: ['clear', 'rain'] },
  { phrase: '산전수전', hanja: '山戰水戰', sub: '온갖 고생을 다 겪어봤다. 오늘의 어려움이 두렵지 않은 이유가 있다. 이 팀은 이미 많은 걸 겪었다.', moods: ['tired', 'exhausted', 'stressed', 'neutral'], weathers: ['rain', 'cold'] },
  { phrase: '오월동주', hanja: '吳越同舟', sub: '적도 같은 배를 타면 협력한다. 오늘 팀 안의 어떤 갈등도 함께 헤쳐나가다 보면 녹아든다.', moods: ['stressed', 'neutral', 'tired'], weathers: ['rain', 'cold'] },
  { phrase: '시종여일', hanja: '始終如一', sub: '시작과 끝이 한결같다. 오늘도 변함없이 최선을 다하는 팀. 그 일관성이 결국 신뢰를 만든다.', moods: ['focused', 'neutral', 'tired', 'great'], weathers: ['clear', 'cold', 'rain'] },
  { phrase: '십년대계', hanja: '十年大計', sub: '10년 앞을 내다보는 큰 계획. 오늘의 결정이 팀의 미래를 만든다. 단기보다 장기로 생각하라.', moods: ['focused', 'great', 'neutral'], weathers: ['clear', 'cold'] },
  { phrase: '경천동지', hanja: '驚天動地', sub: '하늘과 땅을 놀라게 한다. 오늘 이 팀이 만들어낼 결과가 기대된다. 스스로도 놀라게 될 수 있다.', moods: ['excited', 'great', 'joyful'], weathers: ['clear', 'hot'] },
  { phrase: '삼고초려', hanja: '三顧草廬', sub: '세 번 찾아가는 정성. 오늘 한 번 더 시도하는 것이 전부를 바꿀 수 있다. 포기는 내일 해도 늦지 않다.', moods: ['tired', 'exhausted', 'focused'], weathers: ['rain', 'cold'] },
  { phrase: '화룡점정', hanja: '畵龍點睛', sub: '마지막 한 획으로 완성된다. 오늘이 바로 그 결정적인 마지막 한 수를 놓는 날이다.', moods: ['focused', 'great', 'excited'], weathers: ['clear', 'hot', 'rain'] },
  { phrase: '일석이조', hanja: '一石二鳥', sub: '돌 하나로 새 두 마리. 오늘 하나의 결정이 두 가지 문제를 동시에 해결하는 날이다.', moods: ['focused', 'great', 'rested'], weathers: ['clear', 'hot'] },
  { phrase: '설중매화', hanja: '雪中梅花', sub: '눈 속에 핀 매화처럼. 어떤 환경에서도 팀의 아름다움과 실력은 꺾이지 않는다.', moods: ['tired', 'exhausted', 'great', 'rested'], weathers: ['cold'] },
  { phrase: '자업자득', hanja: '自業自得', sub: '자기가 한 일의 결과를 자기가 받는다. 오늘의 좋은 노력이 좋은 결과로 반드시 돌아온다.', moods: ['focused', 'neutral', 'great'], weathers: ['clear', 'rain', 'cold'] },
  { phrase: '공명정대', hanja: '公明正大', sub: '공정하고 밝고 올바르다. 오늘 팀의 결정은 모두가 납득할 수 있을 만큼 투명하다.', moods: ['focused', 'great', 'relaxed'], weathers: ['clear', 'hot'] },
  { phrase: '춘풍화기', hanja: '春風和氣', sub: '봄바람처럼 따스한 기운. 오늘 팀 안에 포근한 온기가 돌아 어떤 대화도 편안하게 흘러간다.', moods: ['great', 'joyful', 'relaxed', 'rested'], weathers: ['clear', 'hot'] },
  { phrase: '주야장천', hanja: '晝夜長川', sub: '밤낮으로 쉬지 않고 흐른다. 오늘의 지침이 훗날 자랑이 될 날이 반드시 온다. 지금은 흘러가는 중이다.', moods: ['exhausted', 'tired', 'stressed'], weathers: ['cold', 'rain'] },
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

// 멤버 관리(설정) 접근을 허용하는 계정. 명시적으로 두 사람만 지정해달라는 요청이라
// (역할이 아니라 "계정" 단위 제한) 여기서는 의도적으로 이메일을 하드코딩한다.
export const SETTINGS_ADMIN_EMAILS = ['ji.kim@egnis.kr', 'daseul.kim@egnis.kr']
