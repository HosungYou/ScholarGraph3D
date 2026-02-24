# Gap Spotter UX Deep-Dive — 2026-02-24

> **Session ID:** `8d966b01-7cd7-4350-aeee-8ac189dbeda2`
> **Date:** 2026-02-24
> **Participants:** 호성 (User), Claude (Assistant)
> **Context:** v3.1.0 배포 후 Gap Spotter 중심 7가지 UX 이슈 식별 + 개선 방향 논의
> **결과:** v3.2.0 구현 계획 수립 → Tasks 0-5

---

## 세션 시작 — 호성의 Deep-Dive 요청

**호성 [2026-02-24T05:14 UTC]:**

*(새로운 스크린샷 2장과 함께)*

> https://github.com/HosungYou/ScholarGraph3D 의 프로젝트 내부 페이지인데, 이 이미지를 보면 어떤 생각이 드니? 이 화면만 보고 연구자가 어떤 식으로 활용할 수 있을 것 같다는 시나리오가 예상이 되니?
>
> 일단 Gap Spotter가 노드와 노드 사이의 갭이니 아니면 cluster와 클러스터 사이의 갭이니? 클러스터와 클러스터 사이의 갭이면 그 갭에 호버링 했을 때 프로젝트안에 시각화가 잘 되어야 하는데 어떤 갭이 있는지 모르겠어. 그리고 그 갭을 통해 어떤 연구주제 혹은 아이디어 생성을 위한 컨텐츠가 생성되어야 할 것 같은데 어떻게 생각해? 어떤 식으로 해당 패널이 업데이트 되어야 할까?
>
> 그리고 Edge Intents는 이제 사용하지 않는 것 아니니? 그리고 cross cluster 선택했을 때 나타나는 얇은 선은 뭐였니? 이것은 범례에 없는 것 같은데.
>
> Enhanced도 사용되고 있는 것 맞니? 범례를 업데이트 해야 할 것 같은데?
>
> 그리고 클러스터든 갭이든 가장 중요한 것은 해당 논문을 클릭하더라도 해당 논문이 중심이 되서 해당 논문에만 하이라이트 되는 색이 없어. 어떤 논문인지 찾기가 어려워.
>
> 내가 말하는 게 무슨 뜻인지 확인하기 위해 디브리핑을 해줘.

---

## Claude 디브리핑 — 7가지 이슈 식별

**Claude [~05:17 UTC]:**

코드베이스 (`gap_detector.py`, `ScholarGraph3D.tsx`, `GraphLegend.tsx`, `GapSpotterPanel.tsx`, `useGraphStore.ts`) 분석 후:

---

### Issue 1: Gap Spotter 시각화 — "어떤 갭인지 모르겠다"

**현재 구현:** 클러스터-to-클러스터 갭. `gap_detector.py`에서 `itertools.combinations(valid_clusters, 2)`로 모든 클러스터 쌍 평가. `gap_strength = 1 - (실제 교차 엣지 수 / 최대 가능 엣지 수)`.

**문제:** 갭 오버레이에 클러스터 중심점 사이 점선과 펄싱 구체만 표시. **호버 인터랙션 없음** — raycasting 핸들러 없음. "그래서 이 두 분야 사이에 뭐가 비어있다는 건데?"에 대한 시각적 답변 없음.

---

### Issue 2: Research Questions — 비어있음

**현재 구현:** `gap_detector.py`의 `_generate_heuristic_questions`가 템플릿 3개 생성. **하지만** `seed_explore.py` line 445에서 `research_questions=[]`로 하드코딩하여 응답에서 제거. 프론트엔드의 `ResearchQuestions` 아코디언이 **절대 렌더링되지 않음**.

---

### Issue 3: "Edge Intents" 네이밍 혼란

**현재 상태:** 기본 intents (Background, Methodology, Result/Comparison)는 활성 상태. 하지만 "Edge Intents" 제목이 기술적이라 연구자에게 의미 전달 약함. 범례가 모드와 무관하게 항상 표시.

**제안:** "CITATION CONTEXT"로 이름 변경, Similarity 모드에서만 표시.

---

### Issue 4: Cross-Cluster 모드의 얇은 선 — 범례 누락

**현재 구현:**
- 굵은 금색 선 = 클러스터 간(cross-cluster) 엣지
- 매우 얇은 선 (width 0.3, color #222222) = 클러스터 내부(intra-cluster) 엣지

**호성님의 우려가 정확합니다** — 이 얇은 인트라클러스터 선은 범례에 설명이 없습니다.

---

### Issue 5: Enhanced 섹션 — 미사용 기능 표시

**현재 상태:** 백엔드 구현 완료 (`enhance_intents_with_llm`), 프론트엔드에서 **휴면 상태**. `/api/papers/{id}/intents?enhanced=true` 엔드포인트 존재하나 이를 호출하는 **UI 트리거 없음**. 범례에 5개 색상 모두 표시되나 실제 활성화된 적 없음.

---

### Issue 6: 범례 전체 업데이트 필요

| 항목 | 문제 | 수정 |
|------|------|------|
| Enhanced 섹션 | 비활성인데 표시 | 제거 |
| Edge Intents 제목 | 모드와 무관하게 항상 표시 | Similarity 모드에서만 표시 |
| Cross-Cluster 설명 | 시각적 인코딩 설명 없음 | 추가 |
| Temporal 설명 | 모드 선택 시 추가 설명 없음 | "Color = year distance" 표시 |
| `applies` 색상 불일치 | 코드 `#9B59B6` vs 범례 `#E67E22` | Enhanced 제거로 해소 |

---

### Issue 7: 가장 중요한 문제 — 선택된 논문을 3D에서 찾을 수 없음

**코드에는 하이라이트 로직이 있음** — 선택 시 금색 링, 발광, 나머지 15% 투명도. 하지만:

1. **카메라 자동 이동 없음**: `selectPaper()` 호출 시 카메라가 해당 노드로 이동하지 않음. 자동 이동은 **더블클릭에서만** 발생
2. **116개 노드 중 하나를 찾아야 함**: 골드링이 있어도 카메라가 멀리 있으면 구분 불가
3. **cosmic theme에서 금색이 배경과 섞임**: 많은 노드가 이미 밝은 색상

> 어떤 논문을 클릭하든 — 갭 패널이든, 클러스터 패널이든 — 해당 논문 노드가 화면의 주인공이 되어야 하는데 현재는 그렇지 않다.

---

### 요약 테이블

| # | 이슈 | 현재 상태 |
|---|------|----------|
| 1 | 갭 = 클러스터 간 갭인데, 어떤 갭인지 시각적으로 와닿지 않음 | 갭 오버레이에 인터랙션 없음 |
| 2 | 갭에서 연구 아이디어/컨텐츠 생성 필요 | 하드코딩 `research_questions=[]` |
| 3 | Edge Intents 제거 검토 | 기본 intent는 활성, 범례 정리 필요 |
| 4 | Cross-Cluster 얇은 선 범례 누락 | 설명 없음 |
| 5 | Enhanced 실제 미사용인데 범례에 표시 | 백엔드만 구현, UI 트리거 없음 |
| 6 | 범례 전체 업데이트 필요 | 불일치 다수 |
| 7 | **선택 논문 하이라이트 부족 (가장 핵심)** | 코드 있으나 카메라 피드백 없음 |

> 제가 이해한 것이 맞나요? 수정하거나 추가할 부분이 있으면 말씀해주세요.

---

## 호성의 확인 + 개선 지시

**호성 [~05:21 UTC]:**

> 맞아. 이제 이 7가지 이슈를 하나씩 해결해줘. Enhanced는 필요 없을 것 같아. 다른 것들은 개선 방향성을 나에게 상세히 밝혀줘. 그리고 구현한다면 S2 rate limit 혹은 호출 시간 등에서 문제가 생길 수 있는 지점 등 구체적으로 여러 요소를 고려해 줘. 그리고 사용자의 사용성에 대한 전반적인 시뮬레이션을 통해 연구자가 실제 효과적으로 사용할 수 있을지에 대한 객관적인 피드백도 줘. 개선이 필요하다면 어떻게 할 수 있을지도.

**핵심 결정:** Enhanced intents → 제거 확정 ("필요 없을 것 같아")

---

## Claude 상세 분석 — 7가지 이슈별 개선 방향 + UX 시뮬레이션

**Claude [~05:27 UTC]:**

---

### Issue 1 개선: Gap Spotter 시각화

**개선 방향:**

A. 갭 카드 호버 시 3D 시각적 피드백:
- 두 클러스터의 네뷸러 경계선 강조 — 해당 두 클러스터만 빛나고 나머지 dim (opacity 0.05)
- Bridge paper들을 연결하는 `potential_edges`를 임시 표시 — similarity ≥ 0.5인 쌍을 황금 점선으로

B. 갭 강도의 시각적 인코딩:
- 점선의 dash 간격을 gap_strength에 비례

**기술적 제약:** `potential_edges` 데이터 이미 백엔드에서 `top_k=5` 반환. S2 rate limit 영향 없음.

**UX 시뮬레이션:**
> 연구자가 GAPS 탭 진입 → "Computer Sci ↔ Materials Sci (98%)" 카드에 마우스 올림 → 3D에서 해당 두 클러스터가 밝아지고, bridge paper 3개가 금색으로 빛남 → potential edges가 점선으로 표시 → "아, 이 논문들이 연결될 수 있었는데 연결이 안 됐구나"를 직관적으로 파악

**현실적 효과:** 중간. 시각적 피드백은 좋지만 "이 갭으로 뭘 할 수 있는가" → Issue 2가 핵심.

---

### Issue 2 개선: Research Questions 복원

**Phase 1 (즉시 적용):** 휴리스틱 질문 복원 + 개선
- `seed_explore.py`에서 `research_questions=[]` → `research_questions=gap.research_questions`
- 템플릿 3개 → 5개 카테고리:
  1. 방법론 전이: "How might methods from A be applied to B?"
  2. 공통 메커니즘: "What shared mechanisms connect A and B?"
  3. Bridge paper 기반 (기존)
  4. **데이터/도구 전이**: "What datasets or tools from A could advance B?"
  5. **이론적 프레임워크**: "Could a unified framework encompass both A and B?"

**Phase 2 (추후):** Groq LLaMA-3.3-70b 호출로 AI 연구 아이디어 생성

**기술적 제약:**

| 제약 | 영향 | 대응 |
|------|------|------|
| Groq 28 RPM 제한 | 갭 2개 × 사용자 여러 명 = 병목 | 사용자 클릭 시에만 호출, Redis 캐시 (1시간 TTL) |
| 응답 시간 | LLaMA-3.3-70b ≈ 2-5초 | 스켈레톤 로딩 UI + 스트리밍 |

**Claude의 솔직한 평가:**
> 휴리스틱 질문(Phase 1)은 연구자에게 영감의 출발점은 되지만, 너무 일반적이라 실질적인 연구 설계로 이어지기 어렵습니다. "How might methods from A be applied to B?"는 누구나 생각할 수 있는 질문입니다. 진정한 가치는 Phase 2에서 나옵니다.

---

### Issue 3 개선: Edge Intents → Citation Context

1. "EDGE INTENTS" → "CITATION CONTEXT"로 이름 변경
2. Similarity 모드일 때만 표시
3. "Hover edges for details" 안내 강화

---

### Issue 4 개선: Cross-Cluster 범례 추가

```
CROSS-CLUSTER MODE
━━ Gold thick = Inter-cluster connection
── Gray thin  = Intra-cluster connection (dimmed)
```

**설계 결정:** Intra-cluster 엣지 완전 숨기기(A) vs 유지 + 범례 설명(B) → **B 선택** — 클러스터 내부 맥락 유지하면서 교차 연결에 집중.

---

### Issue 5 개선: Enhanced 제거 범위

| 파일 | 변경 |
|------|------|
| `GraphLegend.tsx` | Enhanced 섹션 전체 제거 (lines ~170-193) |
| `types/index.ts` | `ENHANCED_INTENT_COLORS` 상수 제거, `CitationIntent.enhanced_intent` 필드 제거 |
| `ScholarGraph3D.tsx` | `ci.enhanced_intent` 체크 로직 제거 (basic_intent만 사용) |
| `citation_intent.py` | `enhance_intents_with_llm` **보존** (향후 재활성화 가능) |

---

### Issue 6 개선: 모드 반응형 범례

```
edgeVisMode === 'similarity'    → "CITATION CONTEXT" (Background/Methodology/Result)
edgeVisMode === 'temporal'      → "TEMPORAL ENCODING" (Gold=가까움, Gray=먼 거리)
edgeVisMode === 'crossCluster'  → "CROSS-CLUSTER" (Gold thick=교차, Gray thin=내부)
```

기술적 제약 없음 — `edgeVisMode` 상태 이미 구독 중이므로 조건부 렌더링만 추가.

---

### Issue 7 개선: 선택 논문 카메라 포커스 + 시각 강화

**가장 핵심 이슈.**

**A. 카메라 자동 포커스:**
- `panelSelectionId` 패턴: 패널 클릭에서만 설정 (3D 노드 직접 클릭은 이중 애니메이션 방지를 위해 제외)
- 카메라 위치: `z + 200`, lookAt: 노드 위치, duration: 1000ms

**B. 선택 노드 시각 강화:**
- 금색 펄싱 링: `RingGeometry(node.val*2.2, node.val*2.6, 48)`, sin-wave opacity
- 라벨 확대: fontSize 16→20, sprite scale `(40,10,1)` → `(50,13,1)`
- 라벨 배경: 반투명 검정 `rgba(0,0,0,0.65)` 라운드 렉트

**기술적 제약:**

| 제약 | 영향 | 대응 |
|------|------|------|
| `fgRef.current.refresh()` 비용 | nodeThreeObject 재생성 | 펄싱을 CosmicAnimationManager rAF 루프로 처리 |
| 카메라 충돌 | 자동 포커스 중 사용자 드래그 | `cameraPosition` animation 중 사용자 입력 시 자동 취소 |

**UX 시뮬레이션 (개선 후):**
> 연구자가 Gap Spotter에서 bridge paper 클릭 → 카메라가 1초에 해당 논문으로 부드럽게 이동 → 도착하면 노드가 금색으로 펄싱 + 라벨이 크게 표시 → 나머지 95% 어두워짐 → 논문이 3D 공간에서 명확히 위치 파악됨

**현실적 효과:** 매우 높음. 기본 사용성 문제 — 선택이 어디인지 모르면 도구 자체를 사용할 수 없음.

---

## 전체 UX 시뮬레이션: Before vs After

### Before (개선 전)

1. 시드 논문 입력 → 116개 논문, 4개 클러스터 로드
2. GAPS 탭 클릭 → 2개 갭 표시 (98%, 81%)
3. "Computer Sci ↔ Materials Sci" 갭 카드를 봄 → **"98%라는 건 알겠는데, 그래서 뭘 어쩌라고?"**
4. Bridge paper 클릭 → 우측 패널에 상세 정보 뜨지만, **3D에서 어디인지 모름**
5. Research Questions 아코디언 → **비어있음**
6. Cross-Cluster 모드 전환 → 금색 선은 보이지만 얇은 선이 뭔지 모름
7. Enhanced 범례 → 실제 안 보이는 색상이 범례에 있어서 혼란

### After (개선 후)

1. 시드 논문 입력 → 116개 논문, 4개 클러스터 로드
2. GAPS 탭 클릭 → 2개 갭 표시 (98%, 81%)
3. "Computer Sci ↔ Materials Sci" 갭 카드에 호버 → **두 클러스터가 3D에서 밝아지고, bridge paper 3개가 금색, potential edges가 점선으로 표시**
4. Bridge paper 클릭 → **카메라가 자동으로 해당 노드로 이동, 노드가 금색 펄싱**
5. Research Questions 아코디언 → **5개의 구체적 연구 방향 질문 표시**
6. 범례 → 현재 모드에 맞는 정보만 표시, 깔끔

### 객관적 평가

| 측면 | 현재 점수 | 개선 후 예상 |
|------|-----------|-------------|
| 갭 발견 | 3/10 | 7/10 |
| 갭 활용 | 1/10 | 8/10 |
| 논문 탐색 | 4/10 | 9/10 |
| 범례 명확성 | 3/10 | 8/10 |
| **전체 UX** | **4/10** | **8/10** |

---

## 구현 우선순위 결정

**Claude 제안:**

| 순위 | 이슈 | 이유 |
|------|------|------|
| **1** | Issue 7: 선택 논문 하이라이트 + 카메라 포커스 | 기본 사용성. 이게 안 되면 나머지 다 무의미 |
| **2** | Issue 5+6: Enhanced 제거 + 범례 업데이트 | 혼란 제거. 빠르게 적용 가능 |
| **3** | Issue 2 Phase 1: research_questions 복원 | API 하드코딩 한 줄 수정으로 즉시 효과 |
| **4** | Issue 1: 갭 시각화 강화 | 갭 UX의 시각적 완성도 |
| **5** | Issue 4: Cross-Cluster 범례 | 범례 업데이트와 함께 처리 |
| **6** | Issue 3: Edge Intents 정리 | 범례 업데이트와 함께 처리 |
| **7** | Issue 2 Phase 2+3: AI 아이디어 생성 | 차별화 포인트지만 Groq 연동 필요 |

---

## 최종 결정 + 구현 지시

**호성 [~05:35 UTC]:**

> 좋아, 이 순서대로 계획을 작성하여 구현해줘. 위 대화 및 논의는 raw로서 https://github.com/HosungYou/ScholarGraph3D/tree/main/docs/discussion 그대로 저장해 줘. https://github.com/HosungYou/ScholarGraph3D/blob/main/docs/discussion/2026-02-23_ux-review-discussion.md 이것도 지금 raw가 아닌데, 최대한 대화의 흐름이 유지되게 해서 저장해 줘. 이전의 아이템도 수정해줄 수 있으면 해줘.

---

## 구현 계획 수립

**Claude [~05:43 UTC]:**

플랜 작성 완료. 총 6개 Task (0-5), 10개 파일 수정:

| Task | 내용 | 핵심 변경 |
|------|------|----------|
| Task 0 | 대화 기록 저장 (raw 형식) | `docs/discussion/` 파일 2개 |
| Task 1 | Enhanced 제거 | `types/index.ts`, `ScholarGraph3D.tsx`, `GraphLegend.tsx` |
| Task 2 | 모드 반응형 범례 | `GraphLegend.tsx` — edgeVisMode별 동적 렌더링 |
| Task 3 | 카메라 자동 포커스 + 펄싱 링 | `useGraphStore.ts`, `ScholarGraph3D.tsx`, 패널 3개 |
| Task 4 | Research Questions 복원 | `seed_explore.py` 한 줄 + `gap_detector.py` 확장 |
| Task 5 | 클러스터 페어 하이라이트 + potential edges | `useGraphStore.ts`, `GapSpotterPanel.tsx`, `ScholarGraph3D.tsx` |

---

## 구현 결과 — v3.2.0

이 세션에서 수립된 계획은 v3.2.0으로 구현됨 (session `5283b0bb`):

- **18 files changed**, 925 insertions, 78 deletions
- **5 new API endpoints** (bookmark CRUD)
- **1 new DB table** (paper_bookmarks)
- **3 new store fields** (panelSelectionId, highlightedClusterPair, hoveredGapEdges)

Tasks 1-5 + Bookmarks (P10) + Chat Actions (P13) 모두 구현 완료.
Task 0 (대화 기록 저장)은 이 파일의 생성으로 완료.

---

## 핵심 설계 결정 요약

| 결정 | 선택 | 근거 |
|------|------|------|
| Enhanced intents | 프론트엔드에서 제거, 백엔드 보존 | UI 트리거 없는 기능이 범례에서 혼란 유발 |
| `panelSelectionId` 패턴 | 패널 클릭에서만 카메라 이동 | 3D 노드 직접 클릭과 이중 애니메이션 방지 |
| Cross-cluster 얇은 선 | 유지 + 범례 설명 추가 | 완전 숨기면 토폴로지 맥락 상실 |
| Research questions | Phase 1 휴리스틱 (LLM은 추후) | `research_questions=[]` 한 줄 수정으로 즉시 효과 |
| 범례 구조 | edgeVisMode별 조건부 렌더링 | 활성 모드와 무관한 정보 제거로 명확성 향상 |
| 펄싱 링 애니메이션 | CosmicAnimationManager scene traverse | `fgRef.current.refresh()` 재생성 비용 회피 |
| 갭 시각화 | 클러스터 페어 opacity + potential edges | 기존 데이터만 사용, 추가 API 호출 0 |
