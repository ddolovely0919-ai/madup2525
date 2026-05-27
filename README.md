# MADUP Factbook Dashboard

매드업 비딩 팩트북을 **JSON 데이터 + 동적 렌더링 + 편집 UI**로 관리하는 정적 웹 대시보드.

기존 `약손명가헬스케어_팩트북/FACTBOOK.html` (정적 HTML) 의 진화 버전.

## 📁 디렉토리 구조

```
factbook-app/
├── index.html              ← 광고주 선택 (랜딩)
├── viewer.html             ← 슬라이드 뷰어 + 편집 UI
├── README.md               ← 이 문서
├── assets/
│   ├── style.css           ← 공통 스타일
│   └── viewer.js           ← 렌더링·편집 로직
├── scripts/
│   └── html_to_json.py     ← HTML→JSON 추출 (기존 팩트북 마이그레이션용)
└── data/
    └── yakson/             ← 광고주별 폴더
        ├── factbook.json   ← 슬라이드 데이터
        ├── schema.md       ← JSON 스키마 명세
        └── images/         ← 제품·캡처 이미지 (33장)
```

## 🚀 로컬 실행

브라우저 보안 정책상 `file://`에서는 fetch가 차단되므로 **간단한 로컬 서버**를 띄워야 합니다.

```bash
cd /Users/gimjuhyeon/Desktop/제안서_자동화
python3 -m http.server 8000

# 브라우저 접속
# http://localhost:8000/factbook-app/                       ← 광고주 선택
# http://localhost:8000/factbook-app/viewer.html?c=yakson   ← 약손명가 팩트북
```

## ✏️ 편집 모드 사용법

### 1. 편집 모드 ON
- 우상단 **✏️ 편집 모드** 클릭

### 2. 편집 가능한 요소
- 헤드라인 인사이트 (제목)
- 보조 인사이트 (`ㄴ`, `▶` subnotes)
- 본문 (표·리스트 등)
- Status 뱃지 (클릭하면 4가지 status 순환: auto → progress → client → madup)

### 3. 슬라이드 조작
- 우상단 `↑ ↓ ⎘ 🗑` 버튼: 위로 이동 / 아래로 이동 / 복제 / 삭제
- 사이드바 **+ 새 슬라이드** 버튼: 챕터 선택 후 새 슬라이드 추가

### 4. 저장
- **자동 저장**: 1초 후 localStorage (브라우저)에 자동 저장
- **수동 저장**: 사이드바 💾 로컬 저장
- **JSON 내보내기**: 우상단 ⬇ JSON (백업·동료 공유용)
- **JSON 가져오기**: 우상단 ⬆ Import

## 📥 새 광고주 팩트북 만들기

### 방법 A: 빈 팩트북 시작 (UI 사용)
- `index.html`에서 **+ 새 광고주** 클릭
- 광고주 ID(영문 slug)·명·연도·변형 입력
- 빈 챕터 8개 + 사전 페이지 4개로 시작 → 편집 모드로 채워나가기

### 방법 B: 기존 HTML 팩트북 마이그레이션
- 기존 HTML 팩트북을 `factbook-app/scripts/html_to_json.py` 로 추출
- `data/<slug>/factbook.json` 생성
- `index.html`의 `CLIENTS` 배열에 새 광고주 추가

## 🌐 웹 호스팅 (URL로 공유)

### Option A: GitHub Pages (가장 쉬움, 무료)

```bash
cd /Users/gimjuhyeon/Desktop/제안서_자동화
git init
git add factbook-app/
git commit -m "Initial factbook dashboard"

# GitHub에 새 repo 생성 후
git remote add origin git@github.com:<USERNAME>/madup-factbook.git
git push -u origin main

# GitHub repo 설정 > Pages
# - Source: main branch /factbook-app 폴더
# - 또는 root 폴더
```

배포 후 URL: `https://<USERNAME>.github.io/madup-factbook/factbook-app/`

### Option B: Cloudflare Pages (속도 빠름, 무료)

```bash
# Wrangler CLI 설치
npm install -g wrangler
wrangler login

# 배포
wrangler pages publish factbook-app --project-name madup-factbook
```

URL: `https://madup-factbook.pages.dev`

### Option C: 매드업 사내 서버

`factbook-app/` 폴더 전체를 nginx·Apache 등에 정적 서빙하면 끝.

## 🔄 데이터 흐름

```
[Python 스크립트로 HTML→JSON 추출]
        ↓
data/<client>/factbook.json
        ↓
[viewer.js가 fetch → 렌더링]
        ↓
[브라우저에서 편집 → localStorage 저장]
        ↓
[JSON 내보내기 → data/<client>/factbook.json에 덮어쓰기 → git commit]
        ↓
[웹 호스팅 → 팀 전체 공유]
```

## 🎨 컴포넌트 카탈로그

`data/<client>/factbook.json` 의 각 슬라이드는 다음 컴포넌트를 조합할 수 있음:

- **subnotes**: `ㄴ` 들여쓰기 · `▶` 시사점
- **gallery**: 제품 라인업 그리드 (이미지 + 가격 + 태그)
- **feature**: 히어로 이미지 + 디테일 박스
- **siteGallery**: 사이트 캡처 갤러리 (자사몰 vs 브스 vs 검색)
- **wordcloud**: 키워드 워드클라우드 (5단계 크기 × 5감정 색)
- **reviews**: 후기 quote 박스 (positive / negative / neutral)
- **body**: 자유 HTML (표 · 리스트 · blockquote)

상세 스키마는 [data/yakson/schema.md](data/yakson/schema.md) 참조.

## 🤝 팀 협업 워크플로우 (권장)

### 단순 협업 (Git 기반)
1. 각자 로컬에서 편집 → JSON 내보내기 → git commit & push
2. 동료가 pull → JSON 가져오기 → 자기 작업 진행
3. 충돌 발생 시 JSON merge

### 광고주별 분담
1. 광고주마다 별도 폴더 (`data/yakson/`, `data/samsung-card/` 등)
2. 광고주별로 담당 팀원만 작업 → 충돌 최소화

### Status 뱃지 활용
- `auto`: WebSearch·자동 수집 완료
- `progress`: 작성 중 (담당자 지정 영역)
- `client`: 광고주 자료 받은 후 보강 필요
- `madup`: 매드업 내부 도구(MILOT·Lever Xpert·모바일인덱스 등) 활용 필요

## 📊 현재 등록 광고주

| 광고주 | 변형 | 팩트북 | 제안서 | Status |
|---|---|---|---|---|
| **약손명가헬스케어** | ② 다중 브랜드형 | 74 슬라이드 | [38 슬라이드 + PDF](proposals/yakson-healthcare/) | 65 / 1 / 5 / 3 |

## ⚙️ 기술 스택

- **Frontend**: Vanilla HTML/CSS/JS (의존성 0)
- **Data**: 정적 JSON 파일
- **저장**: localStorage (개인) + JSON export·import (협업)
- **호스팅**: 정적 호스팅 어디든 (GitHub Pages / Cloudflare Pages / nginx)

## 🛠 향후 확장 (Phase 3 이후)

- [ ] 이미지 드래그&드롭 업로드 (현재는 src 경로 수동 편집)
- [ ] 슬라이드 위/아래 이동 → drag&drop 정렬
- [ ] 마크다운 입력 지원 (subnote·body)
- [ ] 광고주별 manifest.json (자동 인덱싱)
- [ ] 다중 사용자 동시 편집 (Supabase + Realtime)
- [ ] market-proposal skill 직접 연동 (팩트북 → 제안서 자동 생성)
- [ ] PT 발표 모드 (전체화면 슬라이드쇼)

## 🐛 알려진 제약

1. **file:// 프로토콜에서 fetch 차단** — 로컬 서버 필수 (`python3 -m http.server`)
2. **localStorage 한계** — 브라우저당 ~5MB, 큰 팩트북은 JSON export로 백업 권장
3. **이미지는 별도 경로** — 현재 이미지 업로드 UI 없음, 수동으로 `images/` 폴더 추가 후 src 편집
4. **동시 편집 X** — Phase 3 SaaS로 진화 시 해결

---

## 📞 도움 / 피드백
fact-book skill: `~/.claude/skills/fact-book/SKILL.md` 참조
