# app/main.py
"""FastAPI 装配:路由挂载 + CORS + 统一错误处理 + SQLite 会话工厂(测试 monkeypatch 本模块函数注入)。"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, sessionmaker

from app.api.backtests import router as backtests_router
from app.api.data import router as data_router
from app.api.meta import router as meta_router
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.db.session import init_session_factory

app = FastAPI(title="vn-demo backend", version="0.1.0")

# demo 前端(默认 http://localhost:8081)跨域访问;白名单经 VNDEMO_CORS_ORIGINS 收紧
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_session_factory() -> sessionmaker[Session]:
    """默认 data/backtest.db 工厂;每次请求新建(SQLite 廉价,Task 18 决策),可 monkeypatch。"""
    return init_session_factory(get_settings().data_dir / "backtest.db")


install_error_handlers(app)
app.include_router(data_router)
app.include_router(backtests_router)
app.include_router(meta_router)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
