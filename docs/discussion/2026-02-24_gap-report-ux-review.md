# Gap Report UX Review — 2026-02-24

> **Date:** 2026-02-24
> **Participants:** 호성 (User), Claude (Assistant)
> **Context:** v3.3.0 배포 후 Gap Report 기능 첫 UX 리뷰 — 기술적으로 작동하지만 연구자에게 실질적 가치를 제공하지 못하는 5가지 근본 문제 식별
> **결과:** v3.3.1 구현 — 11 files changed, 511 insertions, 96 deletions

---

## 세션 시작 — 호성의 Gap Report 리뷰

**호성 [2026-02-24T18:20 UTC]:**

> v3.3.0 Gap Report가 배포되었는데, 실제로 생성된 리포트를 보니 연구자로서 실질적으로 활용하기 어렵다는 느낌이 들어. 숫자는 있지만 설명이 없고, Research Questions는 일반적인 템플릿이고, 전체적으로 정적인 텍스트 벽이야. 한번 봐줄래?

*(v3.3.0에서 구현된 Gap Report: evidence assembly → LLM narrative → report rendering 파이프라인이 end-to-end로 작동하지만, 출력물의 품질과 UX에 근본적인 문제 존재)*

---

## Claude 분석 — 5가지 근본 문제 식별

**Claude [~18:25 UTC]:**

코드베이스 (`gap_detector.py`, `gap_report_service.py`, `GapReportView.tsx`, `GapSpotterPanel.tsx`, `seed_explore.py`) 분석 후 5가지 근본 문제를 식별했습니다:

---

### 문제 1: LLM Narrative Silent Failure — 사일런트 실패

**현재 구현:** `gap_report_service.py`에서 `generate_json()`이 실패 시 `{}`를 반환. 코드가 `if result and result.get("executive_summary")`로 체크하지만, `{}`는 truthy이므로 첫 번째 조건을 통과합니다.

**문제:** Groq rate limit에 걸리면 사일런트하게 실패하여, 사용자는 LLM narrative가 생성되어야 했다는 사실조차 모릅니다. 항상 heuristic-only 리포트를 받게 됩니다.

**영향:** 사용자가 풍부한 분석을 받아야 하는데, LLM 실패 여부를 알 수 없어 열등한 결과를 정상으로 받아들이게 됩니다.

---

### 문제 2: Semantic Score 학술적 역전

**현재 구현:** `gap_detector.py`에서 `semantic_score = 1.0 - cosine_similarity(centroid_a, centroid_b)`.

**문제:** 이 공식은 **학술적으로 역전**되어 있습니다. 두 클러스터가 주제적으로 유사(cosine similarity 높음)하면 semantic score가 낮아집니다. 하지만 연구 갭 관점에서, 유사한 분야 사이의 갭이 **더 행동 가능(actionable)**합니다 — 관련 있지만 단절된 분야 간 cross-pollination이 더 가치 있기 때문입니다.

**영향:** 가장 유용한 갭(관련 있지만 단절된 클러스터)이 composite score에서 불이익을 받아 랭킹에서 밀려납니다.

**구체적 예시:**
- Cluster A: Computational Neuroscience, Cluster B: Deep Learning → cosine_sim 0.88 → semantic_score 0.12 (낮음)
- 이 갭이 연구자에게 가장 가치 있는데, 점수에서는 하위로 밀림

---

### 문제 3: 설명 없는 숫자 — Explainability 부재

**현재 구현:** 점수 바에 퍼센티지만 표시 (예: "Structural 94%").

**문제:** "94% structural"이 의미하는 바를 알 수 없습니다. 403개 가능한 엣지 중 24개가 존재한다는 건지? 94%가 누락되었다는 건지? 사용자가 이 숫자를 해석할 방법이 없습니다.

**영향:** 연구자는 이해할 수 없는 점수를 신뢰하거나 그에 따라 행동할 수 없습니다. 점수가 있어도 없는 것이나 마찬가지입니다.

---

### 문제 4: 템플릿 Research Questions — Mad Libs 수준

**현재 구현:** `_generate_heuristic_questions()`가 Mad Libs 스타일 질문 생성.

```
"How might methods from {label_a} be applied to {label_b}?"
"What shared mechanisms connect {label_a} and {label_b}?"
```

**문제:** 실제 논문, 인용 데이터, 그래프 증거를 참조하지 않습니다. 데이터 분석 없이도 누구나 생성할 수 있는 질문입니다.

**영향:** 연구 방향 설정에 도움이 되지 않는 일반적 질문은 연구자의 시간을 낭비합니다.

---

### 문제 5: 정적 텍스트 벽 — Static Text Wall

**현재 구현:** 비인터랙티브 스크롤 텍스트. 접을 수 있는 섹션 없음, 점수 툴팁 없음, 복사 버튼 없음, 논문 교차 참조 없음. 좌측 패널도 300px 고정.

**문제:** 긴 텍스트를 300px 패널에서 읽어야 합니다. 특정 섹션만 보고 싶어도 전체를 스크롤해야 하고, 내용을 복사해서 다른 곳에 사용할 방법도 없습니다.

**영향:** 불편한 읽기 경험이 리포트 활용도를 떨어뜨립니다.

---

### 추가 발견 사항

| 이슈 | 상세 |
|------|------|
| CORS 에러 마스킹 | 500/503 백엔드 에러에 CORS 헤더가 없어서 브라우저가 실제 서버 에러 대신 CORS 에러로 보고 |
| 패널 너비 | 300px은 리포트 콘텐츠에 너무 좁음 |

---

### 요약 테이블

| # | 문제 | 근본 원인 | 심각도 |
|---|------|----------|--------|
| 1 | LLM 사일런트 실패 | `{}` truthy 체크 미흡 | 높음 — 사용자가 실패를 인지 못함 |
| 2 | Semantic score 역전 | `1 - cosine_sim` 공식 | 높음 — 가장 유용한 갭이 불이익 |
| 3 | 설명 없는 숫자 | evidence_detail 미제공 | 중간 — 신뢰도 저하 |
| 4 | 템플릿 질문 | 실제 데이터 미참조 | 중간 — 활용 가치 없음 |
| 5 | 정적 텍스트 벽 | 인터랙티브 UI 미구현 | 중간 — UX 저해 |

---

## 호성의 확인 + 개선 지시

**호성 [~18:30 UTC]:**

> 맞아, 정확해. 특히 semantic score가 역전되어 있다는 건 심각한 문제야. 연구자 입장에서 관련 있지만 단절된 분야 사이의 갭이 가장 가치 있는 건 맞아. 그리고 Research Questions이 실제 논문 데이터를 참조하지 않는다는 것도 큰 문제야. 이 5가지를 모두 해결해줘. 구체적인 개선 방향을 밝혀줘.

---

## Claude 상세 분석 — 5가지 문제별 개선 방향

**Claude [~18:35 UTC]:**

---

### 문제 1 개선: LLM 실패 명시적 추적

**개선 방향:**

A. `llm_status` 필드 도입:
- `generate_json()` 반환값에 대해 `{}` 빈 딕셔너리를 명시적으로 감지
- 리포트 응답에 `llm_status: "success" | "failed"` 필드 추가
- typed exception handling으로 실패 유형 구분

B. 프론트엔드 LLM 실패 배너:
- `llm_status === "failed"`일 때 경고 배너 표시
- "LLM narrative를 생성하지 못했습니다. Evidence 기반 리포트를 표시합니다."

**기술적 제약:** 없음. 단순 조건 분기 + UI 컴포넌트.

---

### 문제 2 개선: Semantic → Relatedness 역전

**개선 방향:**

기존: `semantic_score = 1.0 - cosine_similarity(centroid_a, centroid_b)`
개선: `relatedness_score = cosine_similarity(centroid_a, centroid_b)`

**네이밍 변경:** "Semantic" → "Relatedness"
- "Relatedness"가 학술적으로 정확 — 높은 유사도 = 더 행동 가능한 갭
- 전체 스택에서 네이밍 일괄 변경 (백엔드, 프론트엔드, 내보내기)

**가중치 재조정:**

| 차원 | v3.3.0 가중치 | v3.3.1 가중치 | 변경 이유 |
|------|-------------|-------------|----------|
| Structural | 0.30 | 0.35 | 구조적 단절이 갭의 핵심 지표 |
| Relatedness | 0.25 | 0.25 | 유지 (역전만 적용) |
| Temporal | 0.15 | 0.15 | 유지 |
| Intent | 0.15 | 0.15 | 유지 |
| Directional | 0.15 | 0.10 | 약간 감소 — 방향성 비대칭은 보조 지표 |

**해석 변경:**
- 기존: High semantic = 주제적으로 다른 클러스터 (의미 불명확)
- 개선: High relatedness = 관련 있지만 단절된 클러스터 (더 행동 가능)

**예시:** Structural 94% + Relatedness 88% = 매우 행동 가능한 갭 — 두 클러스터가 관련 있는데 연결이 거의 없음

---

### 문제 3 개선: Evidence Detail 딕셔너리

**개선 방향:**

각 갭에 `evidence_detail` 딕셔너리 추가:

```python
evidence_detail = {
    "actual_edges": 24,          # 실제 교차 엣지 수
    "max_possible_edges": 403,   # 최대 가능 엣지 수
    "centroid_similarity": 0.88, # 센트로이드 코사인 유사도
    "year_span_a": "2018-2024",  # 클러스터 A 연도 범위
    "year_span_b": "2015-2022",  # 클러스터 B 연도 범위
    "a_to_b_citations": 3,       # A→B 인용 수
    "b_to_a_citations": 1,       # B→A 인용 수
    "methodology_ratio": 0.12,   # methodology intent 비율
    "background_ratio": 0.85     # background intent 비율
}
```

프론트엔드에서 점수 바 호버 시 툴팁으로 표시:
> "Structural 94%: 403개 가능한 교차 엣지 중 24개만 존재 (379개 누락)"

**기술적 제약:** 데이터 모두 이미 계산 중. 딕셔너리로 패키징만 추가. 추가 API 호출 0.

---

### 문제 4 개선: Grounded Research Questions

**개선 방향:**

`_generate_heuristic_questions()` → `_generate_grounded_questions()`로 교체.

실제 데이터를 참조하는 질문 생성:

| 데이터 소스 | 질문에서의 활용 |
|-----------|-------------|
| Top paper TLDRs | "X 논문(인용 234회)의 접근법이 Y 분야에 적용되지 않은 이유는?" |
| Bridge paper 유사도 | "Bridge paper Z가 A에 0.89, B에 0.72 유사도를 보이는데, 이 연결고리는?" |
| Temporal 맥락 | "A 클러스터(2020-2024)와 B 클러스터(2015-2019)의 시간적 격차가 의미하는 바는?" |
| Intent 분포 | "교차 인용의 85%가 background인데, methodology 수준의 깊은 연계는 왜 없는가?" |
| 방향성 비대칭 | "A→B 인용이 3건, B→A가 1건 — 이 비대칭이 시사하는 바는?" |

각 질문에 `justification`(근거)과 `methodology_hint`(방법론 힌트) 포함.

**기술적 제약:**

| 제약 | 영향 | 대응 |
|------|------|------|
| 기존 `string[]` → `Dict[]` 타입 변경 | 하위 호환성 | `isinstance(q, dict)` 체크로 두 형식 모두 지원 |
| LLM 프롬프트 업데이트 | Groq 호출 구조 변경 | paper TLDRs를 프롬프트에 포함 |

---

### 문제 5 개선: 인터랙티브 리포트 UI

**개선 방향:**

A. 접을 수 있는 섹션 (AnimatePresence):
- 각 섹션 헤더 클릭 → collapse/expand 애니메이션
- 기본값: Executive Summary만 열린 상태

B. 점수 툴팁:
- 점수 바 호버 → evidence_detail 팝오버
- 원시 숫자 + 해석 텍스트

C. 섹션별 Copy-to-Clipboard:
- 섹션 헤더에 복사 아이콘
- 클릭 시 해당 섹션 텍스트를 클립보드에 복사

D. 리사이즈 가능한 좌측 패널:
- 250px ~ 600px 드래그 핸들
- `localStorage`에 저장하여 새로고침 후에도 유지

E. LLM 실패 경고 배너:
- `llm_status === "failed"` → 상단에 경고 표시

**기술적 제약:**

| 제약 | 영향 | 대응 |
|------|------|------|
| 추가 패키지 | 의존성 증가 | CSS-only 드래그 핸들, 신규 패키지 불필요 |
| AnimatePresence 성능 | 애니메이션 지연 | 이미 프로젝트에서 사용 중, 검증됨 |

---

## UX 시뮬레이션: Before vs After

### Before (v3.3.0)

1. Gap Report 생성 버튼 클릭 → 로딩 → 리포트 표시
2. "Structural 94%" 바를 봄 → **"94%가 뭐라는 거지? 높으면 좋은 건가?"**
3. Research Questions 섹션 → **"How might methods from A be applied to B?" — 이건 데이터 분석 없이도 나올 질문인데?**
4. LLM narrative가 없는데 → **실패 표시 없음, 정상인 줄 앎**
5. 특정 섹션만 복사하고 싶은데 → **방법 없음, 전체 Markdown 다운로드만 가능**
6. 300px 패널에서 긴 텍스트 읽기 → **답답함**

### After (v3.3.1)

1. Gap Report 생성 버튼 클릭 → 로딩 → 리포트 표시
2. "Structural 94%" 바에 호버 → **"403개 가능한 교차 엣지 중 24개만 존재"**
3. "Relatedness 88%" 바에 호버 → **"센트로이드 유사도 0.88 — 관련 있지만 단절됨"**
4. Research Questions → **"Chen et al.(2022, 인용 234회)의 transformer-based approach가 Materials Science cluster에 적용되지 않은 이유는? (근거: bridge paper X가 두 분야에 각각 0.89, 0.72 유사도)"**
5. LLM 실패 시 → **경고 배너: "LLM narrative 생성 실패. Evidence 기반 리포트를 표시합니다."**
6. 섹션 헤더 클릭 → **collapse/expand**, 복사 아이콘 → **클립보드 복사**
7. 패널 드래그 → **250~600px 조절 가능**

### 객관적 평가

| 측면 | v3.3.0 점수 | v3.3.1 예상 |
|------|------------|------------|
| 점수 신뢰성 | 2/10 | 8/10 |
| 연구 질문 가치 | 2/10 | 7/10 |
| 실패 투명성 | 1/10 | 9/10 |
| 읽기 경험 | 3/10 | 8/10 |
| 행동 가능성 | 3/10 | 8/10 |
| **전체 UX** | **2/10** | **8/10** |

---

## 호성의 확인 + 구현 지시

**호성 [~18:40 UTC]:**

> 좋아. 이 방향으로 진행해줘.

---

## 구현 계획

**Claude [~18:45 UTC]:**

구현 우선순위 및 파일 변경 계획:

| 순위 | 문제 | 변경 파일 | 이유 |
|------|------|----------|------|
| **1** | Semantic → Relatedness 역전 | `gap_detector.py` | 학술적 정확성 — 가장 근본적 |
| **2** | Evidence Detail | `gap_detector.py`, `seed_explore.py`, `types/index.ts` | 3번 문제 해결의 데이터 기반 |
| **3** | LLM 실패 명시적 추적 | `gap_report_service.py`, `gap_report.py` | 사일런트 실패 제거 |
| **4** | Grounded RQ | `gap_detector.py`, `gap_report_service.py` | 질문 품질 개선 |
| **5** | 인터랙티브 UI | `GapReportView.tsx`, `GapSpotterPanel.tsx`, `page.tsx` | UX 개선 |
| **6** | CORS 에러 핸들링 | `main.py` | 디버깅 용이성 |

### 백엔드 변경

| 파일 | 변경 내용 |
|------|----------|
| `gap_detector.py` | `relatedness_score = cosine_similarity` (역전), 가중치 재조정 (structural 0.35, directional 0.10), `evidence_detail` 딕셔너리 추가, bridge paper별 `sim_to_cluster_a/b`, directional `(score, a_to_b, b_to_a)` 튜플 반환, `_generate_grounded_questions()` 신규 |
| `gap_report_service.py` | `{}` 빈 딕셔너리 명시적 감지, typed exception handling, `llm_status` 필드, dict+string RQ 형식 모두 지원, `_interpret_scores`에서 "Relatedness" 사용 |
| `gap_report.py` | `GapReportResponse`에 `llm_status` 필드 추가 |
| `seed_explore.py` | `SeedGapInfo`에 `evidence_detail` 필드 추가, `List[Any]` research_questions 타입 변경 |
| `main.py` | 글로벌 exception handler로 모든 에러 응답에 CORS 헤더 보장 + CORS config 시작 시 로깅 |

### 프론트엔드 변경

| 파일 | 변경 내용 |
|------|----------|
| `types/index.ts` | `EvidenceDetail` 인터페이스, `relatedness` 필드, `llm_status`, bridge sim 필드, union RQ 타입 |
| `GapReportView.tsx` | 전체 리라이트 — AnimatePresence 접을 수 있는 섹션, 점수 바 호버 툴팁, 섹션별 복사 버튼, LLM 실패 경고 배너 |
| `GapSpotterPanel.tsx` | SEM → REL 라벨 변경, union RQ 렌더링 |
| `page.tsx` | 리사이즈 가능한 좌측 패널 (250-600px 드래그 핸들 + localStorage 저장) |
| `export.ts` | Markdown 내보내기에서 `Semantic` → `Relatedness` |

---

## 구현 결과 — v3.3.1

이 세션에서 수립된 계획은 v3.3.1로 구현됨:

- **11 files changed**, 511 insertions, 96 deletions
- **1 new TypeScript interface** (EvidenceDetail)
- **5 renamed fields** (semantic → relatedness across stack)
- **0 new API endpoints** (기존 엔드포인트 개선)

### Gap Score Weights (v3.3.1 최종)

| 차원 | 가중치 | 방향 | 설명 |
|------|--------|------|------|
| Structural | 0.35 | 높음 = 갭 | 가능한 클러스터 간 엣지 중 누락 비율 |
| Relatedness | 0.25 | 높음 = 행동 가능 | 센트로이드 코사인 유사도 (유사 토픽 = 브릿징 가치) |
| Temporal | 0.15 | 높음 = 갭 | 연도 분포 비중첩 비율 |
| Intent | 0.15 | 높음 = 갭 | Background 편향 교차 인용 (피상적 연계) |
| Directional | 0.10 | 높음 = 갭 | 인용 흐름 비대칭 (A→B vs B→A) |

---

## 핵심 설계 결정 요약

| 결정 | 선택 | 근거 |
|------|------|------|
| Semantic → Relatedness 역전 | `relatedness = cosine_sim` | 학술적으로 올바름: 유사 클러스터 = 더 행동 가능한 갭 |
| 5차원 유지, 가중치 조정 | structural 0.30→0.35, directional 0.15→0.10 | 구조적 단절이 핵심 지표, 방향성은 보조 |
| Evidence detail 응답에 포함 | 9개 원시 메트릭 딕셔너리 | 추가 API 호출 없이 프론트엔드 툴팁 구현 |
| Grounded RQ (실제 데이터 기반) | paper TLDRs/인용수/temporal/intent 참조 | 실제 논문을 참조하는 질문이 즉시 유용 |
| 리사이즈 가능 패널, 신규 패키지 불필요 | CSS-only 드래그 핸들 | 의존성 증가 방지 |
| `llm_status` 필드 | 명시적 성공/실패 상태 | 콘텐츠 존재 여부로 추론하는 것보다 명확 |
| CORS 글로벌 핸들러 | 모든 에러 응답에 CORS 헤더 | 서버 에러가 CORS 에러로 오보되는 문제 해결 |
| union RQ 타입 (dict + string) | 하위 호환성 유지 | grounded dict와 legacy string 형식 모두 지원 |
