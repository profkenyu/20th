# Terra Incognita

20회 개인전 · Kim Gunwoo

탐사된 적 없는 세계에 착륙한 자율 로버의 마지막 태양광 임무를 다루는 단일 HTML 기반 시네마틱 작품이다. 로버는 지형을 조사하고, 중력·방사선·대기를 측정하며, 낮은 중력에서 바퀴가 일으킨 레골리스 먼지를 남긴다.

## 전시용 파일

[dist/TERRA_INCOGNITA.html](dist/TERRA_INCOGNITA.html)을 사용한다. 외부 파일이나 네트워크 연결이 필요 없는 단일 파일이며, 파일을 직접 열어 실행할 수 있다.

WebGPU를 지원하는 최신 브라우저와 GPU가 필요하다. 전시 전에는 실제 맥북 또는 프로젝터 연결 환경에서 화면 비율, 절전 해제, 브라우저 전체 화면을 확인한다.

## 작품의 시작

첫 화면에는 영문과 한글 서문, 하단 조작 안내가 표시된다. 12초 뒤 서문이 사라지고 로버의 자율 탐사가 시작된다. HUD는 시작 8초 뒤 자동으로 사라지며, 화면 왼쪽 가장자리에 포인터를 대거나 `H`를 눌러 다시 표시할 수 있다.

| 입력 | 기능 |
|---|---|
| `W` `A` `S` `D` / 방향키 | 수동 주행 · 자율 탐사 일시 해제 |
| `Space` | 자율 탐사 재개 |
| `C` | 현재 지형에서 유효한 시네마틱 숏 전환 |
| `L` | 로버 램프 |
| `H` | HUD 고정 / gallery mode 복귀 |

모바일에서는 자동주행이 기본이다. 시작 시 기울기 센서를 활성화하면 기기를 좌우로 기울여 조향할 수 있으며, 하단 버튼으로 주행을 멈추거나 재개한다. 태양광 패널과 전조등은 자동으로 관리된다.

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
npm run fonts      # 한글 텍스트 변경 후 폰트 서브셋 재생성
```

## 구성

```text
engine/                    공통 렌더링, HUD, 사운드, 로버, 먼지 시스템
works/terra_incognita/     작품별 서피스, 설정, 루프, 개발 템플릿
tools/                     빌드 및 검증 스크립트
dist/TERRA_INCOGNITA.html  전시 배포본
```

`works/terra_incognita/surface.js`와 `surface.cpu.js`는 같은 지형을 GPU와 CPU에서 각각 계산한다. CPU 버전은 로버 바퀴 접지와 먼지의 지면 충돌에 사용되므로, 지형을 변경할 때 두 구현의 일관성을 `npm run verify`와 `npm run terrain`으로 반드시 확인한다.

## 전시 운영 체크

- 전시 시작 전 완성본을 직접 열고 서문 → 자율 주행 전환을 확인한다.
- 프로젝터 연결 시 운영체제의 화면 잠금·절전·알림을 비활성화한다.
- 브라우저는 전체 화면으로 두고, 관람 중에는 HUD가 숨은 gallery mode를 기본 상태로 유지한다.
- 네트워크가 없어도 작품은 실행되지만, WebGPU를 지원하지 않는 장비에서는 실행할 수 없다.
