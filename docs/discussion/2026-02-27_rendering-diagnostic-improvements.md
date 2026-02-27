# Rendering Diagnostic & Structural Improvements Discussion

**Date:** 2026-02-27
**Session:** vivid-dancing-minsky (continued from v3.6.0)
**Participants:** hosung, Claude Code
**Output:** v3.7.0 implementation plan (9 improvements)

---

## 세션 메타데이터

- **이전 세션:** v3.6.0 (View Toggle + Multi-seed Merge, 커밋 완료)
- **계기:** v3.6.0 배포 후 3D 그래프가 납작한 컬러 blob으로 렌더링되는 버그 발견
- **즉각 수정:** 커밋 5799532에서 Z-scaling regression 및 nebula opacity 수정 완료
- **이 세션 범위:** 나머지 구조적 개선 9개 항목 설계 및 구현

---

## 배경: 초기 에러

v3.6.0 배포 직후 3D 그래프가 평면적 컬러 blob으로 렌더링되는 문제를 발견했다.

**증상:**
- 논문들이 3D 공간에 분산되지 않고 Z축이 거의 없는 평면 배치
- Nebula 클러스터가 불투명한 solid blob처럼 보임
- GPT-4 같은 year span이 좁은 논문 세트에서 두 개의 층(pillar/fan shape)으로 이분화

**근본 원인 분석:**
1. **Z-scaling regression**: `paper.z`에 CS=15를 적용했었음 (이미 [-10,10] 범위인데 곱해서 과도한 Z 범위 발생)
2. **Nebula opacity 과다**: 이전 파라미터 값이 너무 높음
3. **UMAP min_dist 0.1**: 클러스터가 너무 밀집 → blob 형태

---

## 즉각 버그 수정 (커밋 5799532)

| 수정 항목 | 이전 값 | 수정 값 |
|-----------|---------|---------|
| Z-axis scaling | `paper.z * CS` | `paper.z` (CS 미적용) |
| UMAP min_dist | 0.1 | 0.3 |
| Nebula opacity | 과도한 값 | 조정됨 |

---

## 클러스터 생성 원리 분석

### Star Topology → Hub Bias

depth-1 탐색은 seed paper를 중심으로 한 star topology를 형성한다. Leiden hybrid 알고리즘이 이 구조를 잘 처리하지만, 논문 수가 적을 때 (<20) hub 논문 주변으로만 클러스터가 형성되는 bias가 있다.

### SPECTER2 누락 패턴

S2 API에서 SPECTER2 임베딩이 없는 논문이 약 15-30% 발생한다. 이 논문들은 기존 코드에서 periphery (y=10.0 라인)에 일렬 배치되어 클러스터 분석에서 제외됐다.

### Temporal Z 취약점

Year span이 1인 경우 (예: GPT-4 논문들 2022-2023) temporal Z override가 논문들을 -10과 +10 두 값만으로 이분화. 이는 UMAP이 계산한 의미 있는 Z 분포보다 더 나쁜 결과를 냄.

---

## S2 API 근본 제약

| 제약 | 영향 |
|------|------|
| depth-1 한계 | seed의 직접 인용만 접근 가능 |
| Rate limit | 1 RPS authenticated, 0.3 RPS unauthenticated |
| SPECTER2 누락 | 약 15-30% 논문에 임베딩 없음 |
| Batch 제한 | 대량 embedding fetch에 시간 소요 |

---

## InfraNodus 비교 분석

InfraNodus의 세 가지 핵심 기능을 참고하여 채택/반박 결정:

| InfraNodus 기능 | 분석 | 결정 |
|----------------|------|------|
| AI Bridge Generator | Groq 기반 cross-cluster 연결 제안 | 부분 채택 — Gap Arc 시각화로 구현 |
| Geometry+Topology 분리 | 의미 구조 vs 인용 네트워크 별도 분석 | 채택 — direction 필드로 구현 |
| Supply vs Demand | 연구 공급과 수요 분석 | 반박 — depth-1 제약으로 실현 불가 |

---

## 개선 방향 결정

| # | 항목 | 우선순위 | 범위 |
|---|------|---------|------|
| 1 | UMAP n_neighbors 적응형 | 높음 | v3.7.0 |
| 2 | Temporal Z 조건부 비활성화 | 높음 | v3.7.0 |
| 3 | Silhouette score → meta | 중간 | v3.7.0 |
| 4 | Direction 필드 추가 | 중간 | v3.7.0 |
| 5 | SPECTER2 없는 논문 centroid 배정 | 중간 | v3.7.0 |
| 6 | Direction-aware 색상 | 낮음 | v3.7.0 |
| 7 | Cluster quality 경고 배너 | 낮음 | v3.7.0 |
| 8 | Gap Arc 시각화 | 낮음 | v3.7.0 |
| 9 | 2D Cluster Map 진단 패널 | 낮음 | v3.7.1 |

---

## v3.7.0 범위 (단기)

- 총 ~390 lines, 0 new dependencies, 0 new API endpoints
- Backend: embedding_reducer.py (Tasks 1-2), seed_explore.py (Tasks 3-5)
- Frontend: types (Task 4F), starNodeRenderer (Task 6), GraphLegend (Task 6), useGraphStore (Task 7), ClusterPanel (Task 7), ScholarGraph3D (Task 8)

## v4.0 범위 (장기)

- Depth-1.5 샘플링 (seed 상위 references의 references 추가 fetch)
- 2D Cluster Map 진단 패널 (d3.js scatter plot)
- Gap arc 굵기 = gap_strength 인코딩 (TubeGeometry)
- Supply vs Demand 분석 (충분한 데이터 확보 후)
