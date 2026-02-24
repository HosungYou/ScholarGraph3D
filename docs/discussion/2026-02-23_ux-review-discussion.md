# UX Review Discussion — 2026-02-23

> **Session ID:** `9b97faa6-86f7-467f-be3b-d2ac33342973`
> **Date:** 2026-02-23 (screenshot) ~ 2026-02-24 (discussion)
> **Participants:** 호성 (User), Claude (Assistant)
> **Context:** ScholarGraph3D Explore 페이지 첫 번째 종합 UX 리뷰

---

## 대화 시작 — 호성의 초기 리뷰 요청

**호성 [2026-02-24T02:16:21 UTC]:**

> 이 화면을 봤을 때, 어떤 생각이 들어? 일단 디자인 Theme이 프로젝트 내부 레이아웃에도 적용이 되었는지 궁금하고 (로고는 일단 아님), 폰트나 레이아웃이 제대로 적용되었는지 확인해 줘. 그리고 Gap Spotter에서 hovering을 하든 클릭을 하든 거기서 interaction이 이루어지지 않았고, 연구자가 어떻게 활용할 수 있을 지에 대한 시나리오가 잘 그려지지 않아. 밑의 Frontier paper 또한 마찬가지고. Chat 또한 제대로 작동하지 않아.(에러 확인). Cluster tab에서도 papers에서 클릭하면 해당 논문이 명시적으로 (시각적으로) 드러나야 할 것 같은데 그렇지 않아. 어떻게 생각해?
> 연구자가 프로젝트 내에 들어와서 어떤 방식으로 expand하고 개인에게 필요한 지식그래프를 구축하고 정보를 얻어갈 수 있을까? 토론을 통해서 구축해나가자. 필요한 질문을 모두 해줘. 마지막으로 오른쪽 패널이 노출 될 때 시각이 왼쪽으로 밀리지 않아. 그것도 확인해 줘.

*(Screenshot: 2026-02-23 at 9:15:33 PM KST — ScholarGraph3D Explore 페이지)*

**초기 이슈 요약:**
1. 디자인 테마 적용 확인 (폰트, 레이아웃)
2. Gap Spotter: 호버/클릭 인터랙션 없음
3. Frontier Papers: 인터랙션 없음
4. Chat: 에러 (CORS/502)
5. Cluster tab 논문 클릭 시 시각적 피드백 없음
6. 우측 패널이 3D 뷰를 밀지 않음 (overlay)

---

## Claude 분석 — 코드베이스 + 브라우저 테스트

**Claude [~02:18–02:20 UTC]:**

코드 확인 (`GapSpotterPanel.tsx`, `SeedChatPanel.tsx`, `seed/page.tsx`, `ClusterPanel.tsx`, `DESIGN_THEME.md`) + 브라우저 실제 테스트 후 종합 분석:

### 1. 디자인 Theme 적용 상태

**잘 적용된 부분:**
- v4.0.0 "Stellar Observatory" 테마가 Explore 내부 레이아웃에 전반적으로 잘 적용됨
- Gold (#D4AF37) 악센트가 탭 활성 상태, 헤더 라벨, 버튼에 일관성 있게 사용됨
- HUD 패널들 (SECTOR SCANNER, GAP SPOTTER, RESEARCH ASSISTANT, OBJECT SCAN) 네이밍 컨벤션이 DESIGN_THEME.md 문서와 일치
- JetBrains Mono 폰트가 라벨/데이터에 잘 적용됨

**확인 필요:** citation edge 파티클이 gold(#D4AF37)이 아닌 cyan으로 여전히 렌더링

### 2. Gap Spotter 인터랙션 문제

근본적인 인터랙션 부재:
- **Gap Card**: `onMouseEnter`로 `highlightedPaperIds`를 설정하지만, **클릭 핸들러가 없음**
- **Bridge Papers**: hover 시 배경색만 약간 변하는 정도. **클릭해서 논문 선택/3D 포커스 불가**
- **Frontier Papers**: **클릭 핸들러 전무**. 단순 리스트 표시만

### 3. Chat 에러

- **CORS 에러**: `scholargraph3d.onrender.com/api/graphs` 요청이 Vercel 프론트엔드에서 차단
- **502 Bad Gateway**: `seed-chat` 엔드포인트 — Render 백엔드 또는 Groq API 연결 실패

### 4. Cluster → Papers 클릭 시 시각적 피드백

- OBJECT SCAN 패널은 잘 열림
- 하지만 **좌측 논문 목록에서 선택된 논문에 대한 시각적 강조가 거의 없음**
- 3D 뷰에서 해당 노드 하이라이트도 패널이 위를 덮어서 확인 어려움

### 5. 우측 패널과 뷰 밀림

`absolute` overlay로 구현 (line 578-593, `seed/page.tsx`). DESIGN_THEME.md에서 의도적으로 "no graph push"로 명시했지만 실 사용성 문제.

---

## Claude의 6가지 핵심 질문

**Claude:**

**1. Gap Spotter의 목적 재정의**
> Gap을 클릭하면 어떤 일이 일어나야 한다고 생각하시나요? (예: 카메라가 두 클러스터 사이로 이동? bridge papers를 3D에서 강조? research question을 자동 생성?)
> Bridge papers를 클릭했을 때 해당 논문의 OBJECT SCAN이 열려야 할까요, 아니면 3D에서 해당 위치로 카메라가 이동해야 할까요?

**2. Frontier Papers의 역할**
> "이 논문을 expand해서 네트워크를 더 확장하라"는 의미인가요? 아니면 "아직 탐색하지 않은 방향"을 보여주는 것인가요? 클릭 시 자동 expand?

**3. 우측 패널 동작 방식**
> A) Push 레이아웃 vs B) Overlay + 3D 카메라 자동 포커스?

**4. Cluster 내 논문 선택의 피드백 루프**
> 좌측 목록에서 시각적으로 두드러져야? 3D에서 카메라 자동 이동 + zoom? 이웃 노드 하이라이트?

**5. 전체적인 연구자 워크플로우**
> 북마크/태그? 여러 seed paper 그래프 병합? pruning? 개인 메모?

**6. Chat의 역할**
> 단순 Q&A vs 그래프 연동 인터랙티브 탐색?

---

## 호성의 답변 — 핵심 결정

**호성 [2026-02-24T03:44:21 UTC]:**

> 1. bridge papers를 3D에서 강조. 시각적인 측면 말고 기능적인 측면에서 무엇을 할 수 있을지도 제안해 줘.
> 2. 나도 잘 모르겠어. 최소한 호버링을 했을 때 어떤 논문인지 표시가 되면 좋긴 할텐데, 또한 여기서 호버링했을 때 본 연구와의 관계 혹은 어떤 점에서 의의가 있을 지 알 수 있나? 그리고 Edge Intents가 background밖에 표현이 되지 않는 것 같은데 (회색 선), 그게 맞는지? 다른 엣지가 나타날 방법은 없는지, 또한 이 선들이 유의미하게 활용되려면 어떤 식으로 사용되어야 할 것인지 논의가 필요해. 어떻게 생각해?
> 3. Push가 나을 것 같아.
> 4. 응 선택된 논문이 두드러져야 하는데, 클러스터 내의 논문이 같이 두드러지되 해당 논문이 더욱 두드러지게 해줘. 그리고 ...으로 글자가 표시가 안되면 다음 줄을 만들어서라도 보이게 해줘. 그리고 실제 유의미한 Statistics을 넣을 제안을 해줄래? 카메라 이동은 필요 없을 것 같아.
> 5. 북마크/태그 필요해. 병합은 아직 이른 것 같아. pruning은 일단 필요 없어. 메모는 필요할 것 같아. Citation Path Finder는 어떻게 활용되는지 모르겠네. 어떻게 필요한거지? 오른쪽 패널에 뭐가 필요할까? 메타데이터를 API에서 더 필요한 것을 뽑아올 수 있다면? 일단 최소한 대시보드에 저장할 수 있는 연구자 개별화된 정보가 필요해.
> 6. 당연히 그래프와 연동된 인터랙티브 탐색이야.

---

## Claude 심화 분석 — Edge Intents 문제 근본 원인 + 기능 제안

**Claude [~03:46 UTC]:**

### Gap Spotter — Bridge Papers 기능 제안

| 인터랙션 | 동작 | 연구자 가치 |
|----------|------|------------|
| Bridge paper 클릭 | OBJECT SCAN 패널 열기 | 왜 이 논문이 두 분야를 연결하는지 즉시 파악 |
| Gap Card 클릭 | "Gap Report" 미니 뷰 | 클러스터 A vs B 키워드, 공통/차이점, 잠재적 연구 방향 |
| "Explore this gap" 버튼 | bridge paper 자동 expand | 갭 영역의 선행연구 자동 발굴 |
| "Generate research questions" 버튼 | Chat에 gap context 자동 전달 → LLM 연구 질문 생성 | `gap_detector.py`가 이미 `research_questions` 반환하는데 프론트엔드에서 미표시 |

### Edge Intents — Root Cause

`seed_explore.py:387`에서 `get_basic_intents(seed_paper.paper_id, ...)`를 호출 — **seed paper 하나에 대한 citation intent만** 가져옴. 80개 노드, 44개 citation edge 중 seed paper 관련 edge들만 intent 정보 보유. 나머지는 모두 기본값 `#444444`.

S2 free tier가 반환하는 intent 대부분 `"background"`. Enhanced intents는 LLM 호출 필요하나 UI 트리거 없음.

### 클러스터 통계 제안

H-index, Recency Score (최근 3년 %), Top Authors (2-3명, S2 링크)

### Citation Path Finder 설명

현재: "Path: N nodes" 텍스트만 표시. 제안: 인라인 시각화 — 논문 체인 + temporal distance + 클릭 가능한 각 노드

---

## Edge 대안 논의 — Intent 대신 무엇을 표현할 수 있나?

**호성 [2026-02-24T04:00:37 UTC]:**

> Edge를 Intent가 아니라 다른 값을 엣지로서 표현하는 방법은 없을까? "background" 혹은 methodology나 result_comparison 등은 두 논문의 관계성에 있어서 크게 의미가 없는 것 같긴 해. S2 rate limit 혹은 소요 시간을 증가시키지 않는 선에서 표현할 수 있는 관계적 데이터는 뭐가 있을까?
>
> H-index of cluster, Recency Score, Top Authors 가 좋을 것 같아. Author의 논문에 접근하도록 하이퍼링크를 달 수 도 있나?
>
> Citation Path Finder의 경우 그에 대한 설명 혹은 시각화가 더욱 필요해. 인터랙션이 강화되어야 한다는 뜻이야.
>
> 백엔드 안정화를 먼저: 인정
>
> 우선순위에 동의하고 위 피드백을 확인하고 질문에 답해줘.

**Claude [~04:02 UTC]:**

추가 API 호출 없이 가능한 Edge 표현 6가지:

| Edge 속성 | 데이터 소스 | 추가 API | 계산 비용 |
|-----------|-----------|----------|----------|
| Similarity weight (0.7~1.0) | `edge.weight` — 이미 있음 | 0 | 0 |
| Temporal distance | `nodeA.year - nodeB.year` | 0 | 뺄셈 1회/edge |
| Cross-cluster | `nodeA.cluster_id !== nodeB.cluster_id` | 0 | 비교 1회/edge |
| Shared authors | `nodeA.authors ∩ nodeB.authors` | 0 | Set 교집합/edge |
| Bidirectional citation | citation edge 양방향 존재 | 0 | Set lookup/edge |
| isInfluential | S2가 seed citations과 함께 반환 | 0 | 이미 있는 값 |

Author 하이퍼링크: 백엔드가 이미 `authorId`를 S2에서 가져옴. 프론트엔드 `Author` 타입에 `id?: string` 추가 + `https://www.semanticscholar.org/author/{authorId}` 링크.

---

## 최종 결정 — 6개 전부 + 모드 전환 구조

**호성 [2026-02-24T04:06:28 UTC]:**

> 추가 비용 없이 가능한 Edge 표현 모두 포함할 수 있니? 그렇게 되면 추가 API 호출, 계산 비용이 증가하니? 너의 생각은 어때? 3개를 제안했는데 내 생각에는 다 괜찮은 것 같아서. 대답해 줘.

**Claude [~04:07 UTC]:**

> **6개 전부 가능합니다. 추가 API 호출 0, 계산 비용 무시할 수 있는 수준입니다.**
>
> 80개 노드, ~128개 edge 기준으로 1-2ms 이내.
>
> 다만 6개를 동시에 전부 보여주면 시각적 혼란. Edge에 매핑 가능한 시각 채널: 색상, 두께, 투명도, 패턴 — 4개 채널에 6개 속성.
>
> **기본 조합 (항상 적용):** Bidirectional → 쌍방향 화살표, isInfluential → glow, Shared authors → green
>
> **전환 가능한 모드:** Mode 1 (Similarity Strength), Mode 2 (Temporal Flow), Mode 3 (Cross-cluster)

---

## 구현 지시 + 대화 저장 요청

**호성 [2026-02-24T04:10:45 UTC]:**

> 좋아, 그 방향으로 진행해. 전환 가능한 모드에서 가장 기본은 모드 1로 해줘. 계획 모드로 진입해서 진행해주고, 우리 대화 및 토론과정을 담은 위 대화를 모두 docs에 원본으로 저장해 줘. discussion 폴더를 생성해서 오늘 시간을 마크해서 기록해 줘.

---

## 구현 결과 — v3.1.0

이 세션에서 식별된 이슈들 중 Phase 1-3이 v3.1.0으로 구현됨:
- CORS fix (`.onrender.com` 추가)
- Push layout (absolute overlay → flex sibling)
- Gap Spotter interaction (bridge paper 클릭 → selectPaper)
- Paper selection visual feedback (gold left-border, line-clamp-2)
- Edge 3-mode system (Similarity/Temporal/CrossCluster + always-on bidirectional/shared-author)
- Heuristic research questions (3 categories)
- Cluster statistics (H-index, Recency %, Top Authors)
- Author S2 links
- Citation Path visual chain
- In-graph drill-down (References/Cited-by lists)

Phase 4 (P10 Bookmarks, P13 Chat Graph Integration) deferred to v3.2.0.

---

## 핵심 결정 요약

| 결정 | 선택 | 이유 |
|------|------|------|
| 우측 패널 레이아웃 | Push (flex sibling) | Overlay보다 공간 인식 우수 |
| Edge 모드 | 3개 전환 모드 + 3개 항상 표시 | 4개 시각 채널에 6개 속성 → 동시 표시 불가 |
| 기본 Edge 모드 | Mode 1 (Similarity Strength) | 가장 범용적 |
| Edge 모드 전환 UI | Radio buttons | 기존 Legend 패턴과 일치 |
| 연구 질문 | 휴리스틱 3개 (LLM은 Phase 2) | 즉시 적용 가능, LLM 연동은 Groq rate limit 고려 필요 |
| 클러스터 통계 | H-index + Recency % + Top Authors | 기존 데이터로 계산, API 호출 불필요 |
| H-index 계산 | 클라이언트 사이드 (in-graph papers 기반) | 글로벌 S2 데이터가 아닌 그래프 내 데이터 |
| Author 링크 | S2 프로필 외부 링크 | authorId 이미 보유, 추가 API 불필요 |
| Bidirectional/Shared author edges | 모드 무관하게 항상 표시 | 드문 edge라 노이즈 적음 |
| 북마크/태그/메모 | Phase 4 (v3.2.0) | DB 테이블 신규 필요 |
| 그래프 병합/Pruning | 보류 | 현 단계에서 복잡도 과다 |
