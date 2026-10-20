# app/data/yahoo.py
"""Yahoo 日频抓取(生产 downloader);测试注入假 downloader,禁止真实联网。"""
from collections.abc import Callable
from datetime import date, timedelta

import pandas as pd

from app.core.errors import AppError, ErrorCode
from app.data.validate import check_symbol, validate_ohlcv

Downloader = Callable[[str, date, date], pd.DataFrame]


def _flatten_columns(df: pd.DataFrame) -> pd.DataFrame:
    """yfinance 单标的也返回 MultiIndex 列(Price, Ticker) → 统一取第一层。"""
    if isinstance(df.columns, pd.MultiIndex):
        df = df.copy()
        df.columns = df.columns.get_level_values(0)
    return df


def default_downloader(symbol: str, start: date, end: date) -> pd.DataFrame:
    import yfinance as yf

    # yfinance 1.7.0: auto_adjust=True 复权 OHLC、progress=False 静默、end 不含当天故 +1 天。
    df = yf.download(symbol, start=start, end=end + timedelta(days=1), auto_adjust=True, progress=False)
    if df is None:  # 1.7.0 返回 Optional[DataFrame]:None 映射为空表 → fetch_daily 抛 NO_DATA 404
        return pd.DataFrame()
    return _flatten_columns(df)


def fetch_daily(
    symbol: str,
    start: date,
    end: date,
    *,
    downloader: Downloader | None = None,
    warmup_bars: int = 100,
) -> pd.DataFrame:
    check_symbol(symbol)
    dl = downloader or default_downloader
    df = dl(symbol, start, end)
    if df is None or df.empty:
        raise AppError(ErrorCode.NO_DATA, "区间内无数据", status=404, detail={"symbol": symbol})
    return validate_ohlcv(_flatten_columns(df), symbol, warmup_bars)
