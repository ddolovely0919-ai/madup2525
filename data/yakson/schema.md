# Factbook JSON Schema (v1)

매드업 팩트북 JSON 데이터 스키마. 모든 광고주 팩트북이 이 구조를 따른다.

## 최상위 구조

```json
{
  "meta": { ... },         // 팩트북 메타정보
  "chapters": [ ... ],     // 챕터 정의
  "slides": [ ... ]        // 슬라이드 데이터 (순서대로)
}
```

## meta (팩트북 정보)

```json
{
  "client": "약손명가헬스케어",
  "year": 2026,
  "variant": "② 다중 브랜드형",   // ①/②/③/④ 변형
  "ptDate": "2026-06-16",
  "createdAt": "2026-04-26",
  "updatedAt": "2026-05-27",
  "rfp": "rfp 핵심 요약",
  "owner": "매드업 [팀명/담당자]",
  "description": "팩트북 한 줄 요약"
}
```

## chapters (챕터 정의)

```json
[
  { "id": "ch0", "number": "SECTION 0", "title": "비딩 개요" },
  { "id": "ch1", "number": "CHAPTER 1", "title": "시장환경 · 타겟 · 소비자 인식" },
  ...
]
```

## slides (슬라이드 배열)

각 슬라이드는 다음 필드 조합으로 구성:

```json
{
  "id": "s1-1",                 // 고유 ID (slug)
  "chapter": "ch1",             // 소속 챕터 ID
  "meta": "시장환경",            // 카테고리 라벨 (slide-meta)
  "status": "auto",             // auto | progress | client | madup
  "intro": false,               // 강조 카드 여부 (gradient background)
  "title": "...",               // ❏ 헤드라인 인사이트
  
  "subnotes": [                 // 보조 인사이트
    { "type": "indent-1", "html": "ㄴ ..." },
    { "type": "indent-2", "html": "ㄴㄴ ..." },
    { "type": "arrow",    "html": "▶ ..." }
  ],
  
  "body": "<p>...</p><table>...</table>",   // HTML body (표·리스트 등)
  
  "gallery": [                  // (선택) 제품 갤러리
    { 
      "src": "images/olli-band.jpg", 
      "alt": "...", 
      "name": "올리리라 밴드", 
      "price": "268,000원", 
      "originalPrice": "328,000원",
      "tag": "메인 디바이스"
    }
  ],
  
  "feature": {                  // (선택) 히어로 이미지 + 디테일
    "src": "images/golki-shoulder.jpg",
    "alt": "...",
    "title": "약손명가 숄더 릴렉스 마사저",
    "details": [
      { "label": "가격", "value": "94,000원" },
      ...
    ]
  },
  
  "siteGallery": [              // (선택) 사이트 캡처 갤러리
    {
      "src": "images/capture-yakson-own-home.jpg",
      "alt": "...",
      "badge": "자사몰",        // own | bs | search
      "title": "약손명가 자사몰 메인",
      "url": "yaksonhealthcare.com",
      "notes": ["3 브랜드 통합", "..."]
    }
  ],
  
  "wordcloud": [                // (선택) 워드클라우드
    { "text": "꾸준함", "size": "xxl", "color": "positive" },
    { "text": "효과 느림", "size": "xl",  "color": "negative" },
    ...
  ],
  
  "wcLegend": [                 // (선택) 워드클라우드 범례
    { "color": "#0f766e", "label": "긍정 만족" },
    ...
  ],
  
  "reviews": [                  // (선택) 후기 quote 박스
    {
      "type": "positive",       // positive | negative | neutral
      "tag": "피부결·붓기",
      "quote": "일주일쯤 지나니...",
      "cite": "캐시닥 커뮤니티"
    }
  ],
  
  "sources": [                  // 출처 링크 (footer)
    { "label": "비즈워치 (25.11.21)", "url": "https://..." }
  ],
  
  "sourceNote": "* 캡처일: 2026-05-27 · 자동 캡처 (Playwright)"
}
```

## status 값 (4뱃지)

| value | label | color |
|---|---|---|
| `auto` | 자동 작성 | 그린 #22c55e |
| `progress` | 작성 중 | 옐로우 #eab308 |
| `client` | 광고주 확인 필요 | 오렌지 #f97316 |
| `madup` | 매드업 도구 필요 | 블루 #3b82f6 |

## 워드클라우드 size·color

**size**: `xxl` | `xl` | `lg` | `md` | `sm`  
**color**: `positive` | `negative` | `motivation` | `scenario` | `neutral`

## site capture badge

**badge**: `own` (자사몰, 청록) | `bs` (브스, 파랑) | `search` (검색결과, 보라)
