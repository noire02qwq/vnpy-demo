# desktop — Electron 桌面壳

加载前端 web 版的最小 Electron 壳(主进程仅 `main.js`,无预加载/IPC)。

两种目标,由 `DESKTOP_URL` 环境变量区分:

- 以 `http(s)://` 开头 → `win.loadURL(...)`(**dev 模式**,连 Metro dev server)
- 其余按路径处理 → `win.loadFile(...)`(**dist 模式**,加载静态导出的 `dist/index.html`,file://)

未设置 `DESKTOP_URL` 时默认 `http://localhost:8081`(expo web dev server)。

## 前置

```bash
cd frontend
npm install              # 安装依赖(含 devDependency electron)
```

## dev 模式(热更新,日常开发)

```bash
# 终端 1:起 expo web dev server
cd frontend && npm run web

# 终端 2:开 Electron 窗口(默认即连 http://localhost:8081)
cd frontend && npm run desktop
# 端口不同时显式指定:DESKTOP_URL=http://localhost:8081 npm run desktop
```

## dist 模式(静态导出,接近产物形态)

```bash
# 先导出静态 web 产物(frontend/dist/)
cd frontend && npx expo export -p web

# 开 Electron 窗口加载 dist/index.html
cd frontend && npm run desktop:dist
```

`desktop:dist` 即 `DESKTOP_URL=../frontend/dist/index.html electron ../desktop/main.js`。注意:`loadFile` 的相对路径以 `desktop/main.js` 所在目录(app 根目录)为基准解析(main.js 内部已显式 `path.resolve(__dirname, target)` 锚定),与 shell 的 cwd 无关。

## 说明

- 窗口 1280x800,标题「vn-demo 回测」。
- 所有窗口关闭即退出应用(全平台一致,darwin 不保留 dock 常驻的简化处理)。
- 环境约定 macOS 优先;`desktop:dist` 的内联 `VAR=x cmd` 写法依赖 POSIX sh,Windows 需 cross-env(暂未引入)。
