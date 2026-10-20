# app/data/bars.py
"""校验后的 OHLCV DataFrame → vnpy BarData 列表(日线、SMART、交易日 00:00)。"""
from pandas import DataFrame, Timestamp
from vnpy.trader.constant import Exchange, Interval
from vnpy.trader.object import BarData


def to_bar_data(df: DataFrame, symbol: str) -> list[BarData]:
    bars: list[BarData] = []
    for dt, row in df.iterrows():
        bars.append(
            BarData(
                symbol=symbol,
                exchange=Exchange.SMART,
                # pandas 3 的 iterrows 给 Timestamp,to_pydatetime() 后无 normalize;
                # 等价写法:先归一化再转 python datetime(交易日 00:00)。
                datetime=Timestamp(dt).normalize().to_pydatetime(),
                gateway_name="vndemo",
                open_price=float(row["open"]),
                high_price=float(row["high"]),
                low_price=float(row["low"]),
                close_price=float(row["close"]),
                volume=float(row["volume"]),
                interval=Interval.DAILY,
            )
        )
    return bars
