# 后端镜像:python:3.12-slim + uv 安装依赖(uv.lock 冻结,不带 dev 依赖与项目本身)。
# ta-lib 路线:PyPI ta-lib>=0.5 的 manylinux wheel 已捆绑 C 库,无需 apt 编译层(见 findings.md Docker(D0))。
FROM python:3.12-slim

# UV_NO_CACHE:uv 下载缓存不留在镜像层(Docker 层缓存已保证重建速度,镜像立省约 1GB)
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_LINK_MODE=copy \
    UV_NO_CACHE=1 \
    PYTHONUNBUFFERED=1

# uv 官方静态二进制,免装 pip 层
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

# 先拷贝依赖清单再装依赖:清单不变时命中层缓存,源码改动不触发重装
COPY backend/pyproject.toml backend/uv.lock ./backend/
RUN cd backend && uv sync --frozen --no-dev --no-install-project

# 应用源码(PYTHONPATH=/app/backend 使 app.main:app 可解析)
COPY backend/app ./backend/app

# 运行时:venv 优先于系统 Python;数据目录固定 /app/backend/data(compose 数据卷挂载点)
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH=/app/backend \
    VNDEMO_DATA_DIR=/app/backend/data

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
