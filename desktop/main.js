// Electron 桌面壳:dev 模式加载 expo web dev server(http),dist 模式加载静态导出(file://)
const { app, BrowserWindow } = require("electron");
const path = require("node:path");

function createWindow() {
  const win = new BrowserWindow({ width: 1280, height: 800, title: "vn-demo 回测" });
  const target = process.env.DESKTOP_URL ?? "http://localhost:8081";
  // 加载失败诊断(dev server 未起/静态产物缺失):终端输出 URL 与错误码,便于排查
  win.webContents.on("did-fail-load", (_e, code, desc, url) =>
    console.error("[vndemo] load failed:", url, code, desc));
  // http(s) 走 loadURL,其余路径走 loadFile;loadFile 相对路径默认按 app 根目录解析,
  // 这里显式锚定 __dirname(main.js 所在的 desktop/),免受启动 cwd 影响
  if (target.startsWith("http")) win.loadURL(target);
  else win.loadFile(path.resolve(__dirname, target));
}

app.whenReady().then(createWindow);
// 全平台一致:窗口全关即退出(darwin 不保留 dock 常驻,简化处理)
app.on("window-all-closed", () => app.quit());
