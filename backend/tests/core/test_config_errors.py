# tests/core/test_config_errors.py
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode, install_error_handlers


def test_settings_defaults() -> None:
    s = get_settings()
    assert s.cache_ttl_days == 7
    assert s.default_benchmark == "^GSPC"
    assert s.default_slippage == 0.01
    assert s.annualization_days == 250


def test_app_error_response() -> None:
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/boom")
    def boom() -> None:
        # NO_DATA 在抛出处显式传 status=404(brief 约定;AppError 默认 status 仍为 400)
        raise AppError(ErrorCode.NO_DATA, "无数据", status=404, detail={"symbol": "X"})

    r = TestClient(app).get("/boom")
    assert r.status_code == 404
    body = r.json()
    assert body["code"] == "NO_DATA" and body["message"] == "无数据" and body["detail"] == {"symbol": "X"}


def test_internal_error_response() -> None:
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/crash")
    def crash() -> None:
        raise RuntimeError("x")

    # starlette ServerErrorMiddleware 调用 Exception 处理器后仍会向上抛异常,
    # 测试 500 处理器需 raise_server_exceptions=False(handler 仍执行并返回 500 JSON)
    r = TestClient(app, raise_server_exceptions=False).get("/crash")
    assert r.status_code == 500
    assert r.json()["code"] == "INTERNAL"
