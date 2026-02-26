# Platform Direction & Feature Roadmap Discussion
## v3.6.0: Multi-seed Merge + View Toggle

| Item | Detail |
|------|--------|
| Session | vivid-dancing-minsky |
| Date | 2026-02-25 |
| Supersedes | v3.5.1 Centrality/Nebula plan |
| Participants | hosung + Claude |
| Output | v3.6.0 implementation plan |

---

## 배경: v3.5.1 이후 구조적 문제 식별

v3.5.1 출시 후 두 가지 구조적 문제를 발견함:

1. **레이아웃 문제**: UMAP depth-1 그래프에서 모든 논문이 시드 논문 주변에 집중됨 → 허브 효과로 시각적 중첩 심각
2. **워크플로우 문제**: 모든 탐색이 단일 시드/일회성 → 연구자가 세션 간 지식 그래프를 확장할 수 없음

---

## 플랫폼 방향: 두 사용자 타겟 결정

### Primary: 일반 연구자 (General Researcher)
- 목표: 갭 발견, 클러스터 구조 파악, 브리지 논문 식별
- 현재 도구 부재 영역 → ScholarGraph3D의 차별화 포인트
- 50-200 노드 범위에서 최적 작동

### Secondary: SNA 연구자
- 목표: 학술 보고서 작성, 네트워크 뷰 내보내기
- v3.4.0 Academic Report로 부분 지원
- **왜 Primary가 될 수 없는가**: 50-200 노드 한계 (SNA는 수천 노드 필요), null model 미구현, GEXF 내보내기 없음

### 결정: 일반 연구자 = Primary Target
ResearchRabbit/ConnectedPapers/VOSviewer와 차별화하는 핵심 = Multi-seed Merge

---

## UX 시나리오 비교

| 시나리오 | 현재 (v3.5.1) | A: View Toggle 후 | B: Multi-seed 후 |
|---------|-------------|-----------------|----------------|
| **갭 발견** | 시드 중심 허브 → 갭 위치 불명확 | Semantic: UMAP 갭 시각화 / Network: citation 구조 | 두 번째 시드로 갭 논문 네트워크 탐색 가능 |
| **브리지 논문** | 브리지 발견 후 탐색 종료 | Network 뷰에서 브리지 구조 더 명확 | 브리지를 두 번째 시드로 추가 → 연결 네트워크 확장 |
| **클러스터 구조** | UMAP 클러스터 = 의미적 유사성 | Semantic/Network 전환으로 두 관점 | 두 번째 시드 추가 후 클러스터 재분류 예정 |

---

## Task A: View Toggle (Semantic ↔ Network Layout)

### 개요
UMAP 고정 위치(의미적 유사성)와 d3-force 시뮬레이션(인용 네트워크 위상) 간 전환.

### 기술적 접근
- **Semantic mode**: 각 노드에 `fx/fy/fz` = UMAP 좌표 설정 → force sim 고정
- **Network mode**: `fx/fy/fz` 제거 → d3-force 자유 실행
- react-force-graph-3d 내부 d3-force sim 활용 → 새 렌더러/물리 엔진 불필요

### 파일 변경
- `useGraphStore.ts`: `layoutMode: 'semantic' | 'network'` + `setLayoutMode` 추가
- `ScholarGraph3D.tsx`: `forceGraphData` useMemo에서 layoutMode 조건부 fx/fy/fz, d3Force link 설정 effect
- `GraphControls.tsx`: 레이아웃 모드 토글 드롭다운 추가

### SNA 연구자 가치
- Network 뷰 = citation 구조 기반 배치 → 전통적 SNA 시각화
- Semantic 뷰 = SPECTER2 임베딩 기반 → 연구 영역 클러스터 시각화

---

## Task B: Multi-seed Merge ("Add as Second Seed")

### 개요
OBJECT SCAN에서 어떤 논문이든 "Add as Second Seed"로 추가 가능. 해당 논문의 전체 인용 네트워크(depth 1, 최대 80편)를 가져와 기존 그래프에 k-NN 위치 보간으로 병합.

### 아키텍처 결정: 기존 엔드포인트 재사용
`POST /api/papers/{id}/expand-stable` 그대로 사용:
- 이미 전체 refs+cites 가져옴
- k-NN 보간으로 새 논문 위치 계산 (`incremental_layout.py`)
- 기존 클러스터 중 가장 가까운 클러스터에 배정
- 변경사항: `limit` 20 → 80 (두 번째 시드 호출 시)

### 갭 재감지 전략
v3.6.0: 병합 후 "Gap analysis may have changed — Refresh" 배너 표시 (수동 트리거)
v3.7.0: 자동 갭 재감지 예정

### 차별화
**ResearchRabbit, ConnectedPapers, VOSviewer 모두 이 기능 없음**
- 기존 지식 그래프 위에 새 시드 네트워크 병합
- 두 연구 영역 간 연결고리 시각화
- 점진적 지식 그래프 구축

---

## 구현 우선순위 결정

| 우선순위 | Task | 이유 |
|---------|------|------|
| 1 | Task A (View Toggle) | Backend 변경 0, ~1일 작업, SNA 연구자 즉시 가치 |
| 2 | Task B (Multi-seed Merge) | 핵심 차별화 기능, ~2일 작업 |
| 3 | Task C (Multi-level abstraction) | v4.0으로 연기 (노드 200+ 필요, 현재 미해당) |

### Task C 연기 이유
- Overview → Drill-down은 노드 수 200+ 초과 시 의미 있음
- 현재 50-200 노드 범위 = 전체 화면에서 충분히 탐색 가능
- 구현 복잡도 높음 (별도 뷰포트, 줌 레벨 관리)

---

## 제약사항 및 알려진 한계 (v3.6.0)

- 새 노드는 k-NN 보간으로 배치 (re-UMAP 아님) → 의미적 레이아웃 근사치
- 병합 후 클러스터 재분류 없음 (기존 클러스터에 배정)
- 갭 재감지 수동 (v3.7.0에서 자동화)
- 두 번째 시드당 최대 80편 (S2 rate limit + 25s timeout)

---

## 결론

v3.6.0 범위:
- **Task A**: View Toggle (Semantic ↔ Network) — SNA 연구자용 레이아웃
- **Task B**: Multi-seed Merge — 핵심 차별화 기능, 점진적 지식 그래프 구축

v4.0 범위:
- **Task C**: Multi-level abstraction (Overview → Drill-down)
- 노드 200+ 초과 시 도입
