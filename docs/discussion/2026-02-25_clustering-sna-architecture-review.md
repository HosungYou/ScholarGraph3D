# 클러스터링/SNA 아키텍처 리뷰 — 2026-02-25

## Session Context

| Key | Value |
|-----|-------|
| Date | 2026-02-25 |
| Participants | Hosung, Claude |
| Context | v3.3.1 이후 클러스터링 알고리즘 및 SNA 표준 적합성 리뷰 |
| Results | HDBSCAN → Leiden 하이브리드 전환, TF-IDF 레이블링, SNA 메트릭, Structural Holes |

---

## 세션 시작 — 호성의 아키텍처 리뷰 요청

호성이 ScholarGraph3D의 클러스터링 알고리즘과 SNA 표준과의 괴리를 지적하며 아키텍처 리뷰를 요청함.

주요 질문:
1. 패널이 캔버스를 가리는 UI 문제
2. HDBSCAN이 인용 네트워크의 그래프 토폴로지를 무시하는 문제
3. "Computer Science / Mathematics" 같은 부정확한 클러스터 레이블
4. SNA 표준 도구 (VOSviewer, CiteSpace) 대비 격차

<!-- 스크린샷 참조:
![패널 가림 문제](images/2026-02-25/01-gap-panel.png)
![클러스터 레이블 문제](images/2026-02-25/02-cluster-labels.png)
![HDBSCAN 결과](images/2026-02-25/03-hdbscan-result.png)
![VOSviewer 비교](images/2026-02-25/04-vosviewer-comparison.png)
![Bibliographic coupling 개념](images/2026-02-25/05-bib-coupling.png)
![Leiden 알고리즘](images/2026-02-25/06-leiden-algorithm.png)
![최종 아키텍처](images/2026-02-25/07-final-architecture.png)
-->

---

## Claude 코드베이스 분석 — 7가지 핵심 발견

### 1. HDBSCAN이 그래프 토폴로지 무시

**문제**: `clusterer.py`의 HDBSCAN은 SPECTER2 임베딩의 유클리드 거리만으로 군집화. 인용 관계, 공동 인용(co-citation), 서지적 결합(bibliographic coupling) 등 그래프 구조 정보를 전혀 사용하지 않음.

**영향**: NLP 논문들이 의미적으로 가깝다는 이유로 "Computer Science / Mathematics"로 레이블링되는 오류. 실제로는 "Prompt Tuning" / "Attention Mechanisms" 등 세분화된 연구 분야임.

### 2. fieldsOfStudy 레이블링의 약점

**문제**: `label_clusters()` 메서드가 Semantic Scholar의 `fieldsOfStudy` 빈도로 레이블 생성. 이 필드는 매우 조잡한 분류 (예: "Computer Science", "Mathematics")로, 연구 주제의 실질적 차이를 반영하지 못함.

**해결**: TF-IDF 기반 abstract 분석으로 "attention mechanism", "drug discovery" 등 도메인 특화 용어 추출.

### 3. 3D 좌표-클러스터 불일치 (50D vs 3D)

**현황**: v0.7.0에서 이미 수정됨 — HDBSCAN이 50D intermediate UMAP 위에서 실행. 하지만 근본적으로 UMAP 차원축소 후 클러스터링하는 것은 정보 손실을 수반.

**Leiden 장점**: 그래프 토폴로지 직접 사용 → 차원축소 불필요.

### 4. SNA 메트릭 부재

**문제**: PageRank, Betweenness Centrality 등 기본 SNA 메트릭이 계산되지 않음. 노드 크기가 citation_count만 반영.

**해결**: `network_metrics.py` 신규 모듈로 PageRank + Betweenness 계산, 노드 크기 모드 선택 UI 추가.

### 5. Gap 분석의 Structural Holes 부재

**문제**: Burt (1992)의 Structural Holes 이론이 gap 분석에 반영되지 않음. constraint 값을 통해 중개 기회(brokerage opportunity)를 측정할 수 있으나 미구현.

**해결**: `_compute_structural_holes_score()` 추가, 가중치 재조정 (structural 35%→25%, intent 15%→10%, +structural_holes 15%).

### 6. 패널 레이아웃 문제

**문제**: 좌우 패널이 동시에 열릴 때 캔버스 영역이 지나치게 축소. 특히 1200px 미만 화면에서 심각.

**해결**: 캔버스 `minWidth: 400px`, 좁은 화면에서 right drawer 열림 시 left sidebar 자동 접기.

### 7. 학술적 기준과의 괴리

VOSviewer, CiteSpace 등 표준 서지학 도구는 인용 네트워크의 그래프 토폴로지를 기반으로 군집화:
- **Louvain/Leiden**: modularity 최적화
- **Co-citation**: 같이 인용되는 논문들
- **Bibliographic coupling**: 같은 논문을 인용하는 논문들

현재 시스템은 의미적 유사성만으로 군집화하여 이러한 표준에서 벗어나 있었음.

---

## 학술적 SNA 원칙 리뷰

### Louvain/Leiden vs HDBSCAN 비교

| 기준 | Louvain/Leiden | HDBSCAN |
|------|---------------|---------|
| 입력 | 그래프 (노드+엣지) | 포인트 클라우드 (벡터) |
| 최적화 목표 | Modularity | 밀도 기반 클러스터 |
| 인용 관계 반영 | 직접 사용 | 무시 |
| 학술 표준 | VOSviewer, CiteSpace | 일반 ML |
| 노이즈 처리 | 모든 노드 할당 | -1 (노이즈) 가능 |
| 속도 (80 nodes) | ~10ms | ~500ms |

### Co-citation vs Bibliographic Coupling

- **Co-citation**: 논문 A와 B가 함께 인용되는 빈도 → 지적 기반(intellectual base) 유사성
- **Bibliographic coupling**: 논문 A와 B가 같은 논문을 인용 → 현재 연구 방향 유사성

이번 구현에서는 Bibliographic coupling을 채택: 기존 `citation_pairs` 데이터만으로 추가 API 호출 없이 계산 가능.

---

## SPECTER2+HDBSCAN 비판

### 임베딩 기반 한계 5가지

1. **의미적 ≠ 구조적**: 의미적으로 유사한 논문이 반드시 같은 연구 커뮤니티는 아님
2. **방향성 손실**: 인용 방향(누가 누구를 인용)이 임베딩에 반영되지 않음
3. **시간 동학 무시**: 최근 논문과 오래된 논문이 같은 공간에 매핑
4. **스케일 민감성**: UMAP 파라미터에 따라 클러스터 구조가 크게 변동
5. **해석 불가**: 왜 두 논문이 같은 클러스터인지 설명 불가능 (Leiden: "같은 인용 커뮤니티")

---

## 하이브리드 접근 구현

### 3층 그래프 구조

```
Layer 1: Citation edges (weight=1.0)
    ↓ 직접 인용 관계

Layer 2: Bibliographic coupling (weight=shared_refs/max)
    ↓ 같은 논문을 인용하는 쌍

Layer 3: Similarity edges (weight=cosine_similarity)
    ↓ SPECTER2 임베딩 유사도
```

### 3단계 Fallback

| 조건 | 전략 |
|------|------|
| total_edges >= N*0.5 | Leiden on 3-layer graph |
| total_edges < N*0.5 | HDBSCAN fallback |
| `CLUSTERING_MODE=hdbscan` | HDBSCAN 직접 |

### 성능 영향

| 단계 | 시간 |
|------|------|
| Bib coupling 계산 (80 papers) | <5ms |
| Leiden (80 nodes) | <10ms |
| TF-IDF (80 abstracts) | <50ms |
| **총 변화** | **-0.3s (개선)** |

---

## 요약 테이블

| 변경 | Before | After |
|------|--------|-------|
| 클러스터링 알고리즘 | HDBSCAN (임베딩만) | Leiden (citation + bib coupling + similarity) |
| 클러스터 레이블 | fieldsOfStudy 빈도 | TF-IDF abstract bigrams |
| SNA 메트릭 | 없음 | PageRank + Betweenness |
| Gap 차원 | 5차원 | 6차원 (+Structural Holes) |
| 노드 크기 | citations only | citations / PageRank / betweenness 선택 |
| 패널 레이아웃 | 캔버스 가림 | minWidth 400px + 자동 접기 |
| Centroid 시각화 | 없음 | 다이아몬드 마커 + 거리 레이블 |

---

## 핵심 설계 결정 요약

1. **Leiden 채택 이유**: VOSviewer/CiteSpace 표준, modularity 최적화, 인용 그래프 직접 활용
2. **Bibliographic coupling 선택 이유**: co-citation 대비 추가 API 호출 불필요 (기존 citation_pairs 활용)
3. **HDBSCAN 유지 이유**: 인용이 극소한 seed paper에서 fallback 필요
4. **TF-IDF 채택 이유**: fieldsOfStudy는 S2의 조잡한 분류, abstract는 실제 연구 내용 반영
5. **Structural Holes 추가 이유**: Burt (1992)의 중개 기회 이론이 연구 갭 분석에 직접 적용 가능
6. **환경변수 CLUSTERING_MODE**: 운영 중 A/B 테스트 및 롤백 용이
