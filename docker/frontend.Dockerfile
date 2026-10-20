# 前端镜像:多阶段构建(node 构建 expo export 静态产物 → nginx 托管 + SPA fallback)
# 注意:EXPO_PUBLIC_API_BASE 必须构建期注入(Expo export 时内联进 bundle,运行时改无效),
#       故 ARG/ENV 置于 export 之前;构建上下文为仓库根(docker/.dockerignore 已瘦身)。

# ---- 构建阶段 ----
FROM node:20-alpine AS build
WORKDIR /app

# API 基地址构建参数(默认本机后端)
ARG EXPO_PUBLIC_API_BASE=http://localhost:8000
ENV EXPO_PUBLIC_API_BASE=$EXPO_PUBLIC_API_BASE

# 先拷贝清单装依赖(利用层缓存;npm ci 需 package-lock.json)
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

# 再拷贝源码执行静态导出(产物在 dist/)
COPY frontend/ ./
RUN npx expo export -p web

# ---- 运行阶段 ----
FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
