# frontend — Expo 前端 + 双壳共享层(Expo Router 三页 + Lightweight Charts + 琥珀终端 UI)

Expo(React Native)跑 iOS/Android/Web;本目录同时是**双壳共源**的共享层——`desktop/`(react-native-macos 壳)经 Metro watchFolders 直接复用本目录的 `src/`(api/charts/components/ui/screens 均无 expo-router 依赖)。

页面:配置页(`/`,表单 + 动态参数区)→ 结果页(`/result/[id]`,K 线 + EMA 叠加 + MACD/KDJ 副图 + 指标卡片 + 成交列表)→ 历史页(`/history`,回测记录列表)。视觉 = 琥珀行情终端(`global.css` Tailwind v4 `@theme` token + `src/ui/` shadcn 风格组件 + 终端状态行)。API 类型按设计 spec §8 手写于 `src/api/types.ts`(与 `src/api/schema.json` openapi 导出对齐)。

## 安装

```bash
cd frontend
npm install    # Node 18+
```

## 测试

```bash
npm test               # jest + @testing-library/react-native(146 tests,含 desktop 壳纯逻辑)
npx tsc --noEmit       # TypeScript strict 类型检查
```

## Web

```bash
# 开发模式(:8081,热更新;需后端 :8000 已启动)
npx expo start --web

# 静态导出(dist/,任意静态服务器可托管;SPA fallback 见 docker/nginx.conf)
npx expo export -p web
```

## 桌面端

桌面为 react-native-macos 原生 app,见 `../desktop/README.md`:

```bash
cd ../desktop
npm install && npm run macos
```

## 排障:配置页「策略元数据加载失败」

页面现在会显示真实原因。最常见的两种:

1. **后端未启动** → 另开终端:`cd backend && uv run uvicorn app.main:app`(验证:`curl --noproxy '*' 127.0.0.1:8000/healthz` 返回 `{"status":"ok"}`)
2. **系统代理劫持 localhost** → 本机已实锤代理会拦截 127.0.0.1:在代理软件中把 `localhost/127.0.0.1` 加入直连白名单,或临时关闭系统代理后刷新页面

其他:EXPO_PUBLIC_API_BASE 指向错误(改 env 后需重启 dev server / 重建 Docker 镜像);端口被占用。
