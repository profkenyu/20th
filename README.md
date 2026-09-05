# Terra Incognita

20회 개인전 · Kim Gunwoo

탐사된 적 없는 세계에 착륙한 자율 로버의 마지막 태양광 임무를 다루는 단일 HTML 기반 시네마틱 작품이다. 로버는 지형을 조사하고, 중력·방사선·대기를 측정하며, 낮은 중력에서 바퀴가 일으킨 레골리스 먼지를 남긴다.

## 전시용 파일

[dist/TERRA_INCOGNITA.html](dist/TERRA_INCOGNITA.html)을 사용한다. 외부 파일이나 네트워크 연결이 필요 없는 단일 파일이며, 파일을 직접 열어 실행할 수 있다.

WebGPU를 지원하는 최신 브라우저와 GPU가 필요하다. 전시 전에는 실제 맥북 또는 프로젝터 연결 환경에서 화면 비율, 절전 해제, 브라우저 전체 화면을 확인한다.

## 작품의 시작

첫 화면에는 한글/영문 서문과 명시적인 시작 버튼이 표시된다. 버튼은 1.6초 뒤 활성화되고, 클릭 또는 `Enter`/`Space`로 시작한다. 입력이 없으면 7.2초 뒤 자동 진행한다. 서문이 2.7초 동안 사라진 뒤 Anime.js 타임라인이 실제 로버를 와이어프레임 설계도에서 완성 모델로 조립한다. HUD는 기본적으로 숨겨지며 화면 왼쪽 가장자리에 포인터를 대거나 `H`를 눌러 표시한다.

| 입력 | 기능 |
|---|---|
| `W` `A` `S` `D` / 방향키 | 수동 주행으로 전환 · 수동 모드 유지 |
| `Shift` | 수동 주행 중 고속 주행 |
| `Space` | 자율 탐사 재개 |
| `C` | 로버 후면을 포함한 유효 시네마틱 숏 전환 |
| `L` | 로버 램프 |
| `H` | 엔지니어링 HUD 고정 / 갤러리 모드 복귀 |
| `M` | 앰비언트 사운드 음소거 / 복원 |

모바일에서도 자동 주행이 기본이다. 기울기 센서를 활성화하면 기기를 좌우로 기울여 조향할 수 있다. 센서를 사용할 수 없거나 권한을 허용하지 않은 경우에는 `DRAG TO STEER` 영역을 좌우로 드래그한다. 하단의 `AUTO / MANUAL` 버튼으로 주행 모드를 직접 전환하며, 수동 모드는 사용자가 다시 전환할 때까지 유지된다. 우상단 사운드 버튼은 `TAP FOR SOUND`(시작 필요), `SOUND · ON`(재생), `RESUME SOUND`(iOS 중단 복구), `SOUND · OFF`(사용자 음소거)를 실제 AudioContext 상태에 맞춰 표시한다. 태양광 패널과 전조등은 자동으로 관리된다.

## 개발과 빌드

```bash
npm install
npm run dev
```

서버가 시작되면 `http://localhost:5173/works/terra_incognita/dev.html`을 연다. 루트 `dev.html`도 이 개발 진입점으로 자동 이동한다.

```bash
npm run build      # index.html 및 dist/TERRA_INCOGNITA.html 생성
npm run verify     # 모듈, HUD, 폰트, 단일 파일 검증
npm run terrain    # 지형 기복·경사·로버 주행성 측정
npm run memory     # PLANET 01·02 기록에서 PLANET 03 임무를 합성하는 순수 데이터 검증
npm run harness    # 차량·착륙선·WebGPU 노드 구성 통합 검증
npm run smoke      # 실제 WebGPU 브라우저 스모크 테스트
npm run smoke:mobile # 844×390 터치·드래그·사운드 UX 검증
npm run fonts      # 한글 텍스트 변경 후 폰트 서브셋 재생성
npm run release    # 빌드부터 실제 WebGPU 스모크까지 릴리스 검증
```

전체 작품은 세 행성을 하나의 보존 흐름으로 연결한다. PLANET 01의 구조 자원 4종과 질소·알코올 원료 2종, PLANET 02의 수분 측정은 임무 기억에 남고, 격납된 로버와 착륙선은 Anime.js가 지휘하는 WebGPU 입자장으로 분해·압축·재조립된다. 두 기록의 위상 간섭은 PLANET 03에서 세 개의 지질 기억 교차 결절을 생성한다.

## PLANET 01 물질 행동과 기록

### 관측의 시간과 이동의 기억

P01의 선택·소거 규칙은 유지한다. P02는 세 관측 구간 사이에 0.9초의 공백을 두고, 확인한 고리부터 흔들림을 멈춘다. 이는 실제 센서의 반복 측정이나 확률적 신뢰도가 아닌 작품 내부의 관측 리듬이다.

P03은 재료·수분 기록에 수동 이동 거리, 방향과 정지 시간을 더해 위상·파장과 세 결절의 위치·간격·관측 시간을 결정한다. 삼각함수의 위상 계산은 수학적 계산이며, 유한 후보점 탐색은 수치 근사다. 이동을 지질 기억으로 바꾸는 대응은 예술적 해석이지 실제 지질학 모델이 아니다. AUTO에는 기존 기준장을 적용한다. 이동 요약은 메모리에만 보관하며 시작 화면 복귀 시 지운다.

마지막 결절은 광물 방향이 정렬된 채 남는다. 안내 신호는 사라지고 카메라의 미세 이동이 멈춘다. 12초 후 FIELD ARCHIVE 링크를 표시하고, 45초 후 전시 순환을 재시작한다. 기존 HIGH/MID/LOW 렌더링 등급은 유지하며, 세 등급 모두 같은 결절과 시간 규칙을 사용한다. 추가 입자나 렌더 패스는 없고 마지막 장면에서 계산 디스패치를 중지한다.

각 물질은 장식 효과가 아니라 서로 다른 운동 규칙을 갖는다. 철–니켈은 전단 방향으로 정렬되고, 규산염은 분광 고리를 분리하며, 탄소는 주변 신호를 흡수한다. 전도 격자는 이산 위상에 고정되고, 질소는 확산하며, 알코올은 C–O와 O–H에 대응하는 두 밴드로 진동한다. 질소 Raman과 알코올 분광 표기는 과학적 근거이며, 화면에서의 운동은 실시간 수치 근사이자 예술적 해석이다.

여섯 번째 물질을 획득하면 `FIELD SUBTRACTION`이 발생한다. 선택되지 않은 12개 발현은 조용히 소거되고 실제로 획득한 6개 좌표 흔적만 남는다. FIELD ARCHIVE v3는 기존 P01/P02/P03의 12/7/5 행 구성을 유지하면서, P01의 각 물질을 선택 증거 `EVIDENCE` 1행과 미선택 후보를 합친 `RESOLVED POTENTIAL` 1행으로 기록한다.

## 구성

```text
engine/                    공통 렌더링, HUD, 사운드, 로버, 먼지 시스템
works/terra_incognita/     작품별 서피스, 설정, 루프, 개발 템플릿
tools/                     빌드 및 검증 스크립트
dist/TERRA_INCOGNITA.html  전시 배포본
```

`works/terra_incognita/surface.js`와 `surface.cpu.js`는 같은 지형을 GPU와 CPU에서 각각 계산한다. CPU 버전은 로버 바퀴 접지와 먼지의 지면 충돌에 사용되므로, 지형을 변경할 때 두 구현의 일관성을 `npm run verify`와 `npm run terrain`으로 반드시 확인한다.

### 임무 코드 읽는 순서

- `works/terra_incognita/main.js`: 시스템 초기화와 프레임 실행 순서. 수분 확인은 `recordWaterConfirmation`, 엔딩 진입·갱신은 `beginFinalTableau` / `updateFinalTableau`, 조작 잠금은 `authoredExperienceLock`에서 처리한다.
- `engine/core/mission-memory.js`: 기록 정규화 → 이동 요약 → 위상장 합성 → 결절 선택. 이동 요약의 제한값과 변환 계수는 `JOURNEY`에 모았다.
- `engine/core/water-mission.js`: `update`는 관측 진행과 완료를, `_updateVisuals`는 입자·고리 표시를 담당한다.
- `engine/core/geological-memory.js`: `update`는 임무 진행과 GPU 실행을, `_updateSiteVisuals`는 결절·광물 표시를 담당한다.

원본을 수정한 뒤 `npm run build`로 배포 HTML을 재생성한다. 임무 계산과 관측·엔딩 상태는 `npm run memory`와 `npm run observation`으로 검증한다.

## 전시 운영 체크

- 전시 시작 전 완성본을 직접 열고 서문 → 자율 주행 전환을 확인한다.
- 프로젝터 연결 시 운영체제의 화면 잠금·절전·알림을 비활성화한다.
- 브라우저는 전체 화면으로 두고, 관람 중에는 HUD가 숨은 gallery mode를 기본 상태로 유지한다.
- 네트워크가 없어도 작품은 실행되지만, WebGPU를 지원하지 않는 장비에서는 실행할 수 없다.
- `dist/TERRA_INCOGNITA.html.sha256`으로 전시 파일이 검증본과 같은지 확인한다.

## 전시 문서

- [작품 줄거리·행성별 임무·기기별 조작법](기술문서/01_작품_줄거리_행성별_임무_및_조작법.txt)
