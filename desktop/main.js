// Electron 桌面壳:dev 模式加载 expo web dev server(http);dist 模式经内嵌静态服务加载静态导出
const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");

// dist 产物涉及的 MIME 类型(极简表,未命中一律回 octet-stream)
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// 为什么不能 loadFile:file:// 页面运行在 opaque origin,expo-router 会把站内 <Link>
// 判为外部链接而走 window.location 整页硬导航;/history 这类路由在磁盘上并无对应文件,
// 硬导航直接 ERR_FILE_NOT_FOUND 白屏(pushState 本身不抛错,坏在硬导航这一步)。
// 因此起一个 127.0.0.1 随机端口的极简静态服务,SPA fallback(非存在文件一律回 index.html)
// 对齐 docker/nginx.conf 的 try_files $uri $uri.html $uri/ /index.html,应用代码零改动。
function startStaticServer(root) {
  const server = http.createServer((req, res) => {
    try {
      // 只取 pathname 丢弃 query/hash;decode 失败(畸形 % 序列)则用原始串
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      } catch {
        pathname = new URL(req.url, "http://localhost").pathname;
      }
      // 防目录穿越:解析结果必须仍落在 root 内,否则按不存在处理
      const resolved = path.resolve(root, "." + pathname);
      let servePath = resolved;
      if (
        (!resolved.startsWith(root + path.sep) && resolved !== root) ||
        !fs.existsSync(servePath) || fs.statSync(servePath).isDirectory()
      ) {
        servePath = path.join(root, "index.html"); // SPA fallback
      }
      const body = fs.readFileSync(servePath);
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(servePath).toLowerCase()] ?? "application/octet-stream",
      });
      res.end(body);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(String(err));
    }
  });
  // listen(0) → 随机空闲端口,仅绑定回环地址不对外暴露
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function createWindow() {
  const target = process.env.DESKTOP_URL ?? "http://localhost:8081";
  let url = target;
  let server = null;
  if (!target.startsWith("http")) {
    // dist 模式:DESKTOP_URL 指向 index.html(文件)或 dist 目录,统一取静态根目录
    const resolved = path.resolve(__dirname, target);
    const root =
      fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()
        ? resolved
        : path.dirname(resolved);
    server = await startStaticServer(root);
    url = `http://127.0.0.1:${server.address().port}/`;
    console.log(`[vndemo] dist 模式:静态服务 ${root} → ${url}`);
  }
  const win = new BrowserWindow({ width: 1280, height: 800, title: "vn-demo 回测" });
  // 静态服务随窗口关闭而关闭
  if (server) win.on("closed", () => server.close());
  // 加载失败诊断(dev server 未起/静态产物缺失):终端输出 URL 与错误码,便于排查
  win.webContents.on("did-fail-load", (_e, code, desc, u) =>
    console.error("[vndemo] load failed:", u, code, desc));
  win.loadURL(url);
}

app.whenReady().then(createWindow);
// 全平台一致:窗口全关即退出(darwin 不保留 dock 常驻,简化处理)
app.on("window-all-closed", () => app.quit());
