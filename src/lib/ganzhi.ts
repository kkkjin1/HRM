// 만세력 60갑자(일진) 계산 + 오늘의 운세 해석.
// 일진 계산은 율리우스일(JDN) 기반 정통 공식이라 저작권과 무관한 순수 수학이고,
// 60가지 해석 문구는 실제 운세/사주 서비스를 베끼지 않고 이 파일에서 직접 새로 썼다.
// (60갑자는 10천간 × 12지지의 최소공배수라 정확히 60일 주기로 반복된다 — 실제 전통 체계 그대로.)

const STEMS = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계']
const BRANCHES = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해']

export type GanzhiFortune = { general: string; color: string; item: string; advice: string }

// 그레고리력 → 율리우스일(JDN). Fliegel & Van Flandern 공식 — 표준 천문 계산 공식.
function toJulianDayNumber(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12)
  const y2 = y + 4800 - a
  const m2 = m + 12 * a - 3
  return d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 + Math.floor(y2 / 4) - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045
}

// dateStr: 'YYYY-MM-DD' (서버 날짜, today_date() RPC 결과를 그대로 넣는다).
// 반환값 0~59가 갑자~계해 순서와 그대로 대응한다 (아래 GANZHI_FORTUNES와 같은 인덱스).
export function ganzhiIndexOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const jdn = toJulianDayNumber(y, m, d)
  return ((jdn + 49) % 60 + 60) % 60
}

export function ganzhiNameOf(index: number): string {
  return `${STEMS[index % 10]}${BRANCHES[index % 12]}`
}

// 인덱스 0(갑자) ~ 59(계해) 순서 그대로.
export const GANZHI_FORTUNES: GanzhiFortune[] = [
  { general: '새로운 아이디어가 유연하게 흘러가는 날입니다.', color: '연두', item: '물병', advice: '고집부리지 말고 흐름에 맡겨보세요.' }, // 갑자
  { general: '천천히 자라는 것들이 힘을 얻는 날입니다.', color: '카키', item: '화분', advice: '당장 결과가 안 보여도 계속 쌓아가세요.' }, // 을축
  { general: '새로 벌인 일에 유독 힘이 실리는 날입니다.', color: '빨강', item: '명함', advice: '미루던 걸 오늘 시작해보세요.' }, // 병인
  { general: '기세가 오르는 날, 자신감을 가져도 됩니다.', color: '다홍', item: '운동화', advice: '적극적으로 나서보세요.' }, // 정묘
  { general: '흔들림 없이 묵묵히 가는 게 정답인 날입니다.', color: '황토색', item: '돌', advice: '조급해하지 않아도 됩니다.' }, // 무진
  { general: '믿음이 쌓이는 대화가 오가는 날입니다.', color: '노랑', item: '찻잔', advice: '진심을 담아 말하면 통합니다.' }, // 기사
  { general: '결정을 미루지 않는 게 이득인 날입니다.', color: '은색', item: '시계', advice: '고민은 짧게, 실행은 바로 하세요.' }, // 경오
  { general: '복잡한 걸 정리하면 마음이 편해지는 날입니다.', color: '회갈색', item: '폴더', advice: '책상부터 정리해보세요.' }, // 신미
  { general: '부드럽지만 분명하게 말하는 게 통하는 날입니다.', color: '은청색', item: '노트북', advice: '돌려 말하지 말고 핵심만 짚으세요.' }, // 임신
  { general: '대화 끝에 깔끔한 결론이 나는 날입니다.', color: '백금색', item: '메모지', advice: '회의는 짧게 끝내도 충분합니다.' }, // 계유
  { general: '새로 시작하기 전에 정리부터 하면 좋은 날입니다.', color: '고동색', item: '박스', advice: '버릴 건 버리고 시작하세요.' }, // 갑술
  { general: '물 흐르듯 자연스럽게 성장하는 날입니다.', color: '옥색', item: '화분', advice: '무리하지 않아도 잘 자랍니다.' }, // 을해
  { general: '뜨거운 마음을 침착하게 다스리면 좋은 날입니다.', color: '진홍', item: '물컵', advice: '욱하는 순간 한 번 숨을 고르세요.' }, // 병자
  { general: '꾸준함이 결국 인정받는 날입니다.', color: '갈색', item: '다이어리', advice: '오늘도 그냥 하던 대로 하세요.' }, // 정축
  { general: '낯선 시작도 의외로 안정적으로 자리잡는 날입니다.', color: '연갈색', item: '화분', advice: '처음이라 걱정 말고 시작하세요.' }, // 무인
  { general: '서두르지 않아도 될 일이 잘 풀리는 날입니다.', color: '연두', item: '차', advice: '속도보다 방향을 먼저 정하세요.' }, // 기묘
  { general: '확실한 근거를 갖고 결정하면 흔들림 없는 날입니다.', color: '회색', item: '서류철', advice: '결정 전에 자료부터 챙기세요.' }, // 경진
  { general: '말이 명확할수록 일이 빨리 풀리는 날입니다.', color: '주홍', item: '볼펜', advice: '애매하게 말하지 마세요.' }, // 신사
  { general: '부드러운 태도가 오히려 추진력이 되는 날입니다.', color: '청록', item: '운동화', advice: '강하게 밀어붙이기보다 설득해보세요.' }, // 임오
  { general: '차분한 대화가 관계를 다지는 날입니다.', color: '베이지', item: '찻잔', advice: '급한 말은 하루 묵혀두세요.' }, // 계미
  { general: '정리하면서 오히려 더 크게 뻗어나가는 날입니다.', color: '연두', item: '라벨지', advice: '버리는 것도 성장의 일부입니다.' }, // 갑신
  { general: '부드럽지만 분명한 결정을 내리기 좋은 날입니다.', color: '은백색', item: '안경', advice: '우유부단함은 오늘만큼은 잠깐 넣어두세요.' }, // 을유
  { general: '달아오른 일을 깔끔하게 마무리 짓는 날입니다.', color: '적갈색', item: '체크리스트', advice: '끝까지 힘을 빼지 마세요.' }, // 병술
  { general: '바쁜 중에도 여유를 챙기면 더 잘 풀리는 날입니다.', color: '코랄', item: '물병', advice: '잠깐의 휴식을 죄책감 없이 가지세요.' }, // 정해
  { general: '단단하면서도 유연하게 대응하기 좋은 날입니다.', color: '짙은 베이지', item: '우산', advice: '원칙은 지키되 융통성을 발휘하세요.' }, // 무자
  { general: '신중하게 다진 결정이 오래가는 날입니다.', color: '짙은 갈색', item: '돌', advice: '빠른 결정보다 확실한 결정을 하세요.' }, // 기축
  { general: '새로운 시도에 과감해도 되는 날입니다.', color: '은색', item: '명함', advice: '망설이던 제안을 오늘 던져보세요.' }, // 경인
  { general: '분명한 목표를 세우면 잘 풀리는 날입니다.', color: '화이트', item: '다이어리', advice: '오늘 할 일 3가지만 정해보세요.' }, // 신묘
  { general: '탄탄한 기반 위에서 유연하게 움직이는 날입니다.', color: '청회색', item: '폴더', advice: '기본기를 한 번 더 점검하세요.' }, // 임진
  { general: '활기찬 대화가 좋은 결과로 이어지는 날입니다.', color: '산호색', item: '휴대폰', advice: '먼저 안부를 물어보세요.' }, // 계사
  { general: '의욕이 넘치는 만큼 실제로도 진도가 나가는 날입니다.', color: '빨강', item: '운동화', advice: '오늘 에너지를 아끼지 말고 써보세요.' }, // 갑오
  { general: '무리하지 않고도 안정적으로 나아가는 날입니다.', color: '연갈색', item: '쿠션', advice: '속도 조절이 관건입니다.' }, // 을미
  { general: '뜨거운 의욕을 체계적으로 풀어내면 좋은 날입니다.', color: '주황', item: '체크리스트', advice: '하고 싶은 걸 순서대로 적어보세요.' }, // 병신
  { general: '확실하게 표현할수록 인정받는 날입니다.', color: '금색', item: '명함', advice: '성과를 숨기지 말고 알리세요.' }, // 정유
  { general: '벌여둔 일을 깔끔히 마무리하기 좋은 날입니다.', color: '황토색', item: '박스', advice: '미완성인 것부터 끝내세요.' }, // 무술
  { general: '믿고 맡기면 오히려 잘 풀리는 날입니다.', color: '베이지', item: '차', advice: '혼자 다 하려 하지 마세요.' }, // 기해
  { general: '단호하지만 유연하게 대응하면 좋은 날입니다.', color: '은색', item: '물병', advice: '원칙은 지키되 상황은 살피세요.' }, // 경자
  { general: '체계를 잡아두면 오래가는 날입니다.', color: '짙은 회색', item: '서랍정리함', advice: '규칙을 하나 정해서 지켜보세요.' }, // 신축
  { general: '새로운 걸 부드럽게 받아들이기 좋은 날입니다.', color: '청록', item: '화분', advice: '낯선 제안도 일단 들어보세요.' }, // 임인
  { general: '대화를 통해 한 단계 올라서는 날입니다.', color: '연보라', item: '메모지', advice: '질문을 많이 던져보세요.' }, // 계묘
  { general: '탄탄히 다지면서 자라는 날입니다.', color: '초록', item: '다이어리', advice: '기초를 다지는 데 시간을 써도 아깝지 않습니다.' }, // 갑진
  { general: '부드러움 속에 은근한 힘이 있는 날입니다.', color: '산호색', item: '손편지', advice: '강하게 말하지 않아도 뜻은 전달됩니다.' }, // 을사
  { general: '열정이 최고조에 달하는 날입니다.', color: '선명한 빨강', item: '운동화', advice: '오늘의 에너지를 중요한 일에 쓰세요.' }, // 병오
  { general: '활기차면서도 안정감 있게 진행되는 날입니다.', color: '주황', item: '쿠션', advice: '무리하지 않는 선에서 밀어붙이세요.' }, // 정미
  { general: '믿음직하게 마무리 짓는 날입니다.', color: '황갈색', item: '서류철', advice: '약속한 건 오늘 안에 지키세요.' }, // 무신
  { general: '차분하게 정리하면 명확해지는 날입니다.', color: '아이보리', item: '안경', advice: '복잡하면 목록부터 만들어보세요.' }, // 기유
  { general: '결단을 내려 마무리 짓기 좋은 날입니다.', color: '회색', item: '체크리스트', advice: '미루던 결정을 오늘 내리세요.' }, // 경술
  { general: '정리 후 찾아오는 여유를 즐기는 날입니다.', color: '은청색', item: '차', advice: '끝낸 일은 홀가분하게 잊으세요.' }, // 신해
  { general: '유연함이 최고조에 달하는 날, 어떤 변화도 잘 받아들여집니다.', color: '남색', item: '물병', advice: '계획이 틀어져도 당황하지 마세요.' }, // 임자
  { general: '안정적인 대화가 신뢰를 쌓는 날입니다.', color: '짙은 베이지', item: '찻잔', advice: '천천히, 그러나 확실하게 말하세요.' }, // 계축
  { general: '성장 욕구가 최고조에 달하는 날입니다.', color: '진초록', item: '다이어리', advice: '배우고 싶은 걸 오늘 하나 시도하세요.' }, // 갑인
  { general: '부드럽게 치고 올라가는 날입니다.', color: '연두', item: '운동화', advice: '무리한 힘보다 자연스러운 흐름을 타세요.' }, // 을묘
  { general: '뜨거운 의지가 단단한 결과로 이어지는 날입니다.', color: '적갈색', item: '서류철', advice: '기초 작업에 정성을 들이세요.' }, // 병진
  { general: '에너지가 폭발적으로 터지는 날입니다.', color: '선명한 주황', item: '운동화', advice: '오늘은 미루지 말고 바로 움직이세요.' }, // 정사
  { general: '안정감 있는 추진력이 발휘되는 날입니다.', color: '황토색', item: '물병', advice: '꾸준한 페이스를 유지하세요.' }, // 무오
  { general: '신뢰가 최고조에 달하는 날, 사람들이 자연스럽게 따릅니다.', color: '짙은 베이지', item: '명함', advice: '리더 역할을 피하지 마세요.' }, // 기미
  { general: '결단력이 최고조에 달하는 날입니다.', color: '은색', item: '시계', advice: '빠르고 확실하게 결정하세요.' }, // 경신
  { general: '정리정돈이 최고조로 잘 되는 날입니다.', color: '백금색', item: '서랍정리함', advice: '밀린 정리를 오늘 끝내보세요.' }, // 신유
  { general: '부드럽게 마무리 짓기 좋은 날입니다.', color: '짙은 청색', item: '체크리스트', advice: '끝맺음을 깔끔하게 하세요.' }, // 임술
  { general: '소통 능력이 최고조에 달하는 날, 어떤 이야기도 잘 통합니다.', color: '짙은 남색', item: '휴대폰', advice: '어려운 대화는 오늘 시도해보세요.' }, // 계해
]
