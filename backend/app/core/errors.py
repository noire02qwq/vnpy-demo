from enum import StrEnum
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ErrorCode(StrEnum):
    INVALID_SYMBOL = "INVALID_SYMBOL"
    NO_DATA = "NO_DATA"
    RANGE_TOO_SHORT = "RANGE_TOO_SHORT"
    RATE_LIMITED = "RATE_LIMITED"
    BAD_PARAMS = "BAD_PARAMS"
    RUN_NOT_FOUND = "RUN_NOT_FOUND"
    INTERNAL = "INTERNAL"


class AppError(Exception):
    def __init__(self, code: ErrorCode, message: str, *, status: int = 400, detail: Any = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.detail = detail


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content={"code": exc.code, "message": exc.message, "detail": exc.detail})

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # pydantic/FastAPI 默认 422 → spec §8 统一 400 BAD_PARAMS;detail 只留 loc/msg,免序列化坑
        detail = [{"loc": ".".join(map(str, e["loc"])), "msg": e["msg"]} for e in exc.errors()]
        return JSONResponse(status_code=400,
                            content={"code": ErrorCode.BAD_PARAMS, "message": "请求参数不合法", "detail": detail})

    @app.exception_handler(Exception)
    async def handle_unexpected(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=500, content={"code": ErrorCode.INTERNAL, "message": str(exc), "detail": None})
