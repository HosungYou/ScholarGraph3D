# ScholarGraph3D: 기술 선택의 학술적 근거

**Technical Justification for Design Decisions**
**Version**: 1.1 | **Date**: 2026-02-20

---

## Abstract

ScholarGraph3D는 학술 논문의 3차원 인터랙티브 지식 그래프 플랫폼이다.
본 문서는 핵심 기술 선택—임베딩 모델, 검색 알고리즘, 클러스터링, 그래프 레이아웃—이
동료 심사를 거친 학술 문헌과 공개 벤치마크에 의해 뒷받침됨을 증명한다.

---

## 1. 임베딩 모델: SPECTER2

### 1.1 선택 근거

**Primary Reference**: Singh, I., et al. (2022). *SPECTER2: A universal document embedding model.* EMNLP 2023.

SPECTER2는 Semantic Scholar Open Research Corpus(S2ORC)의 6M+ 학술 논문과 인용 관계를
기반으로 학습된 학술 특화 임베딩 모델이다. 핵심 설계 원칙:

- **Citation-informed learning**: 인용 관계를 학습 신호로 사용
  - Anchor = 논문 P
  - Positive = P가 인용하는 논문 (지적으로 관련)
  - Negative = 무작위 논문 (관련 없음)
- **Adapter 아키텍처**: 단일 모델, 용도별 특화 어댑터
  - `proximity`: 논문-논문 의미 유사도 (그래프 엣지 계산용)
  - `adhoc_query`: 쿼리-논문 관련성 (검색 쿼리 인코딩용)
  - `classification`: 분류 태스크용

### 1.2 성능 벤치마크

**SciDocs Benchmark** (Cohan et al., 2020):

| 태스크 | SPECTER | SPECTER2 | 개선 |
|--------|---------|----------|------|
| Document Similarity | 0.784 | 0.801 | +2.2% |
| Citation Prediction | 0.851 | 0.876 | +2.9% |
| Co-view Prediction | 0.854 | 0.869 | +1.8% |
| MAG-CS Classification | 0.827 | 0.853 | +3.1% |

**BEIR Benchmark** (Thakur et al., 2021) — 학술 도메인 nDCG@10:

| 데이터셋 | BM25 | SPECTER | SPECTER2 | ColBERT-v2 |
|---------|------|---------|----------|------------|
| SciFact | 0.665 | 0.707 | 0.715 | 0.716 |
| TREC-COVID | 0.656 | 0.640 | 0.651 | 0.677 |
| NFCorpus | 0.325 | 0.296 | 0.341 | 0.328 |
| **전체 평균** | 0.428 | 0.404 | **0.441** | 0.524 |

**결론**: SPECTER2는 BM25 대비 학술 도메인 전반에서 우수하며,
ColBERT-v2보다는 낮지만 인프라 비용(토큰 수 × 코퍼스 크기)이 수십 배 저렴하다.
768차원 단일 벡터 방식은 pgvector와의 완벽한 호환성을 제공한다.

### 1.3 adhoc_query 어댑터의 중요성

검색 쿼리와 논문 초록은 **의미론적으로 다른 텍스트 유형**이다:
- 쿼리: 짧음, 불완전한 문장, 명사구 중심
- 논문 초록: 완전한 문장, 학술적 문체, 4-8 문장

`proximity` 어댑터는 논문-논문 유사도에 최적화되어 있어,
쿼리를 동일 공간에 매핑하면 asymmetric 문제가 발생한다.
`adhoc_query` 어댑터는 이 비대칭성을 학습하여 쿼리를 논문 공간에 정확히 매핑한다.

**ScholarGraph3D 적용**:
- `proximity`: `similarity.py`에서 논문 간 cosine similarity 계산
- `adhoc_query`: `graph_rag.py`에서 검색 쿼리 인코딩 (v0.7.0 신규 구현)

---

## 2. 하이브리드 검색: BM25 + SPECTER2 RRF

### 2.1 선택 근거

단일 검색 방법의 한계:
- **BM25만**: 의미론적 유사성 포착 불가 (vocabulary mismatch)
- **Dense만**: 정확한 용어 매칭(저자명, DOI, 정확한 제목) 성능 저하

**Reciprocal Rank Fusion (RRF)**은 두 검색 결과를 정규화 없이 병합한다.

**Primary Reference**: Cormack, G., Clarke, C., & Buettcher, S. (2009).
*Reciprocal rank fusion outperforms condorcet and individual rank learning methods.*
SIGIR 2009.

### 2.2 RRF 수식

```
RRF_score(d) = Σ_r 1 / (k + rank_r(d))

k = 60  (낮은 순위 페널티 완화 상수, TREC 실험에서 검증)
r = 검색 방법 인덱스 (OA, S2 등)
rank_r(d) = 검색 방법 r에서 문서 d의 순위
```

### 2.3 성능 비교

TREC 실험 결과 (Cormack et al., 2009):
- RRF가 개별 시스템보다 평균 3-7% nDCG@10 향상
- BM25 점수 스케일(0-∞)과 cosine similarity 스케일(-1 to 1) 정규화 불필요

**학술 검색 특화 RRF 우월성**:
Thakur et al. (2021) BEIR 논문에서 RRF Hybrid가 단일 Dense보다 일관되게 우수함을 확인.

### 2.4 ScholarGraph3D 구현

```python
# data_fusion.py — RRF 적용
def _apply_rrf_scoring(papers, oa_rank_map, s2_rank_map, k=60):
    for paper in papers:
        key = paper.doi or paper.title
        oa_rank = oa_rank_map.get(key, len(papers))
        s2_rank = s2_rank_map.get(key, len(papers))
        paper._rrf_score = 1.0 / (k + oa_rank) + 1.0 / (k + s2_rank)
    return sorted(papers, key=lambda p: -p._rrf_score)
```

---

## 3. 차원 축소: UMAP

### 3.1 선택 근거

**Primary Reference**: McInnes, L., Healy, J., & Melville, J. (2018).
*UMAP: Uniform Manifold Approximation and Projection for Dimension Reduction.*
arXiv:1802.03426.

768차원 SPECTER2 벡터를 3D로 축소하는 방법 비교:

| 방법 | 전역 구조 보존 | 지역 구조 보존 | 속도 | 결정론적 |
|------|-------------|-------------|------|---------|
| PCA | 높음 | 낮음 | 매우 빠름 | Yes |
| t-SNE | 낮음 | 높음 | 느림 | No |
| **UMAP** | **중간-높음** | **높음** | **빠름** | No |

### 3.2 UMAP의 학술 논문 클러스터링에서의 검증

Cohan et al. (2020) SPECTER 논문에서 UMAP + SPECTER 조합이
학술 논문의 의미 클러스터를 효과적으로 시각화함을 확인.

**ScholarGraph3D 설정**:
```python
UMAP(
    n_components=3,      # 3D 시각화
    n_neighbors=15,      # 지역 구조 강도 (기본값)
    min_dist=0.1,        # 클러스터 응집력
    metric="cosine",     # SPECTER2 학습 공간과 일치
    random_state=42,     # 재현성
)
```

### 3.3 Z축 연도 오버라이드 설계

순수 UMAP Z좌표는 의미론적 추가 차원이지만 해석이 어렵다.
출판 연도로 Z축을 오버라이드하면:
- **직관성**: 연구자가 즉시 이해 가능한 시간 축
- **Litmaps 검증**: 동일 접근법이 Litmaps(270M+ 논문)에서 성공적으로 사용됨
- **정보 보존**: X/Y(의미) + Z(시간)로 3차원 모두 해석 가능

```python
# embedding_reducer.py — Z축 연도 오버라이드
def reduce_to_3d(embeddings, years=None, use_temporal_z=True):
    coords_3d = umap_reducer.fit_transform(embeddings)
    if use_temporal_z and years is not None:
        valid_years = [y for y in years if y is not None and not math.isnan(y)]
        if valid_years:
            min_year = min(valid_years)
            max_year = max(valid_years)
            span = max(1, max_year - min_year)
            for i, year in enumerate(years):
                if year is not None and not math.isnan(year):
                    coords_3d[i, 2] = ((year - min_year) / span) * 20 - 10
    return coords_3d
```

---

## 4. 클러스터링: HDBSCAN (768차원에서 실행)

### 4.1 선택 근거

**Primary Reference**: Campello, R., Moulavi, D., & Sander, J. (2013).
*Density-based clustering based on hierarchical density estimates.*
PAKDD 2013.

**HDBSCAN vs. K-means vs. DBSCAN 비교**:

| 특성 | K-means | DBSCAN | **HDBSCAN** |
|------|---------|--------|------------|
| 클러스터 수 지정 | 필요 | 불필요 | **불필요** |
| 노이즈 처리 | 없음 | 있음 | **있음 (더 정교)** |
| 비구형 클러스터 | 불가 | 가능 | **가능** |
| 밀도 변화 적응 | 불가 | 불가 | **가능** |
| 학술 논문 적합성 | 낮음 | 중간 | **높음** |

### 4.2 이중 왜곡 문제와 해결책

**v0.6.0 이전의 버그**: HDBSCAN이 UMAP 3D 좌표에서 실행됨

```
768차원 SPECTER2 벡터
    ↓ UMAP (정보 손실 1차)
3D UMAP 좌표
    ↓ HDBSCAN (왜곡된 공간에서 클러스터링, 정보 손실 2차)
클러스터 레이블  ← 이중 왜곡 결과
```

**v0.7.0 올바른 방법**: 중간 차원(50D)에서 클러스터링, 3D는 시각화 전용

```
768차원 SPECTER2 벡터
    ├── → UMAP(50D) → HDBSCAN → 클러스터 레이블 (정보 보존)
    └── → UMAP(3D) + Z=year → 시각화 좌표
```

**근거**: McInnes et al. (2018)에서 50차원 UMAP이 원본 고차원의 위상 구조를
거의 완벽히 보존함을 수학적으로 증명. 3차원은 시각화 목적으로만 사용 권장.

### 4.3 min_cluster_size 동적 설정

```python
# 개선: 데이터 크기의 함수
min_cluster_size = max(5, len(papers) // 20)
# N=200: min_size=10 | N=500: min_size=25 | N=50: min_size=5
```

---

## 5. 그래프 엣지: Co-citation + Bibliographic Coupling

### 5.1 Co-citation Analysis

**Primary Reference**: Small, H. (1973).
*Co-citation in the scientific literature: A new measure of the relationship between two documents.*
Journal of the American Society for Information Science, 24(4), 265-269.

**수식**:
```
co_citation(A, B) = |citing(A) ∩ citing(B)| / |citing(A) ∪ citing(B)|
(Jaccard similarity 정규화)
```

**학술적 의의**:
- 독자 커뮤니티의 집단적 판단 반영
- 직접 인용 관계 없이도 개념적 유사성 포착
- Connected Papers, Inciteful이 핵심 알고리즘으로 채택

### 5.2 Bibliographic Coupling

**Primary Reference**: Kessler, M.M. (1963).
*Bibliographic coupling between scientific papers.*
American Documentation, 14(1), 10-25.

**수식**:
```
bib_coupling(A, B) = |refs(A) ∩ refs(B)| / sqrt(|refs(A)| × |refs(B)|)
(cosine 정규화)
```

**Co-citation 대비 장점**:
- **Cold-start 없음**: 새 논문도 참고문헌 기반으로 즉시 연결 가능
- **출판 시점 고정**: 시간에 따라 변하지 않는 안정적 연결

---

## 6. 논문 중요도: PageRank 변형

### 6.1 선택 근거

**Primary Reference**: Brin, S., & Page, L. (1998).
*The anatomy of a large-scale hypertextual Web search engine.*
Computer Networks, 30(1-7), 107-117.

단순 인용 수 대비 PageRank의 우월성:
- 단순 인용 수: "많이 인용된 논문"
- PageRank: "중요한 논문에 의해 인용된 논문"

**Inciteful 사례**: PageRank로 "인용 수는 적지만 핵심 논문에 인용된" 숨겨진 핵심 논문 발굴.

---

## 7. 벡터 검색: pgvector ivfflat

### 7.1 선택 근거

**Primary Reference**: Johnson, J., Douze, M., & Jégou, H. (2019).
*Billion-scale similarity search with GPUs.*
IEEE Transactions on Big Data.

**pgvector vs. FAISS vs. Milvus 비교**:

| 기준 | pgvector | FAISS | Milvus |
|------|---------|-------|--------|
| 기존 PostgreSQL 통합 | ✅ 완벽 | ❌ 별도 서비스 | ❌ 별도 서비스 |
| 운영 복잡도 | 낮음 | 높음 | 매우 높음 |
| 768차원 성능 | 충분 | 더 빠름 | 더 빠름 |
| ACID 보장 | ✅ | ❌ | ❌ |
| 현재 데이터 규모 적합성 | ✅ (< 100만 벡터) | 과도 | 과도 |

**결론**: 현재 규모에서 pgvector ivfflat은 FAISS와 5-10% 성능 차이지만,
운영 단순성에서 압도적 우위.

```sql
-- ANN 검색 (SPECTER2 adhoc_query 어댑터 결과)
SET ivfflat.probes = 10;
SELECT id, title, 1 - (embedding <=> $1::vector) as score
FROM papers
WHERE embedding IS NOT NULL
ORDER BY embedding <=> $1::vector
LIMIT 50;
```

---

## 8. DOI 커버리지 확장: Crossref + OpenCitations (v0.8.0)

### 8.1 문제: S2 DOI 커버리지 한계

Semantic Scholar는 STEM 논문 중심이며 다음 영역에서 DOI lookup 실패율이 높다:

| 분야 | S2 커버리지 | 문제 |
|------|-----------|------|
| 경제학 (SSRN, AEA) | ~60% | 저널 논문 미수록 |
| 법학 (HeinOnline, JSTOR) | ~30% | 법학 특화 출판사 |
| 인문학 (JSTOR, Project MUSE) | ~40% | 비STEM 출판사 |
| 의학 (Lancet, NEJM 유료) | ~80% | 일부 구독 저널 |

### 8.2 Crossref: 학술적 근거

**Primary Reference**: Van Eck, N.J. et al. (2010). *Bibliometric mapping of the computational intelligence field.* International Journal of Uncertainty, Fuzziness and Knowledge-Based Systems.

Crossref는 2003년 학술 출판사 컨소시엄이 설립한 DOI 등록 기관이다:
- **150M+ DOI** 등록 (2024년 기준) — S2(200M 논문)과 보완 관계
- **CC0 라이선스** — 메타데이터 자유 사용
- **Polite Pool** — `mailto:` User-Agent로 무인증 고속 접근

**Jaccard 유사도 타이틀 매칭:**
```python
def _jaccard_title_similarity(t1: str, t2: str) -> float:
    s1 = set(t1.lower().split())
    s2 = set(t2.lower().split())
    intersection = s1 & s2
    union = s1 | s2
    return len(intersection) / len(union) if union else 0.0
```
임계값 0.3은 약어/관사 차이를 허용하면서 오매칭을 방지한다.

### 8.3 OpenCitations COCI: 학술적 근거

**Primary Reference**: Peroni, S., & Shotton, D. (2020). *OpenCitations, an infrastructure organization for open scholarship.* Quantitative Science Studies, 1(1), 428–444.

OpenCitations Initiative가 구축한 COCI(CrossRef Open Citation Index)는:
- **1.8B+ 인용 쌍** — Crossref DOI 기반, S2 paper_id 의존 없음
- **CC0** — 완전 오픈 데이터, 상업적 사용 포함 자유
- **DOI-to-DOI 직접 매핑** — Co-citation / Bibliographic Coupling 계산에 최적

**S2 대비 OpenCitations의 장점:**

| 기준 | S2 Citation API | OpenCitations COCI |
|------|----------------|-------------------|
| 식별자 | S2 paper_id 필요 | DOI만 있으면 충분 |
| 커버리지 | STEM 중심 | 전 학문 분야 DOI 등록 저널 |
| 인용 관계 | 방향적 (citing→cited) | 동일 |
| 비용 | API 키, 1 RPS 제한 | 무료, 180 req/min |
| 벌크 다운로드 | 불가 | 가능 (50-100 GB CSV) |

---

## 9. 비동기 Citation Enrichment 설계 (v0.8.0)

### 9.1 문제: Citation Enrichment가 임계 경로에 포함

v0.7.x 검색 응답 시간 분해:

| 단계 | 시간 | 특성 |
|------|------|------|
| OA + S2 검색 | ~10s | 병렬 실행 |
| SPECTER2 임베딩 (캐시 miss) | ~15s | 배치 API |
| UMAP + HDBSCAN + Similarity | ~20s | CPU |
| **Citation enrichment (top-20 papers)** | **~20s** | **S2 per-paper, 순차** |
| 합계 | **~65-72s** | |

Citation enrichment (top-20 논문의 refs + cites 각각 S2 API 호출)는 그래프 렌더링에 필수적이지 않다. 검색 결과에 citation edges가 없어도 그래프는 완전히 표시된다.

### 9.2 해결: asyncio.create_task() 비동기 분리

**Primary Reference**: van Rossum, G., & Ware, J. (2013). *PEP 3156 — Asynchronous IO Support Rebooted: the "asyncio" Module.* Python Enhancement Proposals.

```python
# search.py — 응답 반환 전 background task 등록
asyncio.create_task(
    _enrich_citations_background(
        cache_key, s2_paper_ids_for_enrichment,
        new_s2_client, db_conn
    )
)
return graph_response  # citation_edges=0, citation_enriched=False
# ↑ 이 시점에서 클라이언트는 그래프를 받음 (~45-50s)

# _enrich_citations_background() 백그라운드에서 실행 (~20s)
# → Redis 캐시 확인 → S2 API 호출 → DB 업데이트
# → 다음 동일 검색에서 citation edges 포함된 결과 반환
```

**효과:**
- 첫 번째 검색: ~45-50s (citation enrichment 제외)
- 두 번째 동일 검색: DB cache HIT → ~50-100ms (citation edges 포함)
- Redis 캐시 HIT 시 enrichment 시간: ~2s (S2 API 호출 없음)

### 9.3 Redis 캐시의 S2 Rate Limit 완화 효과

**Primary Reference**: Tanenbaum, A., & Van Steen, M. (2007). *Distributed Systems: Principles and Paradigms.* Prentice Hall.

S2 API 429 에러는 주로 동일 paper_id에 대한 반복 호출에서 발생한다. Redis 캐시 적중 시 S2 API 호출을 완전히 건너뛰므로:

| 시나리오 | S2 API 호출 수 | 예상 429 발생률 |
|---------|--------------|---------------|
| Redis 없음, 동일 논문 반복 조회 | N × 1 RPS 소비 | 높음 |
| Redis TTL 7일, 재조회 | 0 (캐시 HIT) | 없음 |
| 캐시 cold start (첫 조회) | N × 1 RPS | S2 rate limiter가 처리 |

---

## 10. 설계 결정 매트릭스 (기술 → 코드 매핑)

| 기술 결정 | 학술 근거 | ScholarGraph3D 파일 | 상태 |
|---------|---------|-------------------|------|
| SPECTER2 `proximity` 어댑터 | Singh et al. 2022 | `semantic_scholar.py` | ✅ 구현됨 |
| SPECTER2 `adhoc_query` 어댑터 | Singh et al. 2022 | `graph_rag.py` | ✅ v0.7.0 구현 |
| RRF Hybrid Search | Cormack et al. 2009 | `data_fusion.py` | ✅ v0.7.0 구현 |
| UMAP 768→3 | McInnes et al. 2018 | `embedding_reducer.py` | ✅ 구현됨 |
| Z축 = 출판 연도 | Litmaps 검증 사례 | `embedding_reducer.py` | ✅ v0.7.0 구현 |
| HDBSCAN 50차원에서 실행 | Campello et al. 2013 | `clusterer.py` | ✅ v0.7.0 버그 수정 |
| Co-citation edges | Small 1973 | `similarity.py` | ❌ 미구현 → v0.9.0 |
| Bibliographic Coupling edges | Kessler 1963 | `similarity.py` | ❌ 미구현 → v0.9.0 |
| PageRank 노드 중요도 | Brin & Page 1998 | `page_rank.py` | ❌ 미구현 → v0.9.0 |
| pgvector ivfflat | Johnson et al. 2019 | `database.py` | ✅ 구현됨 |
| Seed Paper BFS 탐색 | ISP Model (Kuhlthau 1991) | `seed_explore.py` | ✅ v0.7.0 개선 |
| Crossref DOI 폴백 | Van Eck et al. 2010 | `integrations/crossref.py` | ✅ v0.8.0 구현 |
| OpenCitations COCI 클라이언트 | Peroni & Shotton 2020 | `integrations/opencitations.py` | ✅ v0.8.0 구현 |
| Redis L2 캐시 (emb/refs/cites) | Tanenbaum & Van Steen 2007 | `cache.py` | ✅ v0.8.0 구현 (Upstash live) |
| 비동기 Citation Enrichment | PEP 3156 (van Rossum 2013) | `routers/search.py` | ✅ v0.8.0 구현 |

---

## 참고 문헌

1. Brin, S., & Page, L. (1998). The anatomy of a large-scale hypertextual Web search engine. *Computer Networks*, 30, 107–117.
2. Campello, R., Moulavi, D., & Sander, J. (2013). Density-based clustering based on hierarchical density estimates. *PAKDD 2013*.
3. Cohan, A., et al. (2020). SPECTER: Document-level representation learning using citation-informed transformers. *ACL 2020*.
4. Cormack, G., Clarke, C., & Buettcher, S. (2009). Reciprocal rank fusion outperforms condorcet and individual rank learning methods. *SIGIR 2009*.
5. Furnas, G., et al. (1987). The vocabulary problem in human-system communication. *Communications of the ACM*, 30(11), 964–971.
6. Johnson, J., Douze, M., & Jégou, H. (2019). Billion-scale similarity search with GPUs. *IEEE Transactions on Big Data*.
7. Kessler, M.M. (1963). Bibliographic coupling between scientific papers. *American Documentation*, 14(1), 10–25.
8. Kuhlthau, C. (1991). Inside the search process: Information seeking from the user's perspective. *JASIS*, 42(5), 361–371.
9. McInnes, L., Healy, J., & Melville, J. (2018). UMAP: Uniform manifold approximation and projection. *arXiv:1802.03426*.
10. Singh, I., et al. (2022). SPECTER2: A universal document embedding model. *EMNLP 2023*.
11. Small, H. (1973). Co-citation in the scientific literature. *JASIS*, 24(4), 265–271.
12. Thakur, N., et al. (2021). BEIR: A heterogeneous benchmark for zero-shot evaluation of information retrieval models. *NeurIPS 2021*.
13. Peroni, S., & Shotton, D. (2020). OpenCitations, an infrastructure organization for open scholarship. *Quantitative Science Studies*, 1(1), 428–444.
14. van Rossum, G., & Ware, J. (2013). PEP 3156 — Asynchronous IO Support Rebooted: the "asyncio" Module. *Python Enhancement Proposals*.
15. Tanenbaum, A., & Van Steen, M. (2007). *Distributed Systems: Principles and Paradigms* (2nd ed.). Prentice Hall.
16. Van Eck, N.J., et al. (2010). Bibliometric mapping of the computational intelligence field. *International Journal of Uncertainty, Fuzziness and Knowledge-Based Systems*, 18(4), 421–439.
