from __future__ import annotations

import re

import tiktoken
from markdown_it import MarkdownIt

from app.chunking.models import Chunk, ChunkKind

_ENC = tiktoken.get_encoding("cl100k_base")

DEFAULT_MAX_TOKENS = 400
DEFAULT_OVERLAP_TOKENS = 50


def _count_tokens(text: str) -> int:
    return len(_ENC.encode(text))


def _split_text_by_tokens(text: str, max_tokens: int, overlap: int) -> list[str]:
    """Token-bounded splitter that prefers paragraph then sentence boundaries."""
    if _count_tokens(text) <= max_tokens:
        return [text.strip()] if text.strip() else []

    parts: list[str] = []
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    buf: list[str] = []
    buf_tokens = 0

    for para in paragraphs:
        ptok = _count_tokens(para)
        if ptok > max_tokens:
            sentences = re.split(r"(?<=[.!?])\s+", para)
            for sent in sentences:
                stok = _count_tokens(sent)
                if buf_tokens + stok > max_tokens and buf:
                    parts.append("\n\n".join(buf))
                    overlap_text = parts[-1][-overlap * 4 :] if overlap else ""
                    buf = [overlap_text, sent] if overlap_text else [sent]
                    buf_tokens = _count_tokens(" ".join(buf))
                else:
                    buf.append(sent)
                    buf_tokens += stok
        else:
            if buf_tokens + ptok > max_tokens and buf:
                parts.append("\n\n".join(buf))
                buf = [para]
                buf_tokens = ptok
            else:
                buf.append(para)
                buf_tokens += ptok

    if buf:
        parts.append("\n\n".join(buf))

    return [p.strip() for p in parts if p.strip()]


def chunk_markdown(
    text: str,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    overlap: int = DEFAULT_OVERLAP_TOKENS,
) -> list[Chunk]:
    """Structure-aware markdown chunking.

    Preserves fenced code blocks and tables as atomic chunks, and keeps heading
    hierarchy in ``section_path`` so retrieval can surface where a chunk came from.
    """
    md = MarkdownIt("commonmark")
    tokens = md.parse(text)

    chunks: list[Chunk] = []
    heading_stack: list[tuple[int, str]] = []

    i = 0
    while i < len(tokens):
        tok = tokens[i]

        if tok.type == "heading_open":
            level = int(tok.tag[1])
            inline = tokens[i + 1]
            title = inline.content.strip()
            heading_stack = [(lvl, t) for (lvl, t) in heading_stack if lvl < level]
            heading_stack.append((level, title))
            section_path = " > ".join(t for _, t in heading_stack)
            chunks.append(
                Chunk(
                    content=f"{'#' * level} {title}",
                    kind="heading",
                    section_path=section_path,
                    token_count=_count_tokens(title),
                )
            )
            i += 3
            continue

        section_path = " > ".join(t for _, t in heading_stack)

        if tok.type == "fence":
            content = tok.content.rstrip()
            info = (tok.info or "").strip()
            fenced = f"```{info}\n{content}\n```"
            chunks.append(
                Chunk(
                    content=fenced,
                    kind="code",
                    section_path=section_path,
                    token_count=_count_tokens(fenced),
                    metadata={"language": info} if info else {},
                )
            )
            i += 1
            continue

        if tok.type == "table_open":
            j = i
            while j < len(tokens) and tokens[j].type != "table_close":
                j += 1
            table_md = _render_table(tokens[i : j + 1])
            chunks.append(
                Chunk(
                    content=table_md,
                    kind="table",
                    section_path=section_path,
                    token_count=_count_tokens(table_md),
                )
            )
            i = j + 1
            continue

        if tok.type in ("paragraph_open", "bullet_list_open", "ordered_list_open"):
            close_type = tok.type.replace("_open", "_close")
            j = i
            depth = 0
            while j < len(tokens):
                if tokens[j].type == tok.type:
                    depth += 1
                elif tokens[j].type == close_type:
                    depth -= 1
                    if depth == 0:
                        break
                j += 1
            block_text = _render_block(tokens[i : j + 1])
            for piece in _split_text_by_tokens(block_text, max_tokens, overlap):
                chunks.append(
                    Chunk(
                        content=piece,
                        kind="text",
                        section_path=section_path,
                        token_count=_count_tokens(piece),
                    )
                )
            i = j + 1
            continue

        i += 1

    return chunks


def _render_block(tokens) -> str:
    parts: list[str] = []
    for t in tokens:
        if t.type == "inline":
            parts.append(t.content)
        elif t.type == "list_item_open":
            parts.append("\n- ")
    return "".join(parts).strip()


def _render_table(tokens) -> str:
    rows: list[list[str]] = []
    current: list[str] = []
    in_header = False
    header_done = False
    for t in tokens:
        if t.type == "thead_open":
            in_header = True
        elif t.type == "thead_close":
            in_header = False
            header_done = True
        elif t.type == "tr_open":
            current = []
        elif t.type == "tr_close":
            rows.append(current)
            if in_header and not header_done:
                rows.append(["---"] * len(current))
        elif t.type == "inline":
            current.append(t.content.strip())
    return "\n".join("| " + " | ".join(r) + " |" for r in rows)


__all__: list[ChunkKind | str] = ["chunk_markdown"]
