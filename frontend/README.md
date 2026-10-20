# frontend — Expo 前端(Expo Router 三页 + Lightweight Charts)

Expo(React Native)一套代码跑 Web 与桌面壳:配置页(`/`,表单 + 动态参数区)→ 结果页(`/result/[id]`,K 线 + EMA 叠加 + MACD/KDJ 副图 + 指标卡片 + 成交列表)→ 历史页(`/history`,回测记录列表)。API 类型按设计 spec §8 手写于 `src/api/types.ts`(与 `src/api/schema.json` openapi 导出对齐)。

## 安装

```bash
cd frontend
npm install    # Node 18+;含 devDependency electron(桌面壳用)
```

## 测试

```bash
npm test               # jest + @testing-library/react-native(109 tests)
npx tsc --noEmit       # TypeScript strict 类型检查
```

## Web

```bash
# 开发模式(:8081,热更新;需后端 :8000 已启动)
npx expo start --web

# 静态导出(dist/,可被桌面壳 dist 模式或任意静态服务器加载)
npx expo export -p web
```

## 桌面(Electron 壳,详见 ../desktop/README.md)

```bash
# dev 模式:终端 1 起 npx expo start --web,终端 2:
npm run desktop

# dist 模式:先导出静态产物,再开壳
npx expo export -p web
npm run desktop:dist
```
