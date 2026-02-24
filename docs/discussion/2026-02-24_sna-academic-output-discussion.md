# SNA Academic Output Discussion — 2026-02-24

## Context

교수님 피드백: ScholarGraph3D의 산출물이 Elicit/Scite와 달리 **즉시 인용 가능한 학술 표준(APA 7th) 수준의 리포트**를 생성하지 못함. 현재는 탐색 도구 수준이며, 논문에 증거로 직접 사용 불가.

## 핵심 통찰

ScholarGraph3D의 기존 기능이 이미 SNA 분석과 동일:
- Gap detection → Burt(1992)의 Structural Holes
- Clustering → Community detection (Newman & Girvan, 2004)
- Bridge papers → Brokerage analysis
- Centrality → Freeman (1978), Brin & Page (1998)

**내용은 SNA와 동일하지만 학술적 포장과 표준 메트릭이 없는 것**이 문제.

## SNA 매핑 분석 → 3개 층위

### Layer 1: 네트워크 수준 (기존 없음 → 추가)
- Density, Diameter, Avg path length
- Reciprocity, Transitivity
- Component count, Avg degree

### Layer 2: 노드 수준 (기존 부분적 → 확장)
- Degree centrality (in/out) — Freeman (1978)
- Betweenness centrality — Freeman (1977)
- Closeness centrality — Freeman (1978)
- PageRank — Brin & Page (1998)
- Eigenvector centrality — Bonacich (1987)

### Layer 3: 커뮤니티/구조적 수준 (기존 부분적 → 확장)
- Modularity (Q) — Newman & Girvan (2004)
- Intra-cluster density
- Silhouette score — Rousseeuw (1987)
- Constraint, Effective size, Efficiency — Burt (1992)

## 결정 사항

### 사용 맥락
- B) 도구로 사용하는 연구자의 논문 증거
- C) 학위 논문 갭 정당화
- (A는 제외: 독립 SNA 논문 수준은 불필요)

### 프레이밍
- "Citation network analysis" 단일 표현 (분야 불문)
- SNA/bibliometrics 용어는 Methods에서만 사용

### UI
- 독립 탭: ACADEMIC ANALYSIS
- 기존 탭(CLUSTERS, GAPS, CHAT) 옆에 추가

### Citation
- APA 7th만 지원
- 하드코딩 참고문헌 12편 (방법론 논문)
- 분석 대상 핵심 논문은 동적 생성

### Premium
- 컨셉만 유지, 구현은 추후
- 현재는 모든 사용자에게 무료 제공

### 시각적 리포트
- 출판 수준의 전문성 필요
- Figure 1: 네트워크 전체도 (3D 스크린샷)
- Figure 2: 갭 오버레이 (Gap Spotter 활성)
- Figure 3: Centrality 분포 (가로 막대 차트)
- APA Figure caption 자동 생성

## 연구자 시나리오 3개

### Scenario 1: PhD Student — 학위 논문 갭 정당화
김 연구자(정보학 박사과정), Chapter 2 Literature Review 작성 중.
- 150-paper citation network → 5개 클러스터
- NLP ↔ Scientometrics 사이 structural gap 발견
- Methods + Table 4 + Figure 1으로 갭 정당화

### Scenario 2: 부교수 — 연구비 신청서
이 교수(교육학), NSF 연구비 "Significance" 섹션.
- 120-paper network → Educational Technology ↔ Cognitive Science 갭
- Table 1 (네트워크 통계) + Table 4 (Gap Analysis)로 정량적 증거

### Scenario 3: Systematic Reviewer — Scoping Review
박 연구자, "AI in Healthcare" 스코핑 리뷰.
- 200-paper network → 7개 클러스터
- Table 1-5 전부 Results 섹션에 삽입
- Methods 섹션 전체를 논문에 그대로 사용

## 리포트 생성 Bottom Line (최소 조건)

| 조건 | Papers | Clusters | 생성 가능 | 산출물 수준 |
|------|--------|----------|----------|-----------|
| 극소 | <10 | 0-1 | 부분 생성 | Table 1 + 경고 |
| 소형 | 10-30 | 2+ | 기본 생성 | Table 1-3 + Methods |
| **중형** | **30-100** | **3+** | **전체 생성** | **모든 Table + Figure + 전체 리포트** |
| 대형 | 100-200 | 4+ | 풍부한 생성 | 모든 항목 + 상세 해석 |

**Hard minimum:** 10 papers + 2 clusters

## 구현 계획

### Task 0: 토론 기록 저장 (이 문서)
### Task 1: Network Metrics Module — `backend/graph/network_metrics.py`
### Task 2: Academic Report Service — `backend/services/academic_report_service.py`
### Task 3: API Endpoints — `backend/routers/academic_report.py`
### Task 4: Frontend — 타입, API, store, export, 컴포넌트, 페이지
### Task 5: 시각적 리포트 (Task 4에 포함)
### Task 6: 테스트

**총:** 신규 8 파일, 수정 ~9 파일
