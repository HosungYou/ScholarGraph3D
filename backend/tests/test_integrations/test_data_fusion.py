"""
Tests for DataFusionService and helper functions in integrations/data_fusion.py.

TDD RED phase: these tests define the expected behavior of data fusion logic.
Run: pytest tests/test_integrations/test_data_fusion.py -v
"""

import pytest
from unittest.mock import AsyncMock, MagicMock

from integrations.data_fusion import (
    DataFusionService,
    UnifiedPaper,
    _normalize_doi,
    _oa_work_to_unified,
    _s2_paper_to_unified,
)


# ==================== _normalize_doi ====================

class TestNormalizeDoi:
    """Unit tests for the _normalize_doi helper function."""

    def test_doi_normalization_https_prefix_stripped(self):
        """https://doi.org/ prefix must be removed."""
        result = _normalize_doi("https://doi.org/10.1234/test.001")
        assert result == "10.1234/test.001"

    def test_doi_normalization_http_prefix_stripped(self):
        """http://doi.org/ prefix must be removed."""
        result = _normalize_doi("http://doi.org/10.1234/test.001")
        assert result == "10.1234/test.001"

    def test_doi_normalization_doi_colon_prefix_stripped(self):
        """doi: prefix must be removed."""
        result = _normalize_doi("doi:10.1234/test.001")
        assert result == "10.1234/test.001"

    def test_doi_normalization_lowercased(self):
        """DOIs must be lowercased for deduplication."""
        result = _normalize_doi("10.1234/TEST.001")
        assert result == "10.1234/test.001"

    def test_doi_normalization_already_clean(self):
        """Clean DOI passes through unchanged (modulo lowercase)."""
        result = _normalize_doi("10.1234/test.001")
        assert result == "10.1234/test.001"

    def test_doi_normalization_none_returns_none(self):
        """None input returns None."""
        result = _normalize_doi(None)
        assert result is None

    def test_doi_normalization_empty_string_returns_none(self):
        """Empty string returns None (falsy → None)."""
        result = _normalize_doi("")
        assert result is None

    def test_doi_normalization_strips_whitespace(self):
        """Leading/trailing whitespace must be stripped before parsing."""
        result = _normalize_doi("  10.1234/test.001  ")
        assert result == "10.1234/test.001"

    def test_doi_normalization_url_and_uppercase_combined(self):
        """https:// prefix + uppercase → normalized to bare lowercase DOI."""
        result = _normalize_doi("https://doi.org/10.1234/TEST.PAPER")
        assert result == "10.1234/test.paper"


# ==================== DataFusionService._merge_results ====================

class TestMergeResults:
    """
    Unit tests for DataFusionService._merge_results.

    Uses MagicMock OA works and S2 papers to avoid any real HTTP calls.
    All assertions test the dedup logic, abstract fallback chain,
    and S2 enrichment applied during merging.
    """

    def _make_service(self) -> DataFusionService:
        """Create a DataFusionService with AsyncMock clients."""
        oa_client = AsyncMock()
        s2_client = AsyncMock()
        return DataFusionService(oa_client=oa_client, s2_client=s2_client)

    def _make_oa_work(
        self,
        doi: str = "10.1234/test.001",
        title: str = "Test Paper",
        abstract: str = "OA abstract here.",
        year: int = 2023,
        citation_count: int = 10,
        is_open_access: bool = True,
        oa_work_id: str = "W001",
    ) -> MagicMock:
        work = MagicMock()
        work.id = oa_work_id
        work.doi = doi
        work.title = title
        work.abstract = abstract
        work.publication_year = year
        work.citation_count = citation_count
        work.is_open_access = is_open_access
        work.open_access_url = "https://arxiv.org/abs/test" if is_open_access else None
        work.concepts = [{"display_name": "Machine Learning", "level": 1, "score": 0.9}]
        work.topics = [{"id": "T001", "display_name": "Neural Networks", "score": 0.9}]
        work.authors = [{"name": "Alice Smith", "affiliations": ["MIT"]}]
        work.primary_location = {"source": {"display_name": "NeurIPS"}}
        return work

    def _make_s2_paper(
        self,
        paper_id: str = "s2abc123",
        doi: str = "10.1234/test.001",
        title: str = "Test Paper",
        abstract: str = "S2 abstract here.",
        tldr: str = "Short summary.",
        embedding: list = None,
        year: int = 2023,
    ) -> MagicMock:
        paper = MagicMock()
        paper.paper_id = paper_id
        paper.doi = doi
        paper.title = title
        paper.abstract = abstract
        paper.year = year
        paper.citation_count = 10
        paper.tldr = tldr
        paper.embedding = embedding if embedding is not None else [0.1] * 768
        paper.fields_of_study = ["Computer Science"]
        paper.authors = [{"name": "Alice Smith"}]
        paper.venue = "NeurIPS"
        paper.is_open_access = True
        paper.open_access_pdf_url = "https://arxiv.org/abs/test"
        return paper

    # --- DOI deduplication ---

    def test_merge_deduplicates_by_doi(self):
        """
        OA and S2 papers with matching DOI must produce exactly one merged paper.
        """
        service = self._make_service()
        oa_work = self._make_oa_work(doi="https://doi.org/10.1234/test.001")
        s2_paper = self._make_s2_paper(doi="10.1234/test.001")

        merged = service._merge_results([oa_work], [s2_paper])

        assert len(merged) == 1

    def test_merge_doi_match_prefers_oa_metadata(self):
        """When DOIs match, OA citation_count and oa_work_id must be used."""
        service = self._make_service()
        oa_work = self._make_oa_work(
            doi="10.1234/test.001",
            citation_count=999,
            oa_work_id="W_PREFERRED",
        )
        s2_paper = self._make_s2_paper(doi="10.1234/test.001")

        merged = service._merge_results([oa_work], [s2_paper])

        assert merged[0].citation_count == 999
        assert merged[0].oa_work_id == "W_PREFERRED"

    def test_merge_doi_match_enriches_with_s2_tldr_and_embedding(self):
        """When DOIs match, S2 TLDR and embedding must be added to the unified paper."""
        service = self._make_service()
        oa_work = self._make_oa_work(doi="10.1234/test.001")
        s2_paper = self._make_s2_paper(
            doi="10.1234/test.001",
            paper_id="s2_enriched",
            tldr="TLDR from S2",
            embedding=[0.5] * 768,
        )

        merged = service._merge_results([oa_work], [s2_paper])

        assert merged[0].tldr == "TLDR from S2"
        assert merged[0].embedding == [0.5] * 768
        assert merged[0].s2_paper_id == "s2_enriched"

    # --- Abstract fallback chain ---

    def test_abstract_fallback_oa_first(self):
        """OA abstract must be preferred when present, ignoring S2 abstract."""
        service = self._make_service()
        oa_work = self._make_oa_work(doi="10.1234/test.001", abstract="OA abstract preferred.")
        s2_paper = self._make_s2_paper(
            doi="10.1234/test.001",
            abstract="S2 abstract ignored",
            tldr="S2 TLDR ignored",
        )

        merged = service._merge_results([oa_work], [s2_paper])

        assert merged[0].abstract == "OA abstract preferred."

    def test_abstract_fallback_s2_tldr(self):
        """
        When OA has no abstract, S2 TLDR must be used as abstract fallback.
        (abstract=None on OA, abstract=None on S2, tldr='TLDR fallback')
        """
        service = self._make_service()
        oa_work = self._make_oa_work(doi="10.1234/test.001", abstract=None)
        s2_paper = self._make_s2_paper(
            doi="10.1234/test.001",
            abstract=None,
            tldr="TLDR fallback used.",
        )
        s2_paper.abstract = None

        merged = service._merge_results([oa_work], [s2_paper])

        assert merged[0].abstract == "TLDR fallback used."

    def test_abstract_fallback_empty(self):
        """When OA abstract, S2 abstract, and TLDR are all absent, abstract is None or empty."""
        service = self._make_service()
        oa_work = self._make_oa_work(doi="10.1234/test.001", abstract=None)
        s2_paper = self._make_s2_paper(
            doi="10.1234/test.001",
            abstract=None,
            tldr=None,
        )
        s2_paper.abstract = None
        s2_paper.tldr = None

        merged = service._merge_results([oa_work], [s2_paper])

        # abstract should be falsy (None or "")
        assert not merged[0].abstract

    # --- S2-only papers ---

    def test_s2_only_papers_included(self):
        """Papers only in S2 (no matching OA DOI or title) must be in merged output."""
        service = self._make_service()
        oa_work = self._make_oa_work(doi="10.1234/oa-only.001", title="OA Only Paper")
        s2_paper = self._make_s2_paper(
            doi="10.5678/s2-only.999",
            title="S2 Only Paper",
            paper_id="s2_unique",
        )

        merged = service._merge_results([oa_work], [s2_paper])

        assert len(merged) == 2
        titles = {p.title for p in merged}
        assert "OA Only Paper" in titles
        assert "S2 Only Paper" in titles

    def test_s2_only_paper_preserves_s2_paper_id(self):
        """S2-only papers must have s2_paper_id set to the S2 paper_id value."""
        service = self._make_service()
        s2_paper = self._make_s2_paper(
            doi="10.5678/s2.999",
            title="S2 Only Paper",
            paper_id="s2_unique_id",
        )

        merged = service._merge_results([], [s2_paper])

        assert len(merged) == 1
        assert merged[0].s2_paper_id == "s2_unique_id"

    # --- DOI normalization in merge ---

    def test_doi_normalization_url_prefix_deduplicates(self):
        """
        OA DOI 'https://doi.org/10.1234/paper' and S2 DOI '10.1234/paper'
        must match and produce a single merged paper.
        """
        service = self._make_service()
        oa_work = self._make_oa_work(doi="https://doi.org/10.1234/paper.norm")
        s2_paper = self._make_s2_paper(doi="10.1234/paper.norm")

        merged = service._merge_results([oa_work], [s2_paper])

        assert len(merged) == 1

    # --- Title-based matching ---

    def test_title_based_matching(self):
        """
        Papers with same title but different DOI formats (or no DOI) must be deduped.
        """
        service = self._make_service()
        oa_work = self._make_oa_work(doi=None, title="Attention Is All You Need")
        oa_work.doi = None
        s2_paper = self._make_s2_paper(doi=None, title="Attention Is All You Need")
        s2_paper.doi = None

        merged = service._merge_results([oa_work], [s2_paper])

        assert len(merged) == 1

    # --- Empty inputs ---

    def test_empty_results(self):
        """Both APIs return empty → merged list is empty."""
        service = self._make_service()
        merged = service._merge_results([], [])
        assert merged == []

    def test_empty_s2_returns_oa_only(self):
        """When S2 returns nothing, OA papers still appear in output."""
        service = self._make_service()
        oa_work = self._make_oa_work(doi="10.1234/oa.001", title="OA Only")

        merged = service._merge_results([oa_work], [])

        assert len(merged) == 1
        assert merged[0].title == "OA Only"

    def test_empty_oa_returns_s2_only(self):
        """When OA returns nothing, S2 papers still appear in output."""
        service = self._make_service()
        s2_paper = self._make_s2_paper(doi="10.5678/s2.001", title="S2 Only")

        merged = service._merge_results([], [s2_paper])

        assert len(merged) == 1
        assert merged[0].title == "S2 Only"

    def test_multiple_oa_papers_all_included(self):
        """All OA papers must be present in merged output regardless of S2 results."""
        service = self._make_service()
        oa_works = [
            self._make_oa_work(
                doi=f"10.1234/paper.{i:03d}",
                title=f"Paper {i}",
                oa_work_id=f"W{i:04d}",
            )
            for i in range(5)
        ]

        merged = service._merge_results(oa_works, [])

        assert len(merged) == 5


# ==================== UnifiedPaper ====================

class TestUnifiedPaper:
    """Tests for the UnifiedPaper data class."""

    def test_unified_paper_defaults(self):
        """UnifiedPaper must have safe, empty defaults for list/bool fields."""
        paper = UnifiedPaper(title="Test")
        assert paper.fields_of_study == []
        assert paper.oa_topics == []
        assert paper.authors == []
        assert paper.citation_count == 0
        assert paper.is_open_access is False
        assert paper.embedding is None
        assert paper.tldr is None
        assert paper.doi is None

    def test_unified_paper_to_dict_contains_all_expected_keys(self):
        """to_dict() must include all 15 expected keys."""
        paper = UnifiedPaper(
            doi="10.1234/test",
            title="Test Paper",
            abstract="Abstract here.",
            year=2023,
            embedding=[0.1] * 5,
        )
        d = paper.to_dict()

        expected_keys = {
            "doi", "title", "abstract", "year", "venue", "citation_count",
            "fields_of_study", "oa_topics", "tldr", "embedding",
            "is_open_access", "oa_url", "authors", "s2_paper_id", "oa_work_id",
        }
        assert expected_keys.issubset(set(d.keys()))

    def test_unified_paper_to_dict_values_match_attributes(self):
        """to_dict() values must exactly match the object's attributes."""
        paper = UnifiedPaper(
            doi="10.1234/test",
            title="My Paper",
            year=2022,
            citation_count=100,
            s2_paper_id="s2abc",
            oa_work_id="W999",
        )
        d = paper.to_dict()
        assert d["doi"] == "10.1234/test"
        assert d["title"] == "My Paper"
        assert d["year"] == 2022
        assert d["citation_count"] == 100
        assert d["s2_paper_id"] == "s2abc"
        assert d["oa_work_id"] == "W999"

    def test_unified_paper_embedding_stored_correctly(self):
        """Embedding list must be preserved exactly in to_dict()."""
        emb = [float(i) / 100 for i in range(768)]
        paper = UnifiedPaper(title="Emb Paper", embedding=emb)
        assert paper.to_dict()["embedding"] == emb
        assert len(paper.embedding) == 768
