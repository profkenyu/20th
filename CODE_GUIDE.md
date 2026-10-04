# 20th 코드 안내

HTML과 JavaScript는 2칸 들여쓰기와 줄바꿈으로 정리했습니다. HTML 안의 스타일과 실행 코드는 각 `<style>`, `<script>` 영역에서 찾을 수 있습니다.

## 파일 역할

| 파일 | 역할 |
| --- | --- |
| index.html | 전시의 시작과 설계도 장면 |
| planet-01.html · planet-02.html · planet-03.html | 각 행성의 탐사 화면 |
| planet-engine.js | 세 행성이 함께 사용하는 탐사 엔진 |
| space-01.html · space-02.html | 행성 사이의 이동 장면과 기내 사운드 |
| migration.html | 이주선 항해와 심우주 공명 |
| arrival.html | 도착 장면과 밝아지는 공명 |
| ending.html | 마지막 문구와 새로운 시작의 화음 |
| field-archive.html | 탐사 기록 |
| SHA256SUMS | 실행 파일의 무결성 확인용 해시 |

## 사운드 코드를 찾는 방법

수정한 다섯 HTML에서 아래 이름을 검색하면 해당 영역으로 이동할 수 있습니다.

- `journeyScore`: 장면 시간에 따른 음향 구성. 각 화음의 세기, 잔향량, 음색, 시작과 끝의 페이드를 정합니다.
- `createJourneyAudio`: Tone.js 발진기, 필터, 잔향, 출력, 음소거와 일시정지 처리입니다.
- `installJourneyControls`: 사운드 버튼, 첫 입력으로 소리를 켜는 처리, 페이지 사이의 음소거 설정입니다.
- `works/space/main.js`, `works/first_dawn/main.js`, `works/first_dawn/ending.js`: 각 화면의 실행부를 구분하는 주석입니다.

각 HTML 앞쪽에는 함께 포함된 Three.js 또는 Tone.js 라이브러리가 있습니다. 직접 작성한 장면과 사운드 코드는 뒤쪽의 `works/` 구분 주석부터 확인하면 됩니다. 다섯 페이지는 외부 CDN 없이 열리는 구조를 유지합니다.

## 사운드 흐름

이동 1의 가까운 기내 진동 → 이동 2의 넓어지는 울림 → 이주의 긴 심우주 공명 → 도착의 긴장 해소 → 마지막 문구와 함께 열리는 장엄한 화음 → 잔향과 침묵.

심우주의 소리는 진공에서 전달되는 실제 음향을 재현한 것이 아니라 작품의 예술적 해석입니다. HIGH·MID·LOW는 같은 화음과 시간 구성을 사용하며, 잔향 길이와 반향 처리를 조정합니다.

## 제작 소스와 다시 내보내기

제작 소스는 상위 폴더의 `v38.0 (빌드도구포함)/works/`에 있습니다. 사운드는 `works/shared/journey-score.js`, `journey-audio.js`, `journey-controls.js`에서 수정합니다.

제작 폴더에서 `npm run build`, `npm run verify`를 실행하고, `node tools/export-readable.mjs`로 수정한 다섯 페이지를 20th에 내보내면서 전체 실행 파일의 서식과 해시를 정리합니다. `node tools/journey-audio.mjs`는 다섯 장면의 소리와 화면 보존을 검사합니다.

## 재질과 텍스처

- `aerospaceTextures`: 금속 가공 결, 도장, 단열재 접힘, 열차폐재, 방열판, 고무의 색·높이·거칠기 텍스처입니다.
- `aerospaceNode`: 로버와 착륙·탐사선의 표면 요철과 반사에 사용하는 노드입니다.
- `flightMaterial`: 이동 장면의 재질별 반사와 사용 흔적입니다.
- `installVoyageAgeing`: 이주선의 재질별 오염, 도장면의 국부적 손상, 모델 크기에 맞춘 미세 요철입니다.

제작 소스는 `works/shared/aerospace-textures.js`, `engine/vehicle/aerospace-node.js`, `works/space/surfaces.js`, `works/first_dawn/voyage-materials.js`입니다. 텍스처는 절차적으로 만든 표면이며 실제 표본의 계측 데이터는 아닙니다. HIGH/MID/LOW 해상도는 512/256/128이고, LOW에서는 표면 요철 계산을 생략합니다.
