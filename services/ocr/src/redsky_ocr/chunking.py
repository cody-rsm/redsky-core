from typing import TYPE_CHECKING

from redsky_ocr.engines.base import ChunkResult, PageResult

if TYPE_CHECKING:
    from docling_core.types.doc import DoclingDocument

# About 300-400 tokens: small enough to cite precisely, large enough to carry
# a whole paragraph or table row group.
MAX_CHUNK_CHARS = 1500


def chunk_pages(pages: list[PageResult], max_chars: int = MAX_CHUNK_CHARS) -> list[ChunkResult]:
    chunks: list[ChunkResult] = []
    buffer: list[str] = []
    size = 0
    page_start: int | None = None
    page_end: int | None = None

    def flush() -> None:
        nonlocal buffer, size, page_start, page_end
        if buffer:
            chunks.append(ChunkResult("\n\n".join(buffer), [], page_start, page_end))
        buffer, size, page_start, page_end = [], 0, None, None

    for page in pages:
        for paragraph in _split_paragraphs(page.text, max_chars):
            if size and size + len(paragraph) > max_chars:
                flush()
            if page_start is None:
                page_start = page.page_number
            page_end = page.page_number
            buffer.append(paragraph)
            size += len(paragraph) + 2
    flush()
    return chunks


def chunk_docling(document: "DoclingDocument", max_chars: int = MAX_CHUNK_CHARS) -> list[ChunkResult]:
    # docling-core's HierarchicalChunker would do this too, but importing it
    # pulls in tree-sitter and its code chunkers.
    from docling_core.types.doc import SectionHeaderItem, TableItem, TextItem, TitleItem

    pieces: list[ChunkResult] = []
    heading_stack: list[str] = []
    for item, _depth in document.iterate_items():
        if isinstance(item, TitleItem):
            heading_stack = [item.text.strip()]
            continue
        if isinstance(item, SectionHeaderItem):
            heading_stack = heading_stack[: item.level] + [item.text.strip()]
            continue
        if isinstance(item, TableItem):
            text = item.export_to_markdown(doc=document).strip()
        elif isinstance(item, TextItem):
            text = item.text.strip()
        else:
            continue
        if not text:
            continue
        page_numbers = [provenance.page_no for provenance in item.prov]
        headings = [heading for heading in heading_stack if heading]
        for part in _split_paragraphs(text, max_chars):
            pieces.append(
                ChunkResult(
                    part,
                    headings,
                    min(page_numbers) if page_numbers else None,
                    max(page_numbers) if page_numbers else None,
                )
            )

    # Merge neighbours under the same heading so short paragraphs do not each
    # become a chunk of their own.
    merged: list[ChunkResult] = []
    for piece in pieces:
        previous = merged[-1] if merged else None
        if (
            previous is not None
            and previous.headings == piece.headings
            and len(previous.text) + len(piece.text) + 2 <= max_chars
        ):
            previous.text = f"{previous.text}\n\n{piece.text}"
            previous.page_start = _min_page(previous.page_start, piece.page_start)
            previous.page_end = _max_page(previous.page_end, piece.page_end)
        else:
            merged.append(piece)
    return merged


def _split_paragraphs(text: str, max_chars: int) -> list[str]:
    parts: list[str] = []
    for paragraph in (part.strip() for part in text.split("\n\n")):
        while len(paragraph) > max_chars:
            cut = paragraph.rfind(" ", 0, max_chars)
            cut = cut if cut > max_chars // 2 else max_chars
            parts.append(paragraph[:cut].strip())
            paragraph = paragraph[cut:].strip()
        if paragraph:
            parts.append(paragraph)
    return parts


def _min_page(first: int | None, second: int | None) -> int | None:
    values = [value for value in (first, second) if value is not None]
    return min(values) if values else None


def _max_page(first: int | None, second: int | None) -> int | None:
    values = [value for value in (first, second) if value is not None]
    return max(values) if values else None
