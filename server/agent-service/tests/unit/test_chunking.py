from app.chunking import chunk_markdown


def test_heading_hierarchy_tracked():
    md = "# Top\n\nIntro\n\n## Sub\n\nBody paragraph.\n"
    chunks = chunk_markdown(md)
    sub_text = [c for c in chunks if c.kind == "text" and "Body" in c.content]
    assert sub_text, "expected a text chunk under the sub heading"
    assert sub_text[0].section_path == "Top > Sub"


def test_code_block_kept_atomic():
    md = "# Doc\n\nSome prose.\n\n```python\ndef f():\n    return 1\n```\n\nMore prose.\n"
    chunks = chunk_markdown(md)
    code = [c for c in chunks if c.kind == "code"]
    assert len(code) == 1
    assert "def f()" in code[0].content
    assert code[0].metadata.get("language") == "python"


def test_table_preserved_as_single_chunk():
    md = "# T\n\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n"
    chunks = chunk_markdown(md)
    tables = [c for c in chunks if c.kind == "table"]
    assert len(tables) == 1
    assert "| 1 | 2 |" in tables[0].content
    assert "| 3 | 4 |" in tables[0].content


def test_long_text_is_split():
    para = ("This is a sentence. " * 200).strip()
    md = f"# T\n\n{para}\n"
    chunks = chunk_markdown(md, max_tokens=100, overlap=10)
    text_chunks = [c for c in chunks if c.kind == "text"]
    assert len(text_chunks) > 1
    for c in text_chunks:
        assert c.token_count <= 150  # some slack for boundaries


def test_empty_input_returns_empty():
    assert chunk_markdown("") == []
