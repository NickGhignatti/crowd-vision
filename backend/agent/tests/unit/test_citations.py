from app.citations import extract_citations, strip_hallucinated
from app.retrieval.pipeline import RetrievedChunk


def _chunk(cid: str) -> RetrievedChunk:
    return RetrievedChunk(
        id=cid,
        document_id="d-" + cid,
        content="",
        section_path=None,
        kind="text",
        source="src",
        score=0.5,
        metadata={},
    )


def test_extract_valid_and_hallucinated():
    retrieved = [_chunk("11111111-aaaa-bbbb-cccc-222222222222")]
    text = (
        "Claim one [^11111111-aaaa-bbbb-cccc-222222222222]. "
        "Claim two [^99999999-0000-0000-0000-000000000000]."
    )
    valid, hallucinated = extract_citations(text, retrieved)
    assert len(valid) == 1
    assert valid[0].chunk_id == "11111111-aaaa-bbbb-cccc-222222222222"
    assert hallucinated == ["99999999-0000-0000-0000-000000000000"]


def test_extract_dedupes():
    cid = "11111111-aaaa-bbbb-cccc-222222222222"
    retrieved = [_chunk(cid)]
    text = f"A [^{cid}]. B [^{cid}]."
    valid, _ = extract_citations(text, retrieved)
    assert len(valid) == 1


def test_strip_hallucinated_removes_markers():
    text = (
        "Good [^aaaaaaaa-1111-1111-1111-111111111111]. Bad [^bbbbbbbb-2222-2222-2222-222222222222]."
    )
    out = strip_hallucinated(text, ["bbbbbbbb-2222-2222-2222-222222222222"])
    assert "bbbbbbbb" not in out
    assert "aaaaaaaa-1111-1111-1111-111111111111" in out
