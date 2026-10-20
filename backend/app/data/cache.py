"""按(标的,区间,下载日)缓存;复权回溯→键含下载日,禁止跨区间拼接。"""
from datetime import date, timedelta
from pathlib import Path

import pandas as pd


class ParquetCache:
    def __init__(self, root: Path, ttl_days: int) -> None:
        self.root = root
        self.ttl_days = ttl_days
        self.root.mkdir(parents=True, exist_ok=True)

    def _glob(self, symbol: str, start: date, end: date) -> list[Path]:
        return sorted(self.root.glob(f"{symbol}_{start}_{end}_*.parquet"))

    def get(self, symbol: str, start: date, end: date, today: date) -> pd.DataFrame | None:
        files = self._glob(symbol, start, end)
        if not files:
            return None
        path = files[-1]  # 文件名日期序 = 最新下载日
        stamp = path.stem.rsplit("_", 1)[-1]
        downloaded = date(int(stamp[:4]), int(stamp[4:6]), int(stamp[6:8]))
        if today - downloaded > timedelta(days=self.ttl_days):
            return None
        return pd.read_parquet(path)

    def put(self, df: pd.DataFrame, symbol: str, start: date, end: date, today: date) -> Path:
        path = self.root / f"{symbol}_{start}_{end}_{today.strftime('%Y%m%d')}.parquet"
        df.to_parquet(path)
        return path
