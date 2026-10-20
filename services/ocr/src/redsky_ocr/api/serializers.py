from datetime import datetime
from typing import Any


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _id(value: Any) -> str | None:
    return str(value) if value is not None else None


def serialize_extraction(extraction: dict[str, Any] | None) -> dict[str, Any] | None:
    if extraction is None:
        return None
    return {
        "id": _id(extraction["id"]),
        "status": extraction["status"],
        "requestedEngine": extraction["requested_engine"],
        "engine": extraction["engine"],
        "engineVersion": extraction["engine_version"],
        "attempts": extraction["attempts"],
        "maxAttempts": extraction["max_attempts"],
        "nextAttemptAt": _iso(extraction["run_after"]) if extraction["status"] == "queued" else None,
        "pageCount": extraction["page_count"],
        "ocrPageCount": extraction["ocr_page_count"],
        "meanOcrConfidence": extraction["mean_ocr_confidence"],
        "routing": extraction["routing"],
        "quality": extraction["quality"],
        "error": (
            {"code": extraction["error_code"], "message": extraction["error_message"]}
            if extraction["error_code"]
            else None
        ),
        "startedAt": _iso(extraction["started_at"]),
        "finishedAt": _iso(extraction["finished_at"]),
        "durationMs": extraction["duration_ms"],
        "createdAt": _iso(extraction["created_at"]),
    }


def serialize_document(
    document: dict[str, Any],
    latest: dict[str, Any] | None,
    current: dict[str, Any] | None,
) -> dict[str, Any]:
    return {
        "id": _id(document["id"]),
        "workspaceId": _id(document["workspace_id"]),
        "attachmentId": _id(document["attachment_id"]),
        "fileId": _id(document["file_id"]),
        "filename": document["filename"],
        "mimeType": document["mime_type"],
        "sizeBytes": document["size_bytes"],
        "sha256": document["sha256"],
        "linkedRecord": (
            {"object": document["linked_object"], "id": _id(document["linked_record_id"])}
            if document["linked_object"]
            else None
        ),
        "uploadedBy": {
            "userId": _id(document["uploaded_by_user_id"]),
            "workspaceMemberId": _id(document["uploaded_by_workspace_member_id"]),
        },
        "noAi": document["no_ai"],
        "status": document["status"],
        "statusReason": document["status_reason"],
        "statusMessage": document["status_message"],
        "contentAvailable": document["current_extraction_id"] is not None,
        "latestExtraction": serialize_extraction(latest),
        "currentExtraction": serialize_extraction(current),
        "createdAt": _iso(document["created_at"]),
        "updatedAt": _iso(document["updated_at"]),
    }


def serialize_page(page: dict[str, Any]) -> dict[str, Any]:
    return {
        "pageNumber": page["page_number"],
        "method": page["method"],
        "text": page["text"],
        "markdown": page["markdown"],
        "ocrConfidence": page["ocr_confidence"],
        "width": page["width"],
        "height": page["height"],
    }


def serialize_table(table: dict[str, Any]) -> dict[str, Any]:
    return {
        "index": table["table_index"],
        "pageNumber": table["page_number"],
        "rowCount": table["row_count"],
        "columnCount": table["column_count"],
        "cells": table["cells"],
        "markdown": table["markdown"],
        "caption": table["caption"],
    }


def serialize_chunk(chunk: dict[str, Any]) -> dict[str, Any]:
    return {
        "index": chunk["chunk_index"],
        "text": chunk["text"],
        "headings": chunk["headings"],
        "pageStart": chunk["page_start"],
        "pageEnd": chunk["page_end"],
    }
