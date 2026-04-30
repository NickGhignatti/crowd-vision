from app.retrieval.pipeline import RetrievedChunk, _rrf_merge


def _chunk(cid: str, score: float = 0.0) -> RetrievedChunk:
    return RetrievedChunk(
        id=cid,
        document_id="d",
        content="",
        section_path=None,
        kind="text",
        source="s",
        score=score,
        metadata={},
    )


def test_rrf_promotes_shared_hits():
    vector = [_chunk("a"), _chunk("b"), _chunk("c")]
    keyword = [_chunk("b"), _chunk("a"), _chunk("d")]
    merged = _rrf_merge(vector, keyword)
    assert merged[0].id in {"a", "b"}, "items present in both lists should rank top"
    ids = [m.id for m in merged]
    # shared items ranked above items appearing in only one list
    assert ids.index("a") < ids.index("c")
    assert ids.index("b") < ids.index("d")


def test_rrf_scores_are_monotonic():
    merged = _rrf_merge([_chunk("a"), _chunk("b")], [_chunk("a"), _chunk("c")])
    scores = [m.score for m in merged]
    assert scores == sorted(scores, reverse=True)
