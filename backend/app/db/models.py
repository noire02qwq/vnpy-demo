# app/db/models.py
"""回测历史 ORM 模型:runs 表一行存一次回测(request/metrics/result 三 JSON 文本列)。"""
from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class RunModel(Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    # SQLite DateTime 存 naive 值;utcnow() 在 3.12 弃用会产生告警,改用 naive now()(仅用于列表排序)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    request_json: Mapped[str] = mapped_column(Text)
    # 列表摘要只读 request/metrics 两列;curves/candles 大对象仅存于 result_json 供 get_run 全量读
    metrics_json: Mapped[str] = mapped_column(Text)
    result_json: Mapped[str] = mapped_column(Text)
