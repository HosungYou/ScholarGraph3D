# ScholarGraph3D v3.7.0 — Rendering Diagnostic & Structural Improvements

**Released:** 2026-02-27
**Session:** vivid-dancing-minsky
**Supersedes:** v3.6.0 (View Toggle + Multi-seed Merge)

---

## Summary

v3.6.0 배포 후 발견된 렌더링 버그들의 근본 원인을 분석하고 구조적 개선을 완료한 릴리즈.

커밋 5799532에서 이미 수정된 긴급 버그(Z-scaling, nebula opacity, min_dist) 외에 5가지 구조적 개선을 추가.

---

## Changes

### Backend — `backend/graph/embedding_reducer.py`

**Task 1: Adaptive UMAP n_neighbors**
- 고정값 n_neighbors=10 대신 `min(15, max(10, N//3))` 적응형 계산
- N=50 → n_neighbors=15, N=30 → n_neighbors=10, N=100 → n_neighbors=15
- 글로벌 구조 반영 개선 (기존: 전체의 20%만 참조)

**Task 2: Temporal Z 조건부 비활성화**
- Year span < 3이면 temporal Z override 스킵 → UMAP Z 사용
- GPT-4(2022-2023) 같은 단기 논문 세트에서 이분화 방지
- 로그: `"Year span=1 < 3: Skipping temporal Z override"`

### Backend — `backend/routers/seed_explore.py`

**Task 3: Silhouette Score → Meta**
- `cluster_silhouette` 계산 및 `meta` 딕셔너리에 포함
- sklearn silhouette_score (euclidean, sample_size ≤ 500)
- 클러스터 1개 또는 모든 노드 unclustered인 경우 0.0 반환

**Task 4: Direction 필드 추가**
- `SeedGraphNode.direction: str = ""` 필드 추가
- 값: `"seed"` | `"reference"` (seed가 인용한 논문) | `"citation"` (seed를 인용한 논문)
- 임베딩 없는 논문에도 direction 설정

**Task 5: 임베딩 없는 논문 Centroid 배정**
- 기존: periphery (y=10.0 라인) 일렬 배치, cluster_id=-1
- 변경: 가장 가까운 클러스터 centroid에 배정 (round-robin + jitter)
- 클러스터 정보 없을 때 fallback으로 periphery 배치 유지

**Cache Key Versioning**
- Cache key를 `{paper_id}:v3.7.0`으로 변경 → old cache 반환 방지

### Frontend — `frontend/types/index.ts`

- `Paper.direction?: 'seed' | 'reference' | 'citation'` 필드 추가
- `GraphData.meta`에 `cluster_silhouette?: number` + index signature 추가

### Frontend — `frontend/components/graph/cosmic/starNodeRenderer.ts`

**Task 6: Direction-Aware 색상 인코딩**
- `StarNodeOptions.direction?: string` 추가
- reference 논문: 파란 방향 tint (15% lerp to #4488FF)
- citation 논문: 주황 방향 tint (15% lerp to #FF8844)
- 선택/하이라이트 상태에서는 tint 무시 (기존 color 우선)

### Frontend — `frontend/components/graph/GraphLegend.tsx`

**Task 6: Direction Legend 추가**
- Reference (선행연구) 파란 점
- Citation (후속연구) 주황 점

### Frontend — `frontend/hooks/useGraphStore.ts`

**Task 7: graphMeta 상태 추가**
- `graphMeta: Record<string, any> | null` 필드
- `setGraphMeta` 액션

### Frontend — `frontend/components/graph/ClusterPanel.tsx`

**Task 7: Cluster Quality 경고 배너**
- `graphMeta.cluster_silhouette < 0.15`이면 황색 경고 배너 표시
- "⚠ 클러스터 구분도 낮음 (silhouette=X.XX)"

### Frontend — `frontend/components/graph/ScholarGraph3D.tsx`

**Task 8: Gap Arc 시각화**
- `highlightedClusterPair` 활성화 시 두 cluster centroid 사이에 곡선 arc 렌더링
- `THREE.QuadraticBezierCurve3` (midPoint Y+30 for 위로 볼록)
- 골드 (#D4AF37), opacity 0.6, depthWrite false
- gap-arc 오브젝트 이름으로 cleanup 관리
- Centroid에 CS=15 적용 (X/Y), Z는 그대로

### Backend — `backend/main.py`

- Version: `"3.6.0"` → `"3.7.0"`

---

## Deployment Checklist

| # | Check |
|---|-------|
| 1 | `cd frontend && npx tsc --noEmit` → zero errors |
| 2 | Year span < 3 논문 → temporal Z 비활성화 확인 |
| 3 | Silhouette score가 meta에 포함되어 frontend에서 읽히는지 확인 |
| 4 | Direction 필드: references = 파란 tint, citations = 주황 tint |
| 5 | Gap Arc: gap hover 시 arc 나타나고, hover 해제 시 제거 확인 |
| 6 | 임베딩 없는 논문: periphery 일렬 대신 클러스터에 배정 확인 |
| 7 | Redis 캐시 key 버전 포함 확인 |
| 8 | `backend/main.py` version: `"3.7.0"` |

---

## No Breaking Changes

- 0 new dependencies
- 0 new API endpoints
- 0 new environment variables
- Redis cache: old v3.6.0 responses automatically bypass via `:v3.7.0` key suffix
