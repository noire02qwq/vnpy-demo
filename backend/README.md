# vn-demo backend

基于 FastAPI + vnpy 4.5.0 CTA 回测引擎的后端服务:程序化驱动 vnpy 回测、指标计算、SQLite 落库与 REST API。

## 安装

```bash
uv sync
```

> 若 `ta-lib` 编译失败,先安装系统库再重试:`brew install ta-lib`(macOS)。

## 测试

```bash
uv run pytest        # 当前 68 passed
uv run ruff check app tests
```

## 运行

```bash
uv run uvicorn app.main:app --reload   # http://127.0.0.1:8000
```

- API 统一前缀:`/api/v1`
- 交互式 API 文档(Swagger UI):`http://127.0.0.1:8000/docs`
- OpenAPI schema 导出:`openapi.json`(同步副本见 `frontend/src/api/schema.json`,供前端类型生成)
