# app/data/validate.py
"""yfinance 数据校验硬闸门:脏数据不得流入回测(研究报告最高风险点)。"""
import re

import pandas as pd

from app.core.errors import AppError, ErrorCode

SYMBOL_RE = re.compile(r"^[A-Z]{1,5}(-[A-Z])?$|^\^[A-Z]{3,5}$")
REQUIRED_COLS = {"open", "high", "low", "close", "volume"}


def check_symbol(symbol: str) -> str:
    if not SYMBOL_RE.match(symbol):
        raise AppError(ErrorCode.INVALID_SYMBOL, f"无效标的: {symbol}")
    return symbol


def validate_ohlcv(df: pd.DataFrame, symbol: str, warmup_bars: int) -> pd.DataFrame:
    out = df.copy()
    out.columns = [str(c).lower() for c in out.columns]
    missing = REQUIRED_COLS - set(out.columns)
    if missing:
        raise AppError(ErrorCode.NO_DATA, f"数据缺列: {missing}", status=404, detail={"symbol": symbol})
    out = out.dropna(subset=["open", "high", "low", "close"])
    if out.empty:
        raise AppError(ErrorCode.NO_DATA, "区间内无数据", status=404, detail={"symbol": symbol})
    idx = pd.DatetimeIndex(out.index)
    if idx.tz is not None:
        idx = idx.tz_convert("America/New_York").tz_localize(None)
    out.index = idx.normalize()
    out = out[~out.index.duplicated(keep="last")].sort_index()
    if len(out) < warmup_bars + 10:
        raise AppError(
            ErrorCode.RANGE_TOO_SHORT,
            f"行数 {len(out)} 不足暖机 {warmup_bars}+10",
            status=422,
            detail={"rows": len(out), "need": warmup_bars + 10},
        )
    bad = out[
        (out.high < out[["open", "close"]].max(axis=1)) | (out.low > out[["open", "close"]].min(axis=1))
    ]
    if not bad.empty:
        raise AppError(ErrorCode.NO_DATA, "OHLC 不一致", status=422, detail={"rows": len(bad)})
    if (out["volume"] < 0).any():
        raise AppError(ErrorCode.NO_DATA, "volume 负数", status=422)
    return out[["open", "high", "low", "close", "volume"]].astype(float)
