# desktop — Electron 桌面壳

加载前端 web 版的最小 Electron 壳(主进程仅 `main.js`,无预加载/IPC)。

两种目标,由 `DESKTOP_URL` 环境变量区分:

- 以 `http(s)://` 开头 → `win.loadURL(...)`(**dev 模式**,连 Metro dev server)
- 其余按路径处理 → **dist 模式**,主进程起一个 `127.0.0.1` 随机端口的内嵌静态服务托管 `dist/`,窗口加载 `http://127.0.0.1:<port>/`

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

# 开 Electron 窗口(内嵌静态服务加载 dist/,站内导航正常)
cd frontend && npm run desktop:dist
```

`desktop:dist` 即 `DESKTOP_URL=../frontend/dist/index.html electron ../desktop/main.js`。路径以 `desktop/main.js` 所在目录为基准解析(main.js 内部显式 `path.resolve(__dirname, target)` 锚定,指向文件则取其所在目录为静态根),与 shell 的 cwd 无关。

原理:dist 模式**不再用 `loadFile`**——file:// 页面是 opaque origin,expo-router 会把站内 `<Link>` 判为外部链接走 `window.location` 整页硬导航,`file:///history` 在磁盘上不存在 → ERR_FILE_NOT_FOUND 白屏。改为 node 内置 `http` 起极简静态服务(SPA fallback:非存在文件一律回 index.html,与 docker/nginx.conf 的 `try_files ... /index.html` 行为一致),硬导航目标不再 404,站内导航正常;服务随窗口关闭而关闭,应用代码零改动。

## 说明

- 窗口 1280x800,标题「vn-demo 回测」。
- 所有窗口关闭即退出应用(全平台一致,darwin 不保留 dock 常驻的简化处理)。
- 环境约定 macOS 优先;`desktop:dist` 的内联 `VAR=x cmd` 写法依赖 POSIX sh,Windows 需 cross-env(暂未引入)。
