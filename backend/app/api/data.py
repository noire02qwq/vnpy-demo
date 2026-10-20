# app/api/data.py
"""数据拉取端点:验证标的可拉取并返回摘要(真实数据消费在回测路径,Task 18 决策)。"""
from fastapi import APIRouter

import app.engine.service as svc
from app.api.schemas import FetchRequest
from app.core.errors import AppError, ErrorCode
from app.data.validate import check_symbol

router = APIRouter(prefix="/api/v1")


@router.post("/data/fetch")
def fetch_data(req: FetchRequest) -> dict:
    """小 warmup(0)拉取,仅回摘要;AppError(NO_DATA 等)自然冒泡到统一 handler。"""
    check_symbol(req.symbol)
    bars = svc._load_symbol_bars(req.symbol, req.start.isoformat(), req.end.isoformat(), 0)
    if not bars:
        raise AppError(ErrorCode.NO_DATA, "区间内无数据", status=404, detail={"symbol": req.symbol})
    return {
        "symbol": req.symbol,
        "rows": len(bars),
        "first_date": bars[0].datetime.strftime("%Y-%m-%d"),
        "last_date": bars[-1].datetime.strftime("%Y-%m-%d"),
        # 恒 false:bars 未透出来源信息,cache 命中探测属 YAGNI(Task 18 决策留档)
        "cache_hit": False,
    }
