# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# 회의창 데이터: 미리받기·캐시·정합성 규칙

회의창(`src/app/page.tsx`의 `renderMeetingDetail`)을 열 때 쓰는 데이터는 셋이다. 셋 다 같은 캐시 규칙을 따른다.

| 데이터 | 조회 | 상태·캐시 위치 |
|---|---|---|
| 결정·액션·근태/계약 메모 | `/api/meeting-items` | `page.tsx` `meetingItemsCache`, `loadMeetingItems` |
| 팀원 자유 메모(진행사항) | `/api/meeting-progress` | `page.tsx` `meetingProgressCache`, `loadMeetingProgress` |
| 안건·업무보고 표 | `/api/report-items` | `src/lib/useWorkReport.ts` `reportCache` |

안건 메모(회의 본문)는 회의 목록에 들어 있어 캐시 대상이 아니다. 열 때 `/api/meetings?id=`로 최신인지 확인하고, 저장은 `agenda_version`으로 충돌을 막는다(OCC).

## 동작 구조
- **미리받기** `prefetchMeeting(m)`: 달력·검색 결과·리마인더 모달/위젯에 붙어 있다. 마우스·터치(`onPointerEnter`)와 키보드 포커스(`onFocus`) 모두 반응한다(`meetingPrefetchProps`, `onPrefetchMeeting`). 홈 진입 시에는 이번 주 회의를 최대 `WEEK_PREFETCH_LIMIT`(3)개, 브라우저가 한가할 때 한 회의씩 차례로 받는다.
- **캐시 유효성** `isMeetingPartFresh` / `isReportCacheFresh`: 서버와 맞춘 지 `MEETING_CACHE_TTL_MS`(5분) 안이고, 무효화 채널이 연결돼 있을 때만 유효하다. 유효한 캐시는 회의창에 먼저 그리고, 그 뒤 항상 다시 조회해 맞춘다.
- **진행 중 요청 공유**: `meetingInflight` / `prefetching`에 `{ p, token }`으로 둔다. 회의창을 열 때의 첫 조회(`reuse = true`)만 이어받고, 그사이 세대가 바뀌었으면 이어받지 않는다.
- **세대 토큰**: `meetingToken` / `reportToken`. 무효화할 때와 회의를 닫거나 옮길 때 최신값을 남길 때(write-back) 올라간다. 조회는 시작 시점의 토큰이 그대로일 때만 캐시에 쓴다.
- **write-back**: 회의를 옮기거나 닫는 effect 정리 단계에서, 서버에서 받아 실시간으로 맞춰 온 화면 값(live)을 캐시에 남기고 세대를 올린다.
- **실시간 무효화 채널** `meeting-cache-invalidate`(page에 1개):
  - `team_log_meeting_items` / `_meeting_progress` / `_report_updates` / `_report_items`의 변경을 받아 해당 회의 캐시를 무효로 한다.
  - 삭제 이벤트에는 `meeting_id`가 없어서(REPLICA IDENTITY 기본) 그 종류 캐시를 전부 무효로 한다.
  - `report_items`는 날짜로 걸리는 행이라 바뀌면 표 캐시 전체를 무효로 한다.
  - 연결 상태가 바뀔 때마다 전체를 무효로 하고, `SUBSCRIBED`일 때만 캐시를 믿는다(`setMeetingCacheTrusted`).
- **표시 상태**: 결정·액션 쪽은 `itemsLoadedFor`(받음) / `itemsErrorFor`(실패), 표는 `workReport.loaded` / `loadFailed`로 구분한다. 조회 중에는 "불러오는 중…", 실패하면 "불러오지 못했습니다 · 다시 시도", 받은 뒤에만 빈 목록 문구를 띄운다(`itemsEmptyText`, `reportLoadingText`).

## 정합성 규칙 (조회·저장·전환 로직을 고칠 때 유지)
1. **화면 반영 전 두 가지를 확인한다.** 응답이 지금 선택한 회의 것인지(`selectedMeetingIdRef` / `meetingIdRef`), 가장 나중에 시작한 조회인지(`itemsLoadSeqRef` / `progressLoadSeqRef` / `loadSeqRef`). 늦게 온 옛 응답이 최신 화면을 덮으면 안 된다.
2. **캐시에 쓸 때는 시작 시점 토큰을 넘긴다**(`putMeetingPart(..., token)` / `putReportCache(..., token)`). 토큰 없이 쓰는 건 write-back뿐이고, 쓴 직후 반드시 세대를 올린다(`bumpMeetingGen` / `bumpReportGen`).
3. **캐시는 fresh 함수로만 읽는다.** Map을 직접 읽어 그리지 않는다. 오래됐거나 믿을 수 없는 캐시는 그리지 않고 비워 둔다.
4. **실시간 재조회는 미리받기 응답을 이어받지 않는다**(`reuse` 없이 호출). 변경 전에 시작된 응답일 수 있다.
5. **회의창 목록은 회의 id로 걸러 쓴다.** `meetingItems`, `prevMeetingItems`는 `meeting_id`로 거른 파생값이다. state엔 전환 직후의 직전 회의 항목이나, 옮긴 뒤 도착한 저장 응답이 남을 수 있으니 이 필터를 없애지 않는다. 팀원 메모는 사용처마다 `meeting_id`로 찾고, 표 훅은 `data.meetingId`를 비교한다.
6. **저장은 호출 시점의 회의 id로 보낸다**(클로저나 인자로 고정). 저장 도중 회의를 옮겨도 원래 회의로 기록돼야 한다. 입력 중 전환을 막는 `guardComposerAnd` 확인창은 유지한다.
7. **캐시는 표시를 빠르게 할 뿐이다.** 저장 정합성은 서버 쪽 장치(안건 `agenda_version` 409, 업무보고 칸 version, 칸 잠금)가 맡는다. 이 장치들을 우회하거나 캐시 값으로 대신하지 않는다.
8. **회의창에 데이터를 새로 붙일 때** 같은 규칙(fresh 확인·토큰·순번·회의 id 확인)을 적용한다. 그 테이블은 무효화 채널에 추가하고, `supabase_realtime` publication에 들어 있는지 실제 DB에서 확인한다(빠져 있으면 오류 없이 신호만 안 온다).
9. **빈 상태 문구는 "받은 뒤"에만 띄운다.** 실패와 빈 데이터를 섞지 않는다.

## 검증·운영 주의
- 성능 측정은 dev 모드로 하지 않는다(렌더가 느려 캐시 효과가 가려진다). `npx next build && npx next start -p 3003`로 잰다. Next 16의 dev는 `.next/dev`를 써서 dev 서버와 동시에 띄울 수 있다.
- 브라우저 자동화 중 `guardComposerAnd`의 `confirm`이 뜨면 탭이 멈춘다. 테스트 전에 `window.confirm`을 대체해 둔다.
- 수정이 들어가는 테스트는 테스트용 회의(예: 날짜 2099-01-05)에서만 하고, 끝나면 항목과 회의를 지운다. 실제 회의 데이터는 건드리지 않는다.
- Vercel 함수 리전은 DB(`ap-south-1`)에 맞춘 `bom1`(`vercel.json`)이다. 바꾸면 요청마다 대륙 간 DB 왕복이 생긴다. 실행 리전은 로그인한 상태의 API 응답 헤더 `x-vercel-id`로 확인한다.
