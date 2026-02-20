# ScholarGraph3D v0.7.1 Release Notes

**Release Date:** February 2026
**Commit:** `884924f`
**Type:** Hotfix for v0.7.0 (Search System Redesign)

## Overview

ScholarGraph3D v0.7.1 is a targeted hotfix addressing a critical bug introduced in v0.7.0 where DOI-based paper lookup always returned a 404 error, rendering the entire Seed Paper exploration mode non-functional for DOI input. Only one file was changed in this release.

---

## Bug Fixed: DOI Lookup Always Returns 404

### Symptoms

- Entering a DOI on the homepage ("Seed Paper" mode) always showed "Paper not found"
- The DOI input field appeared functional but no paper was ever resolved
- Seed Paper exploration via DOI was completely broken for all users

### Root Cause 1: FastAPI Route Shadowing (Primary)

In `backend/routers/papers.py`, two routes conflicted due to FastAPI's route ordering rules:

- **Line 117 (catch-all):** `@router.get("/api/papers/{paper_id:path}")`
- **Line 423 (specific):** `@router.get("/api/papers/by-doi")`

FastAPI's `{paper_id:path}` converter is a greedy catch-all — it matches any path segment, including the literal string `by-doi`. Because the catch-all was registered first, all requests to `/api/papers/by-doi?doi=...` were routed to the generic `get_paper()` handler with `paper_id="by-doi"`.

The handler then called `s2_client.get_paper("by-doi")`, which dispatched:
```
GET https://api.semanticscholar.org/graph/v1/paper/by-doi → 404
```

The specific `/api/papers/by-doi` route was never reached.

### Root Cause 2: Missing S2 Client Method (Hidden)

The `by-doi` handler at line 445 called `s2_client.get_paper_by_doi(doi_clean)`, but this method does not exist on `SemanticScholarClient`. It would have raised `AttributeError` at runtime — however, it was never triggered because Root Cause 1 prevented execution from reaching this code path entirely.

### The Fix

Three targeted changes in `backend/routers/papers.py`:

1. **Route reordering:** Moved the `/api/papers/by-doi` route definition to before the `{paper_id:path}` catch-all so FastAPI matches the specific route first
2. **Correct S2 API call:** Replaced the nonexistent `s2_client.get_paper_by_doi(doi_clean)` with `s2_client.get_paper(f"DOI:{doi_clean}")`, using Semantic Scholar's standard `DOI:` prefix lookup
3. **Attribute access fix:** Updated dict-style access (`paper_data.get("paperId")`) to attribute access (`paper.paper_id`) since `get_paper()` returns a `SemanticScholarPaper` dataclass, not a raw dict

A comment was added at the catch-all route definition to document the ordering constraint and prevent future regression.

### Impact

| State | Behavior |
|-------|----------|
| Before fix | Every DOI entered in Seed Paper mode returned "Paper not found"; DOI-based exploration entirely non-functional |
| After fix | DOI lookup correctly resolves to S2 `paper_id` and routes to seed explore mode |

---

## Files Changed

### Summary
- **Modified:** 1 file
- **New:** 0 files

### Modified Files
| File | Type | Change |
|------|------|--------|
| `backend/routers/papers.py` | Backend | Move `by-doi` route before `{paper_id:path}` catch-all; replace nonexistent method with `DOI:` prefix call; fix dataclass attribute access |

---

## Technical Details

### FastAPI Route Ordering Rule

FastAPI evaluates routes in registration order. When a `{param:path}` converter is present, it matches greedily across `/` separators — making it functionally equivalent to a catch-all. Any specific routes sharing the same path prefix must be registered first.

```python
# WRONG — by-doi is shadowed by the catch-all above it
@router.get("/api/papers/{paper_id:path}")  # registered first → wins
async def get_paper(...): ...

@router.get("/api/papers/by-doi")           # never reached
async def get_paper_by_doi(...): ...

# CORRECT — specific route registered before catch-all
@router.get("/api/papers/by-doi")           # matched first for /by-doi
async def get_paper_by_doi(...): ...

@router.get("/api/papers/{paper_id:path}")  # NOTE: must stay after all specific routes
async def get_paper(...): ...
```

### Semantic Scholar DOI Lookup

S2 accepts paper lookup by DOI using the `DOI:` prefix on the standard paper endpoint:

```python
# Correct usage
paper = s2_client.get_paper(f"DOI:{doi_clean}")  # e.g. "DOI:10.1111/jems.12576"

# Returned object is a SemanticScholarPaper dataclass
paper_id = paper.paper_id   # attribute access (not dict)
title = paper.title
```

### Breaking Changes

**None.** v0.7.1 is a drop-in fix for v0.7.0. No API contracts, database schema, or frontend changes.

### Deprecations

**None.**

---

## Known Limitations

All known limitations from v0.7.0 carry forward unchanged. No new limitations introduced.

---

## Migration Guide

No migration required. Update `backend/routers/papers.py` and restart the backend server.

---

## Lessons Learned

- FastAPI `{param:path}` routes are greedy catch-alls — specific routes sharing the same prefix must always be defined before them
- Hidden bugs downstream of a primary failure may not surface until the primary is fixed; test the full call path, not just the entry point
- `get_paper()` on `SemanticScholarClient` returns a typed dataclass — use attribute access, not dict methods

---

## 한국어 요약

### ScholarGraph3D v0.7.1 핫픽스 릴리즈 노트

**릴리즈 유형:** v0.7.0 대상 긴급 버그 수정

**수정된 버그: DOI 조회 시 항상 404 오류 반환**

v0.7.0에서 홈페이지 Seed Paper 모드에 DOI를 입력하면 항상 "Paper not found" 오류가 발생하여 DOI 기반 탐색 기능 전체가 작동하지 않았습니다.

**근본 원인 1 (주요): FastAPI 라우트 순서 충돌**

`backend/routers/papers.py`에서 두 라우트가 충돌했습니다:
- `@router.get("/api/papers/{paper_id:path}")` — 모든 경로를 탐욕적으로 매칭하는 catch-all
- `@router.get("/api/papers/by-doi")` — 특정 DOI 조회 라우트

catch-all이 먼저 등록되어 있어 `/api/papers/by-doi` 요청이 `paper_id="by-doi"`로 일반 핸들러에 전달되었고, 결과적으로 Semantic Scholar API에 `paper/by-doi` 요청이 전송되어 404가 반환되었습니다.

**근본 원인 2 (숨겨진 버그): 존재하지 않는 S2 클라이언트 메서드**

DOI 핸들러가 `s2_client.get_paper_by_doi(doi_clean)`를 호출했으나 이 메서드는 `SemanticScholarClient`에 존재하지 않아 `AttributeError`가 발생했을 것입니다. 단, 원인 1로 인해 이 코드는 실행 자체가 되지 않았습니다.

**수정 내용 (변경 파일: 1개)**

1. `/api/papers/by-doi` 라우트를 `{paper_id:path}` catch-all 앞으로 이동
2. 존재하지 않는 메서드 대신 `s2_client.get_paper(f"DOI:{doi_clean}")` 사용 (S2 표준 DOI 접두사 형식)
3. 딕셔너리 방식 접근(`paper_data.get("paperId")`)을 데이터클래스 속성 접근(`paper.paper_id`)으로 수정

**영향:** 수정 전에는 DOI 입력 기반 Seed Paper 탐색 전체가 불가능했으나, 수정 후 DOI가 올바르게 S2 `paper_id`로 변환되어 탐색 모드로 정상 진입합니다.
