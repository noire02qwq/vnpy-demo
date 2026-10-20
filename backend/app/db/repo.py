# app/db/repo.py
"""runs 表读写:save_run 落全量(不含 stats_raw,非 JSON 安全),list_runs 只回摘要。"""
import json
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import RunModel


def save_run(session: Session, result: Any, run_id: str) -> None:
    full = {
        "id": run_id,
        "request": result.request,
        "metrics": result.metrics,
        "curves": result.curves,
        "candles": result.candles,
        "trades": result.trades,
    }
    session.add(RunModel(id=run_id, request_json=json.dumps(result.request, ensure_ascii=False),
                         result_json=json.dumps(full, ensure_ascii=False, default=str)))


def _to_full(row: RunModel) -> dict:
    return json.loads(row.result_json)


def get_run(session: Session, run_id: str) -> dict | None:
    row = session.get(RunModel, run_id)
    return _to_full(row) if row else None


def list_runs(session: Session, page: int, page_size: int) -> tuple[list[dict], int]:
    q = session.query(RunModel).order_by(RunModel.created_at.desc())
    total = q.count()
    rows = q.offset((page - 1) * page_size).limit(page_size).all()
    items = []
    for row in rows:
        req = json.loads(row.request_json)
        full = _to_full(row)
        items.append({"id": row.id, "created_at": row.created_at.isoformat(),
                      "request": req, "metrics": full["metrics"]})
    return items, total


def delete_run(session: Session, run_id: str) -> bool:
    row = session.get(RunModel, run_id)
    if not row:
        return False
    session.delete(row)
    return True
