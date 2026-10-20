# app/api/backtests.py
"""回测执行与历史端点:POST 同步执行落库,GET/DELETE 走 repo(操作不可达 → 404)。"""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, sessionmaker

import app.engine.service as svc
from app.api.deps import resolve_session_factory
from app.api.schemas import BacktestRequest
from app.core.errors import AppError, ErrorCode
from app.db.repo import delete_run, get_run, list_runs, save_run

router = APIRouter(prefix="/api/v1")

# POST 响应显式挑字段:stats_raw 含 vnpy 原生对象非 JSON 安全,且不在 spec §8 契约
_RESULT_KEYS = ("request", "metrics", "curves", "candles", "trades")

# Annotated 写法(ruff B008 不容忍默认值函数调用);resolve_session_factory 请求期解析
# app.main.get_session_factory,monkeypatch 该模块属性即对全部路由生效
FactoryDep = Annotated[sessionmaker[Session], Depends(resolve_session_factory)]


@router.post("/backtests")
def run_backtest(req: BacktestRequest, factory: FactoryDep) -> dict:
    result = svc.execute_backtest(req.model_dump())  # AppError → 统一 handler,其余异常 → 500 INTERNAL
    run_id = uuid.uuid4().hex
    with factory() as s:
        save_run(s, result, run_id)
        s.commit()
    return {"id": run_id, **{k: getattr(result, k) for k in _RESULT_KEYS}}


@router.get("/backtests")
def list_backtests(factory: FactoryDep,
                   page: int = Query(default=1, ge=1),
                   page_size: int = Query(default=20, ge=1, le=100)) -> dict:
    with factory() as s:
        items, total = list_runs(s, page, page_size)
    return {"items": items, "total": total}


@router.get("/backtests/{run_id}")
def get_backtest(run_id: str, factory: FactoryDep) -> dict:
    with factory() as s:
        run = get_run(s, run_id)
    if run is None:
        raise AppError(ErrorCode.RUN_NOT_FOUND, f"回测不存在: {run_id}", status=404)
    return run


@router.delete("/backtests/{run_id}", status_code=204)
def delete_backtest(run_id: str, factory: FactoryDep) -> None:
    with factory() as s:
        if not delete_run(s, run_id):
            raise AppError(ErrorCode.RUN_NOT_FOUND, f"回测不存在: {run_id}", status=404)
        s.commit()
