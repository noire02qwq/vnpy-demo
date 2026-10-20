# tests/core/test_config_errors.py
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.core.errors import AppError, ErrorCode, install_error_handlers


def test_settings_defaults() -> None:
    s = get_settings()
    assert s.cache_ttl_days == 7
    assert s.default_benchmark == "^GSPC"
    assert s.default_slippage == 0.01
    assert s.annualization_days == 250
    assert s.cors_origins == ["*"]


def test_cors_origins_comma_split(monkeypatch: pytest.MonkeyPatch) -> None:
    """VNDEMO_CORS_ORIGINS 逗号分隔写法(field_validator 拆分)。"""
    monkeypatch.setenv("VNDEMO_CORS_ORIGINS", "http://a:8081, http://b:3000,")
    assert Settings().cors_origins == ["http://a:8081", "http://b:3000"]


def test_cors_origins_json_list(monkeypatch: pytest.MonkeyPatch) -> None:
    """pydantic-settings 对 list[str] 的原生 JSON 解析路径。"""
    monkeypatch.setenv("VNDEMO_CORS_ORIGINS", '["http://a", "http://b"]')
    assert Settings().cors_origins == ["http://a", "http://b"]


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
    body = r.json()
    assert body["code"] == "INTERNAL"
    # 固定文案,不回显 str(exc)(防内部实现细节/堆栈信息泄漏到响应体)
    assert body["message"] == "服务器内部错误"
