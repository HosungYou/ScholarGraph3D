# ScholarGraph3D v4.0 — Boolean Search & Personalized Recommendations

> **Version:** 1.0 | **Date:** 2026-02-25
> **Author:** Planning Document
> **Status:** Draft — Awaiting Review
> **Related:** [PRD.md](./PRD.md) | [SPEC.md](./SPEC.md) | [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Executive Summary

v4.0은 ScholarGraph3D에 두 가지 핵심 기능을 추가합니다:

1. **Boolean Search** — AND, OR, NOT 연산자와 고급 필터(연도, 분야)를 지원하는 구조화된 검색
2. **Personalized Recommendation System** — 연구자 프로필 생성(회원가입 시) + 탐색 이력 기반 논문 추천, 랜딩 페이지와 대시보드에 통합

---

## Part 1: Boolean Search

### 1.1 현재 상태 분석

#### 제약사항
- Semantic Scholar `/paper/search` API는 **Boolean 연산자를 네이티브로 지원하지 않음**
- 쿼리는 자연어 문자열로 전달되어 S2 내부 검색 엔진이 키워드 매칭 처리
- S2가 지원하는 파라미터: `year` (범위), `fieldsOfStudy` (쉼표 구분), `limit`, `offset`

#### 핵심 도전
> S2 API의 한계 내에서 Boolean 검색 경험을 어떻게 제공할 것인가?

### 1.2 설계 방향

#### Option A: Client-Side Boolean Parsing (권장)

```
사용자 입력: "AI adoption AND healthcare NOT robotics"
          ↓
   [쿼리 파서 (프론트엔드)]
          ↓
   분석 결과:
   - include_terms: ["AI adoption", "healthcare"]
   - exclude_terms: ["robotics"]
   - operator: AND
          ↓
   [S2 API 호출]
   - query: "AI adoption healthcare"  ← AND 항은 결합
   - limit: 50 (더 많이 가져와서 필터링)
          ↓
   [Post-Filter (백엔드)]
   - exclude_terms 포함 논문 제거
   - OR 연산 시 별도 쿼리 실행 후 합집합
          ↓
   상위 10편 반환
```

**장점:** S2 API 변경 불필요, 기존 인프라 활용
**단점:** Post-filtering으로 인해 결과 품질이 S2 랭킹에 의존

#### Option B: Multi-Provider 확장 (OpenAlex 추가)

v2.0에서 제거된 OpenAlex를 Boolean 전용으로 재도입. OpenAlex는 Boolean 검색을 네이티브 지원.

**장점:** 진정한 Boolean 검색 가능
**단점:** v2.0 철학("do one thing well")에 역행, 유지보수 비용 증가

#### 결정: **Option A 채택**

v2.0의 단일 데이터소스 철학을 유지하면서, S2 API 위에 지능적인 쿼리 파싱 레이어를 구축합니다.

### 1.3 상세 설계

#### 1.3.1 쿼리 파서 (Backend)

**새 파일:** `backend/services/query_parser.py`

```
지원 문법:
  - AND (기본): "AI adoption healthcare" → 모든 용어 포함
  - OR: "machine learning OR deep learning" → 별도 쿼리 후 합집합
  - NOT: "AI adoption NOT robotics" → 결과에서 제외
  - 따옴표: '"technology acceptance model"' → 정확한 구문 검색
  - 필드 필터: year:2020-2025, field:Computer Science
```

**파싱 로직:**

```python
@dataclass
class ParsedQuery:
    primary_terms: list[str]       # AND 결합 키워드
    or_terms: list[list[str]]      # OR 그룹 (각각 별도 S2 쿼리)
    exclude_terms: list[str]       # NOT 제외 키워드
    exact_phrases: list[str]       # 따옴표 구문
    year_range: tuple[int, int] | None
    fields_of_study: list[str] | None
```

**처리 파이프라인:**

1. 쿼리 문자열에서 `year:`, `field:` 필터 추출
2. 따옴표로 감싼 정확한 구문 추출
3. `NOT` 키워드 뒤의 제외 용어 추출
4. `OR`로 분리된 그룹 식별
5. 나머지를 AND 결합 용어로 처리

#### 1.3.2 검색 엔진 (Backend)

**수정 파일:** `backend/routers/paper_search.py`

```
기존: query → S2 search(query, limit=10) → 반환
변경: query → parse(query) → 다중 S2 search → post-filter → 합집합/교집합 → 랭킹 → 반환
```

**변경 사항:**

| 기능 | 현재 | 변경 후 |
|------|------|---------|
| 쿼리 처리 | 그대로 전달 | 파싱 후 구조화 |
| S2 호출 횟수 | 1회 | OR 그룹당 1회 (최대 3회) |
| 내부 limit | 10 | 50 (필터링 여유분) |
| 결과 limit | 10 | 10 (사용자에게는 동일) |
| Year 필터 | 미노출 | year: 파라미터로 전달 |
| Field 필터 | 미노출 | fieldsOfStudy: 파라미터로 전달 |
| NOT 처리 | 없음 | 제목/초록에서 키워드 매칭 후 제외 |

**Post-Filter 로직:**

```python
def post_filter(papers: list[Paper], parsed: ParsedQuery) -> list[Paper]:
    filtered = papers

    # NOT 제외: 제목 또는 초록에 exclude_terms 포함 시 제거
    for term in parsed.exclude_terms:
        filtered = [p for p in filtered if term.lower() not in
                    (p.title + " " + (p.abstract or "")).lower()]

    # 정확한 구문 필터: exact_phrases가 제목 또는 초록에 포함되어야 함
    for phrase in parsed.exact_phrases:
        filtered = [p for p in filtered if phrase.lower() in
                    (p.title + " " + (p.abstract or "")).lower()]

    return filtered
```

**OR 처리:**

```python
# OR 그룹이 있을 경우 각각 S2에 별도 쿼리
# 결과를 합집합(union)으로 병합, paperId 기준 중복 제거
# S2 랭킹 점수로 정렬
```

#### 1.3.3 프론트엔드 UI

**수정 파일:** `frontend/app/page.tsx` (Search 탭)

**변경 1: 검색 입력 힌트**

기존 placeholder: `"Describe your research topic..."`
변경: `"Search papers... (e.g., AI adoption AND healthcare NOT robotics)"`

**변경 2: 고급 필터 토글**

Search 탭 하단에 접을 수 있는 필터 영역 추가:

```
┌─────────────────────────────────────────────┐
│ [ai adoption AND healthcare]     [🔍 FIND]  │
├─────────────────────────────────────────────┤
│ ▾ Advanced Filters                          │
│  Year: [2020] — [2025]                      │
│  Field: [Computer Science ▾] [Medicine ▾]   │
│  Tips: AND, OR, NOT, "exact phrase"         │
└─────────────────────────────────────────────┘
```

- `AnimatePresence`로 필터 영역 토글 애니메이션
- Cosmic 테마 일관성 유지 (glass morphism, cyan accent)
- 필터 상태는 URL 파라미터로 공유 가능 (`?q=...&year=2020-2025&field=CS`)

**변경 3: 검색 결과 태그 표시**

결과 목록에서 적용된 필터를 태그로 표시:

```
┌─────────────────────────────────────────────┐
│ 10 PAPERS FOUND                             │
│ Filters: [year:2020-2025 ✕] [CS ✕] [-robot │
│                                     ics ✕]  │
├─────────────────────────────────────────────┤
│ ■ Paper Title 1                             │
│   Authors · 2023 · 45 cit.                  │
└─────────────────────────────────────────────┘
```

#### 1.3.4 API 변경

**Request:**

```python
class PaperSearchRequest(BaseModel):
    query: str                           # 기존 (Boolean 포함 가능)
    limit: int = Field(default=10, ge=1, le=30)  # 기존 유지
    year_range: tuple[int, int] | None = None     # 신규
    fields_of_study: list[str] | None = None      # 신규
```

**Response (기존과 호환):**

```python
class PaperSearchResponse(BaseModel):
    papers: list[PaperSearchResult]
    refined_query: str | None = None     # 기존
    applied_filters: dict | None = None  # 신규: 적용된 필터 정보
    total_before_filter: int | None = None  # 신규: 필터 전 총 개수
```

#### 1.3.5 S2 API Rate Limit 고려사항

| 시나리오 | S2 호출 횟수 | 소요시간 (1 RPS) |
|----------|------------|----------------|
| 단순 키워드 | 1회 | ~1초 |
| AND + NOT | 1회 (내부 limit 증가) | ~1초 |
| OR (2그룹) | 2회 | ~2초 |
| OR (3그룹) | 3회 | ~3초 |

- OR 그룹은 최대 3개로 제한 (Rate limit 보호)
- 비인증 상태(0.3 RPS)에서 OR 검색 시 최대 ~10초 소요 가능 → 로딩 UX 필요

---

## Part 2: Personalized Recommendation System

### 2.1 비전

> "로그인한 연구자에게 맞춤형 논문 우주를 보여준다"

**핵심 경험:**
1. 회원가입 시 연구 프로필 생성 (관심 분야, 키워드, 경력 단계)
2. 랜딩 페이지 접근 시 "Recommended for You" 탭에서 개인화된 논문 추천
3. 대시보드에서 탐색 이력 기반 심화 추천
4. 시간이 지날수록 추천 정확도 향상 (탐색 이력 학습)

### 2.2 사용자 흐름

#### 2.2.1 프로필 생성 (회원가입 시)

```
[회원가입 완료]
       ↓
[Research Profile Setup]  ← 새 페이지: /auth/profile-setup
       ↓
┌─────────────────────────────────────────────┐
│  🔭 Set Up Your Research Profile            │
│                                              │
│  Research Fields (select 1-5):               │
│  [Computer Science] [Medicine] [Psychology]  │
│  [Economics] [Biology] [Physics] [...]       │
│                                              │
│  Research Keywords (type 3-10):              │
│  [AI adoption] [×] [technology acceptance]   │
│  [×] [healthcare IT] [×]                     │
│  [Type keyword and press Enter...]           │
│                                              │
│  Career Stage:                               │
│  ○ Undergraduate  ○ Master's Student         │
│  ● PhD Student    ○ Postdoc                  │
│  ○ Assistant Prof  ○ Associate/Full Prof     │
│  ○ Industry Researcher  ○ Other              │
│                                              │
│  [Skip for Now]           [Complete Setup →] │
└─────────────────────────────────────────────┘
```

**설계 원칙:**
- **선택적(Optional):** "Skip for Now" 가능, 나중에 설정 가능
- **최소 마찰:** 3단계만 (분야 선택, 키워드 입력, 경력 단계)
- **Cosmic 테마:** 기존 auth 페이지와 일관된 디자인

#### 2.2.2 랜딩 페이지 추천 탭

기존 탭: `SEED PAPER` | `SEARCH`
변경: `SEED PAPER` | `SEARCH` | `FOR YOU` (로그인 시에만 표시)

```
┌─────────────────────────────────────────────┐
│  SEED PAPER    SEARCH    FOR YOU ✨          │
├─────────────────────────────────────────────┤
│  Based on your interests in                  │
│  AI adoption, healthcare IT                  │
│                                              │
│  🔥 Trending in Your Fields                  │
│  ┌─────────────────────────────────────────┐│
│  │ ■ A Systematic Review of AI Adoption    ││
│  │   Frameworks in Healthcare...           ││
│  │   K. Smith et al. · 2025 · 127 cit.    ││
│  │                           [Explore →]   ││
│  ├─────────────────────────────────────────┤│
│  │ ■ Technology Acceptance Model 4.0:      ││
│  │   Extending TAM for...                  ││
│  │   L. Chen et al. · 2025 · 89 cit.      ││
│  │                           [Explore →]   ││
│  └─────────────────────────────────────────┘│
│                                              │
│  📚 Based on Your Explorations               │
│  ┌─────────────────────────────────────────┐│
│  │ ■ Digital Transformation and            ││
│  │   Organizational Readiness...           ││
│  │   M. Park et al. · 2026 · 12 cit.      ││
│  │                           [Explore →]   ││
│  └─────────────────────────────────────────┘│
│                                              │
│  [Refresh Recommendations 🔄]                │
└─────────────────────────────────────────────┘
```

**두 섹션으로 구분:**

| 섹션 | 데이터 소스 | 설명 |
|------|-----------|------|
| Trending in Your Fields | 프로필 키워드 → S2 검색 | 사용자 관심 분야의 최신/고인용 논문 |
| Based on Your Explorations | 탐색 이력 → S2 추천 API | 탐색/북마크한 논문과 유사한 논문 |

#### 2.2.3 대시보드 추천

기존: Saved Graphs 목록만 표시
변경: Saved Graphs + Recommended Papers 섹션 추가

```
┌─────────────────────────────────────────────┐
│  COMMAND CENTER                              │
│                                              │
│  ── YOUR SAVED EXPLORATIONS ──               │
│  [Graph 1] [Graph 2] [Graph 3]              │
│                                              │
│  ── RECOMMENDED FOR YOU ──                   │
│  Based on 12 explorations & 8 bookmarks      │
│                                              │
│  [Paper Card 1] [Paper Card 2]              │
│  [Paper Card 3] [Paper Card 4]              │
│                                              │
│  [See More Recommendations →]                │
└─────────────────────────────────────────────┘
```

### 2.3 기술 아키텍처

#### 2.3.1 데이터베이스 스키마

**새 테이블: `researcher_profiles`**

```sql
CREATE TABLE researcher_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    fields_of_study TEXT[] DEFAULT '{}',           -- 관심 분야 (최대 5)
    keywords TEXT[] DEFAULT '{}',                   -- 연구 키워드 (최대 10)
    career_stage TEXT,                              -- 경력 단계
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX idx_profiles_user ON researcher_profiles(user_id);
CREATE INDEX idx_profiles_fields ON researcher_profiles USING GIN(fields_of_study);
CREATE INDEX idx_profiles_keywords ON researcher_profiles USING GIN(keywords);
```

**새 테이블: `exploration_history`**

```sql
CREATE TABLE exploration_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    paper_id TEXT NOT NULL,                          -- S2 paper ID
    paper_title TEXT,                                -- 캐시용
    action_type TEXT NOT NULL,                       -- 'seed_explore' | 'expand' | 'view_detail'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_history_user_time ON exploration_history(user_id, created_at DESC);
CREATE INDEX idx_history_paper ON exploration_history(paper_id);
```

> **참고:** `exploration_history`는 기존 `user_graphs`와 별개입니다. `user_graphs`는 명시적 저장, `exploration_history`는 자동 기록입니다.

#### 2.3.2 추천 엔진 (Backend)

**새 파일:** `backend/services/recommendation_engine.py`

**추천 생성 파이프라인:**

```
[추천 요청]
     ↓
┌────────────────────┐
│ 1. 프로필 기반 추천  │
│   - 키워드별 S2 검색  │
│   - year:최근2년      │
│   - fieldsOfStudy     │
│   - 인용수 정렬       │
│   → 상위 5편          │
└────────────────────┘
     ↓
┌────────────────────┐
│ 2. 이력 기반 추천    │
│   - 최근 탐색 논문    │
│   - S2 Recommendations│
│     API 활용          │
│   → 상위 5편          │
└────────────────────┘
     ↓
┌────────────────────┐
│ 3. 병합 & 중복제거   │
│   - 이미 탐색한 논문  │
│     제외              │
│   - 점수 기반 정렬    │
│   → 최종 10편         │
└────────────────────┘
```

**Semantic Scholar Recommendations API 활용:**

S2는 `/recommendations/v1/papers/` 엔드포인트를 제공합니다:

```
POST https://api.semanticscholar.org/recommendations/v1/papers/
Body: {
    "positivePaperIds": ["paper_id_1", "paper_id_2", ...],
    "negativePaperIds": []
}
```

- 사용자가 탐색/북마크한 논문 ID를 `positivePaperIds`로 전달
- S2가 유사 논문을 추천 (SPECTER2 임베딩 기반)
- 별도 Rate limit 적용 (1 RPS)

**프로필 기반 추천 전략:**

```python
async def get_profile_recommendations(profile: ResearcherProfile) -> list[Paper]:
    recommendations = []

    # 키워드별로 S2 검색 (최대 3개 키워드, 키워드당 20편)
    for keyword in profile.keywords[:3]:
        papers = await s2.search_papers(
            query=keyword,
            limit=20,
            year_range=(current_year - 2, current_year),
            fields_of_study=profile.fields_of_study
        )
        recommendations.extend(papers)

    # 중복 제거 후 인용수 + 최신성 복합 점수로 정렬
    deduplicated = deduplicate_by_paper_id(recommendations)
    scored = score_and_rank(deduplicated, weight_citations=0.6, weight_recency=0.4)

    return scored[:5]
```

#### 2.3.3 API 엔드포인트

**새 라우터:** `backend/routers/recommendations.py`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/profile` | Required | 연구자 프로필 조회 |
| POST | `/api/profile` | Required | 프로필 생성/업데이트 |
| GET | `/api/recommendations` | Required | 개인화 추천 목록 (10편) |
| GET | `/api/recommendations/trending` | Required | 프로필 기반 트렌딩 (5편) |
| GET | `/api/recommendations/similar` | Required | 탐색 이력 기반 유사 논문 (5편) |

**새 라우터:** `backend/routers/profiles.py`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/profile` | Required | 프로필 조회 |
| POST | `/api/profile` | Required | 프로필 생성 |
| PUT | `/api/profile` | Required | 프로필 수정 |

#### 2.3.4 탐색 이력 자동 기록

**수정 파일:** `backend/routers/seed_explore.py`, `backend/routers/papers.py`

기존 `seed-explore`, `expand-stable` 엔드포인트에 이력 기록 추가:

```python
# seed_explore 엔드포인트에 추가
if request.state.user:  # 로그인 상태인 경우만
    await record_exploration(
        user_id=request.state.user.id,
        paper_id=seed_paper_id,
        action_type="seed_explore"
    )
```

- **비동기 기록:** `asyncio.create_task()`로 응답 지연 없이 백그라운드 기록
- **Optional auth:** 비로그인 사용자는 기록 없이 기존처럼 동작
- **중복 방지:** 같은 논문을 24시간 내 재탐색 시 기록하지 않음

#### 2.3.5 캐싱 전략

| 캐시 키 | TTL | 내용 |
|---------|-----|------|
| `rec:trending:{user_id}` | 6시간 | 프로필 기반 트렌딩 추천 |
| `rec:similar:{user_id}` | 3시간 | 이력 기반 유사 추천 |
| `rec:combined:{user_id}` | 1시간 | 병합된 최종 추천 |

- 프로필 변경 시: trending 캐시 무효화
- 새 탐색 기록 시: similar 캐시 무효화
- Redis (Upstash) 기존 인프라 활용

#### 2.3.6 프론트엔드 컴포넌트

**새 파일들:**

| 파일 | 설명 |
|------|------|
| `frontend/app/auth/profile-setup/page.tsx` | 프로필 생성 페이지 |
| `frontend/components/landing/ForYouTab.tsx` | 랜딩 페이지 "For You" 탭 |
| `frontend/components/dashboard/RecommendedPapers.tsx` | 대시보드 추천 섹션 |
| `frontend/lib/profile-context.tsx` | 프로필 Context Provider |

**프로필 상태 관리:**

```typescript
// lib/profile-context.tsx
interface ResearcherProfile {
    id: string;
    fields_of_study: string[];
    keywords: string[];
    career_stage: string;
    created_at: string;
}

// 앱 시작 시 프로필 fetch
// 프로필 없으면 ForYou 탭 비활성 (또는 생성 유도)
```

### 2.4 S2 API Rate Limit 영향 분석

| 기능 | 추가 S2 호출 | 빈도 | 영향 |
|------|------------|------|------|
| 프로필 기반 추천 | 3회/요청 | 6시간 캐시 | 낮음 |
| 이력 기반 추천 | 1회/요청 | 3시간 캐시 | 낮음 |
| 탐색 이력 기록 | 0회 | 매 탐색 | 없음 (DB만) |

- 캐싱으로 S2 호출 최소화
- 최악의 경우: 사용자당 하루 ~10회 S2 추가 호출
- 현재 S2 인증 키 1 RPS 한도 내에서 충분

---

## Part 3: 구현 계획

### 3.1 Phase 1 — Boolean Search (v3.6.0)

| 단계 | 작업 | 파일 | 예상 규모 |
|------|------|------|----------|
| 1 | 쿼리 파서 구현 | `backend/services/query_parser.py` (신규) | ~150줄 |
| 2 | paper_search 라우터 수정 | `backend/routers/paper_search.py` | ~50줄 수정 |
| 3 | S2 클라이언트 year/field 파라미터 노출 | `backend/integrations/semantic_scholar.py` | ~10줄 수정 |
| 4 | 프론트엔드 Advanced Filter UI | `frontend/app/page.tsx` | ~80줄 추가 |
| 5 | 검색 결과 필터 태그 표시 | `frontend/app/page.tsx` | ~30줄 추가 |
| 6 | API 타입 업데이트 | `frontend/lib/api.ts`, `frontend/types/index.ts` | ~20줄 |
| 7 | 테스트 | `backend/tests/test_query_parser.py` (신규) | ~100줄 |

### 3.2 Phase 2 — Researcher Profile (v4.0.0 Part 1)

| 단계 | 작업 | 파일 | 예상 규모 |
|------|------|------|----------|
| 1 | DB 마이그레이션 | `backend/database/migrations/006_researcher_profiles.sql` | ~30줄 |
| 2 | 프로필 API 라우터 | `backend/routers/profiles.py` (신규) | ~120줄 |
| 3 | 프로필 생성 UI | `frontend/app/auth/profile-setup/page.tsx` (신규) | ~250줄 |
| 4 | 프로필 Context | `frontend/lib/profile-context.tsx` (신규) | ~80줄 |
| 5 | 회원가입 후 리다이렉트 수정 | `frontend/lib/auth-context.tsx` | ~15줄 수정 |
| 6 | 프로필 편집 (대시보드) | `frontend/components/dashboard/ProfileEditor.tsx` (신규) | ~150줄 |

### 3.3 Phase 3 — Recommendation Engine (v4.0.0 Part 2)

| 단계 | 작업 | 파일 | 예상 규모 |
|------|------|------|----------|
| 1 | 탐색 이력 테이블 | `backend/database/migrations/007_exploration_history.sql` | ~20줄 |
| 2 | 이력 자동 기록 | `backend/routers/seed_explore.py` 수정 | ~20줄 |
| 3 | 추천 엔진 서비스 | `backend/services/recommendation_engine.py` (신규) | ~200줄 |
| 4 | 추천 API 라우터 | `backend/routers/recommendations.py` (신규) | ~100줄 |
| 5 | S2 Recommendations API 통합 | `backend/integrations/semantic_scholar.py` 수정 | ~40줄 |
| 6 | 랜딩 ForYou 탭 | `frontend/components/landing/ForYouTab.tsx` (신규) | ~200줄 |
| 7 | 대시보드 추천 섹션 | `frontend/components/dashboard/RecommendedPapers.tsx` (신규) | ~150줄 |
| 8 | 랜딩 페이지 탭 통합 | `frontend/app/page.tsx` 수정 | ~30줄 |
| 9 | 캐싱 로직 | `backend/cache.py` 수정 | ~30줄 |

### 3.4 총 예상 규모

| Phase | 신규 파일 | 수정 파일 | 코드 규모 |
|-------|----------|----------|----------|
| Boolean Search | 2 | 4 | ~440줄 |
| Researcher Profile | 4 | 2 | ~645줄 |
| Recommendation Engine | 4 | 5 | ~790줄 |
| **합계** | **10** | **11** | **~1,875줄** |

---

## Part 4: 리스크 & 고려사항

### 4.1 기술적 리스크

| 리스크 | 영향 | 완화 |
|--------|------|------|
| S2 Rate Limit 초과 | 추천 실패 | 공격적 캐싱 + graceful degradation |
| Boolean 파싱 복잡도 | 예상치 못한 쿼리 | 단순한 문법 규칙, fallback to 원문 전달 |
| Cold Start 문제 | 신규 사용자 추천 품질 낮음 | 프로필 키워드 기반 추천으로 보완 |
| S2 Recommendations API 제한 | positive IDs 최소 1개 필요 | 탐색 이력 없으면 프로필 기반만 표시 |

### 4.2 UX 고려사항

| 항목 | 결정 |
|------|------|
| 프로필 생성 강제 여부 | **선택적** — Skip 가능, ForYou 탭은 프로필 있을 때만 |
| 추천 갱신 빈도 | 6시간 캐시, 수동 새로고침 버튼 제공 |
| 비로그인 사용자 | ForYou 탭 미표시, 기존 경험 유지 |
| 추천 설명 | "왜 이 논문이 추천되었는지" 간단한 이유 태그 |

### 4.3 v2.0 철학과의 정합성

v2.0의 "do one thing well" 철학을 존중하되:
- **Boolean Search:** 기존 검색의 자연스러운 확장 (새 워크플로우 아님)
- **추천 시스템:** 기존 Seed Paper 경험의 진입점 개선 (탐색 자체는 동일)
- v1.x에서 제거된 것과 달리, **탐색 워크플로우에 집중된 추천**만 도입

---

## Part 5: 성공 지표

| 지표 | 현재 | 목표 |
|------|------|------|
| 검색 → 탐색 전환율 | 측정 필요 | +15% |
| 회원가입 후 프로필 생성율 | N/A | 60% |
| 추천 논문 탐색 클릭율 | N/A | 25% |
| Boolean 검색 사용 비율 | 0% | 20% |
| 재방문율 (7일) | 측정 필요 | +20% |

---

## Appendix A: Semantic Scholar fieldsOfStudy 전체 목록

```
Computer Science, Medicine, Biology, Chemistry, Physics,
Materials Science, Mathematics, Psychology, Economics,
Political Science, Sociology, Business, Engineering,
Environmental Science, Geography, History, Philosophy,
Art, Linguistics, Education, Law, Agricultural and Food Sciences,
Geology, Null (unclassified)
```

## Appendix B: 쿼리 파서 문법 명세

```
query       = term_group (OR term_group)*
term_group  = term (AND? term)*
term        = NOT? (PHRASE | WORD) | FILTER
PHRASE      = '"' [^"]+ '"'
WORD        = [^\s"]+
FILTER      = ('year:' YEAR_RANGE) | ('field:' FIELD_NAME)
YEAR_RANGE  = YYYY '-' YYYY
FIELD_NAME  = WORD (',' WORD)*
AND         = 'AND' (case insensitive)
OR          = 'OR' (case insensitive)
NOT         = 'NOT' | '-' (case insensitive)
```

**예시:**

| 입력 | 파싱 결과 |
|------|----------|
| `AI adoption` | primary: ["AI adoption"] |
| `AI adoption AND healthcare` | primary: ["AI adoption", "healthcare"] |
| `machine learning OR deep learning` | or_groups: [["machine learning"], ["deep learning"]] |
| `AI NOT robotics` | primary: ["AI"], exclude: ["robotics"] |
| `"technology acceptance model"` | exact: ["technology acceptance model"] |
| `AI adoption year:2020-2025 field:Computer Science` | primary: ["AI adoption"], year: (2020,2025), fields: ["Computer Science"] |
| `AI adoption AND healthcare NOT robotics year:2023-2026` | primary: ["AI adoption", "healthcare"], exclude: ["robotics"], year: (2023,2026) |
